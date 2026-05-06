#!/usr/bin/env bash
# fleet-probe.sh - Fleet probe for the EOS verification gate.
#
# Runs on a designated fleet machine (NOT the author's machine) to verify a
# PR's cross-boundary surface changes work end-to-end before merge.
#
# Companion to fleet-exec.sh; shares the same worktree+npm-ci setup pattern.
# The difference: fleet-exec dispatches a Claude session to implement an
# issue; fleet-probe runs verification probes against PR-branch surface
# changes and returns a structured pass/fail result.
#
# Usage: fleet-probe.sh <task_id> <repo> <pr_number> <branch_name>
#
# Result: writes to $HOME/.crane/probes/$TASK_ID/result.json with
#   { status: "pass" | "fail", surfaces: [...], details: {...} }
# Exit 0 on pass, 1 on fail (any surface fails), 2 on infra error.

set -euo pipefail

# Same PATH augmentation as fleet-exec.sh — sshd default PATH is sparse.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

TASK_ID="${1:?task_id required}"
REPO="${2:?repo (org/repo) required}"
PR_NUMBER="${3:?pr_number required}"
BRANCH_NAME="${4:?branch_name required}"

PROBE_DIR="$HOME/.crane/probes/$TASK_ID"
REPO_NAME="${REPO#*/}"
REPO_PATH="$HOME/dev/$REPO_NAME"
WORKTREE_PATH="$PROBE_DIR/worktree"
RESULT_FILE="$PROBE_DIR/result.json"

if [ ! -d "$REPO_PATH/.git" ]; then
  echo "Error: $REPO_PATH is not a git repo" >&2
  exit 2
fi

write_result() {
  local status="$1"
  local detail="$2"
  cat > "$RESULT_FILE" <<EOF
{"status":"$status","task_id":"$TASK_ID","pr":$PR_NUMBER,"branch":"$BRANCH_NAME","detail":$detail,"completed_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
}

cd "$REPO_PATH"

# Clean up stale worktree/branch from prior probe
if git worktree list --porcelain | grep -q "^worktree.*$WORKTREE_PATH"; then
  git worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

PROBE_BRANCH="probe/$TASK_ID"
if git branch --list "$PROBE_BRANCH" | grep -q .; then
  git branch -D "$PROBE_BRANCH" 2>/dev/null || true
fi

rm -rf "$PROBE_DIR" 2>/dev/null || true
mkdir -p "$PROBE_DIR"

git fetch origin "$BRANCH_NAME":"$PROBE_BRANCH" 2>&1 || {
  write_result "fail" '{"error":"fetch failed","branch":"'"$BRANCH_NAME"'"}'
  exit 2
}
git fetch origin main 2>&1 || true

if ! git worktree add "$WORKTREE_PATH" "$PROBE_BRANCH" 2>"$PROBE_DIR/worktree.err"; then
  write_result "fail" '{"error":"worktree creation failed","log":"'"$PROBE_DIR/worktree.err"'"}'
  exit 2
fi

cd "$WORKTREE_PATH"

# Install dependencies — fail loudly (same rationale as fleet-exec.sh)
if [ -f "$WORKTREE_PATH/package.json" ]; then
  if ! npm ci --prefer-offline > "$PROBE_DIR/npm-ci.log" 2>&1; then
    write_result "fail" '{"error":"npm ci failed","log":"'"$PROBE_DIR/npm-ci.log"'"}'
    exit 1
  fi
fi

# Compute changed surfaces from manifest + git diff
MANIFEST="$WORKTREE_PATH/config/eos-gate-surfaces.json"
if [ ! -f "$MANIFEST" ]; then
  write_result "fail" '{"error":"surface manifest missing","path":"config/eos-gate-surfaces.json"}'
  exit 1
fi

if ! node -e "JSON.parse(require('fs').readFileSync('$MANIFEST'))" 2>"$PROBE_DIR/manifest-parse.err"; then
  write_result "fail" '{"error":"surface manifest unparseable","log":"'"$PROBE_DIR/manifest-parse.err"'"}'
  exit 1
fi

# Compute the diff (changed files) PR vs origin/main
git diff --name-only "origin/main...$PROBE_BRANCH" > "$PROBE_DIR/changed-files.txt"

# Classify changed files using the manifest
node "$WORKTREE_PATH/scripts/eos-gate-classify.mjs" \
  --manifest "$MANIFEST" \
  --files "$PROBE_DIR/changed-files.txt" \
  > "$PROBE_DIR/classification.json" 2>"$PROBE_DIR/classify.err" || {
  write_result "fail" '{"error":"classification failed","log":"'"$PROBE_DIR/classify.err"'"}'
  exit 1
}

NEEDS_PROBE=$(node -e "console.log(require('$PROBE_DIR/classification.json').requires_probe)")
if [ "$NEEDS_PROBE" != "true" ]; then
  write_result "pass" '{"reason":"no surfaces requiring probe","classification":'"$(cat "$PROBE_DIR/classification.json")"'}'
  exit 0
fi

# Run tier-1 verification: skill-triplet integrity + sync-commands --check + npm run verify
PROBE_FAILED=0
PROBE_DETAILS='{'

# 1. sync-commands.sh --check (catches skill triplet drift)
if [ -f "$WORKTREE_PATH/scripts/sync-commands.sh" ]; then
  if "$WORKTREE_PATH/scripts/sync-commands.sh" --check > "$PROBE_DIR/sync-check.log" 2>&1; then
    PROBE_DETAILS+='"sync_commands_check":"pass"'
  else
    PROBE_DETAILS+='"sync_commands_check":"fail"'
    PROBE_FAILED=1
  fi
fi

# 2. npm run verify (typecheck + format + lint + test)
PROBE_DETAILS+=','
if (cd "$WORKTREE_PATH" && npm run verify > "$PROBE_DIR/verify.log" 2>&1); then
  PROBE_DETAILS+='"npm_verify":"pass"'
else
  PROBE_DETAILS+='"npm_verify":"fail"'
  PROBE_FAILED=1
fi

# 3. crane-mcp postbuild manifest (catches MCP tool registration drift)
PROBE_DETAILS+=','
if (cd "$WORKTREE_PATH" && npm run build -w @venturecrane/crane-mcp > "$PROBE_DIR/mcp-build.log" 2>&1); then
  if [ -f "$WORKTREE_PATH/config/mcp-tool-manifest.json" ]; then
    PROBE_DETAILS+='"mcp_build":"pass","mcp_manifest_present":true'
  else
    PROBE_DETAILS+='"mcp_build":"pass","mcp_manifest_present":false'
  fi
else
  PROBE_DETAILS+='"mcp_build":"fail"'
  PROBE_FAILED=1
fi

PROBE_DETAILS+=',"classification":'"$(cat "$PROBE_DIR/classification.json")"'}'

if [ "$PROBE_FAILED" -eq 0 ]; then
  write_result "pass" "$PROBE_DETAILS"
  exit 0
else
  write_result "fail" "$PROBE_DETAILS"
  exit 1
fi
