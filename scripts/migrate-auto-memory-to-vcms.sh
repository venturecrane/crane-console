#!/usr/bin/env bash
#
# migrate-auto-memory-to-vcms.sh
#
# Mirrors Claude Code auto-memory files (~/.claude/projects/*/memory/*.md)
# into the enterprise crane_memory corpus as VCMS notes. Idempotent via
# source_hash UPSERT (migration 0044): same hash skips, same path with
# different hash updates the existing row, new file inserts.
#
# Designed to run on any fleet machine. PR 3 wires this into the per-machine
# session-push cron so auto-memories from m16/mini/mbp27/think also flow up.
#
# Usage:
#   bash scripts/migrate-auto-memory-to-vcms.sh [--dry-run]
#
# Required env:
#   CRANE_CONTEXT_KEY  - X-Relay-Key for crane-context
#   CRANE_CONTEXT_BASE - Base URL (default: https://crane-context.automation-ab6.workers.dev)

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

CRANE_CONTEXT_KEY="${CRANE_CONTEXT_KEY:?CRANE_CONTEXT_KEY required}"
CRANE_CONTEXT_BASE="${CRANE_CONTEXT_BASE:-https://crane-context.automation-ab6.workers.dev}"

PROJECTS_ROOT="$HOME/.claude/projects"
if [[ ! -d "$PROJECTS_ROOT" ]]; then
  echo "auto-memory root not found: $PROJECTS_ROOT (no projects on this machine, exiting cleanly)"
  exit 0
fi

# yq is preferred for YAML; fall back to a small Python parser.
parse_yaml() {
  local file="$1"
  if command -v yq >/dev/null 2>&1; then
    yq -r --front-matter=extract '. // {}' "$file" 2>/dev/null || true
  else
    python3 - "$file" <<'PYEOF'
import sys, re, json
path = sys.argv[1]
text = open(path, encoding='utf-8').read()
m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
if not m:
    print('{}')
    sys.exit(0)
fm_text = m.group(1)
result = {}
for line in fm_text.splitlines():
    if ':' not in line:
        continue
    key, _, value = line.partition(':')
    key = key.strip()
    value = value.strip().strip('"').strip("'")
    if key:
        result[key] = value
print(json.dumps(result))
PYEOF
  fi
}

extract_body() {
  local file="$1"
  python3 - "$file" <<'PYEOF'
import sys, re
text = open(sys.argv[1], encoding='utf-8').read()
m = re.match(r'^---\n.*?\n---\n*', text, re.DOTALL)
print(text[m.end():] if m else text, end='')
PYEOF
}

# Map auto-memory `type` field to memory `kind`. Drop user_profile entirely.
type_to_kind() {
  case "$1" in
    feedback) echo "lesson" ;;
    project) echo "runbook" ;;
    reference) echo "runbook" ;;
    user) echo "" ;;  # drop
    *) echo "" ;;     # drop unknown types
  esac
}

# Convert "Display Name With Spaces" to kebab-case, lowercase, alnum + dash.
slugify() {
  python3 -c '
import sys, re, unicodedata
s = sys.argv[1].strip().lower()
s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
print(s[:64])' "$1"
}

# sha256 of file body (post-frontmatter content).
hash_body() {
  extract_body "$1" | shasum -a 256 | awk '{print $1}'
}

migrate_count=0
skip_count=0

while IFS= read -r -d '' file; do
  basename="$(basename "$file")"
  # Skip the index file and user_profile (per plan).
  [[ "$basename" == "MEMORY.md" ]] && continue
  [[ "$basename" == "user_profile.md" ]] && continue

  fm_json="$(parse_yaml "$file")"
  if [[ "$fm_json" == "{}" || -z "$fm_json" ]]; then
    echo "SKIP (no frontmatter): $file"
    skip_count=$((skip_count + 1))
    continue
  fi

  name_raw="$(echo "$fm_json" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(d.get("name", ""))')"
  description="$(echo "$fm_json" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(d.get("description", ""))')"
  type_raw="$(echo "$fm_json" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(d.get("type", ""))')"
  origin_session="$(echo "$fm_json" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(d.get("originSessionId", ""))')"

  if [[ -z "$name_raw" || -z "$description" || -z "$type_raw" ]]; then
    echo "SKIP (missing required fields): $file"
    skip_count=$((skip_count + 1))
    continue
  fi

  kind="$(type_to_kind "$type_raw")"
  if [[ -z "$kind" ]]; then
    echo "DROP (kind=$type_raw not memorable): $file"
    skip_count=$((skip_count + 1))
    continue
  fi

  slug="$(slugify "$name_raw")"
  source_hash="$(hash_body "$file")"
  body="$(extract_body "$file")"

  # Build the memory content: frontmatter block + body. Frontmatter follows
  # docs/memory/governance.md schema. captain_approved=false; status=draft.
  memory_content=$(cat <<EOF
---
name: $slug
description: $description
kind: $kind
scope: enterprise
owner: agent-team
status: draft
captain_approved: false
version: 1.0.0
supersedes_source:
  - $file
last_validated_on: $(date +%Y-%m-%d)
---

$body
EOF
)

  if $DRY_RUN; then
    echo "DRY-RUN would migrate: $slug (kind=$kind, hash=${source_hash:0:8}, source=$file)"
    migrate_count=$((migrate_count + 1))
    continue
  fi

  # POST to /notes; the worker's UPSERT-by-source_hash semantics handle
  # idempotent re-runs (migration 0044 + notes.ts createNote update).
  payload=$(python3 -c '
import json, sys
content = sys.argv[1]
tags = ["memory", sys.argv[2]]
source_hash = sys.argv[3]
session = sys.argv[4]
out = {
  "content": content,
  "tags": tags,
  "source_hash": source_hash,
}
if session:
  out["authored_by_session_id"] = session
print(json.dumps(out))' "$memory_content" "$kind" "$source_hash" "$origin_session")

  http_status=$(curl -sS -o /tmp/migrate-resp.json -w "%{http_code}" \
    -X POST "$CRANE_CONTEXT_BASE/notes" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload")

  if [[ "$http_status" == "201" || "$http_status" == "200" ]]; then
    echo "MIGRATED: $slug ($kind) hash=${source_hash:0:8}"
    migrate_count=$((migrate_count + 1))
  else
    echo "FAIL ($http_status): $slug — $(cat /tmp/migrate-resp.json)"
  fi
done < <(find "$PROJECTS_ROOT" -type f -name '*.md' -path '*/memory/*' -print0)

echo
echo "Done: $migrate_count migrated/upserted, $skip_count skipped/dropped."
