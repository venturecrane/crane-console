#!/usr/bin/env bash
#
# push-session-jsonls.sh
#
# Daily cron on every fleet machine. Two responsibilities:
#   1. Find Claude Code session JSONLs under ~/.claude/projects/*/<UUID>.jsonl
#      modified in the last 36 hours, gzip + base64-encode each, and POST
#      to /admin/sessions/ingest. Skips files that have not changed since
#      last push (state at ~/.crane/session-push-state.txt).
#   2. Run scripts/migrate-auto-memory-to-vcms.sh so per-machine auto-memory
#      from m16/mini/mbp27/think also flows up via source_hash UPSERT.
#
# Required env (sourced via launchd EnvironmentVariables or systemd
# EnvironmentFile from ~/.crane/session-push.env):
#   CRANE_ADMIN_KEY     - X-Admin-Key for the worker
#   CRANE_CONTEXT_KEY   - X-Relay-Key for the migrate script
#   CRANE_CONTEXT_BASE  - https://crane-context.automation-ab6.workers.dev (or staging)
#
# Exits non-zero on any push failure (caught by cron logging).

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

CRANE_ADMIN_KEY="${CRANE_ADMIN_KEY:?CRANE_ADMIN_KEY required (provision via scripts/provision-session-push.sh)}"
CRANE_CONTEXT_BASE="${CRANE_CONTEXT_BASE:?CRANE_CONTEXT_BASE required}"

PROJECTS_ROOT="$HOME/.claude/projects"
STATE_FILE="$HOME/.crane/session-push-state.txt"
mkdir -p "$(dirname "$STATE_FILE")"
touch "$STATE_FILE"

machine="$(hostname -s 2>/dev/null || hostname)"

push_count=0
skip_count=0
fail_count=0
not_found_count=0

if [[ ! -d "$PROJECTS_ROOT" ]]; then
  echo "no projects root at $PROJECTS_ROOT; nothing to push"
  not_found_count=$((not_found_count + 1))
fi

# Find JSONLs modified within 36 hours. -mtime -2 covers >= 36h on macOS;
# on Linux we use -mmin -2160 which is exact 36h; portable fallback.
if [[ -d "$PROJECTS_ROOT" ]]; then
  while IFS= read -r -d '' file; do
    # Filename pattern: <UUID>.jsonl. Strip dir + extension for session id.
    basename="$(basename "$file" .jsonl)"
    project="$(basename "$(dirname "$file")")"

    # Validate UUID-ish shape (loose check): at least 32 hex/dashes
    if ! [[ "$basename" =~ ^[a-f0-9-]{30,}$ ]]; then
      continue
    fi

    # Detect whether file changed since last push (fingerprint = mtime + size)
    fingerprint="$(stat -f '%m-%z' "$file" 2>/dev/null || stat -c '%Y-%s' "$file")"
    state_key="$basename"
    if grep -q "^${state_key}=${fingerprint}$" "$STATE_FILE"; then
      skip_count=$((skip_count + 1))
      continue
    fi

    line_count="$(wc -l < "$file" | tr -d '[:space:]')"
    source_size="$(wc -c < "$file" | tr -d '[:space:]')"
    gz_b64="$(gzip -c "$file" | base64 | tr -d '\n')"

    payload="$(python3 - <<PYEOF
import json
print(json.dumps({
  "machine": "${machine}",
  "project": "${project}",
  "claude_session_id": "${basename}",
  "content_jsonl_gz_base64": "${gz_b64}",
  "line_count": ${line_count},
  "source_size_bytes": ${source_size},
}))
PYEOF
)"

    if $DRY_RUN; then
      echo "DRY-RUN would push: machine=${machine} project=${project} session=${basename} lines=${line_count} size=${source_size}"
      push_count=$((push_count + 1))
      continue
    fi

    http_status="$(curl -sS -o /tmp/sessions-ingest-resp.json -w '%{http_code}' \
      -X POST "${CRANE_CONTEXT_BASE}/admin/sessions/ingest" \
      -H "X-Admin-Key: ${CRANE_ADMIN_KEY}" \
      -H 'Content-Type: application/json' \
      -d "${payload}")"

    if [[ "$http_status" == "201" || "$http_status" == "200" ]]; then
      # Record fingerprint so we skip on next run
      sed -i.bak "/^${state_key}=/d" "$STATE_FILE" 2>/dev/null || true
      echo "${state_key}=${fingerprint}" >> "$STATE_FILE"
      rm -f "${STATE_FILE}.bak"
      echo "PUSHED: ${basename} (machine=${machine}, project=${project})"
      push_count=$((push_count + 1))
    else
      echo "FAIL ($http_status): ${basename} - $(cat /tmp/sessions-ingest-resp.json 2>/dev/null || echo no-response)"
      fail_count=$((fail_count + 1))
    fi
  done < <(find "$PROJECTS_ROOT" -type f -name '*.jsonl' -mmin -2160 -print0 2>/dev/null || true)
fi

echo "session-push done: ${push_count} pushed, ${skip_count} skipped, ${fail_count} failed"

# Also run the auto-memory migrate script so per-machine memories flow up.
if [[ -n "${CRANE_CONTEXT_KEY:-}" ]]; then
  echo "running migrate-auto-memory-to-vcms.sh"
  bash "$(dirname "$0")/migrate-auto-memory-to-vcms.sh" $($DRY_RUN && echo --dry-run) || {
    echo "migrate-auto-memory-to-vcms.sh failed (non-fatal for push)"
  }
else
  echo "CRANE_CONTEXT_KEY not set; skipping migrate-auto-memory pass"
fi

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
exit 0
