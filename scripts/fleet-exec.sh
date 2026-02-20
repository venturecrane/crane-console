#!/usr/bin/env bash
# fleet-exec.sh - Minimal per-task execution wrapper for fleet machines.
#
# Runs on the target machine. The crane launcher handles secrets, env, and
# agent config. This script only handles worktree setup and fire-and-forget
# dispatch via crane headless mode.
#
# Usage: fleet-exec.sh <task_id> <venture> <repo> <issue_number> <branch_name>

set -euo pipefail

TASK_ID="${1:?task_id required}"
VENTURE="${2:?venture required}"
REPO="${3:?repo (org/repo) required}"
ISSUE_NUMBER="${4:?issue_number required}"
BRANCH_NAME="${5:?branch_name required}"

TASK_DIR="$HOME/.crane/tasks/$TASK_ID"
REPO_NAME="${REPO#*/}"
REPO_PATH="$HOME/dev/$REPO_NAME"

# Validate repo exists locally
if [ ! -d "$REPO_PATH/.git" ]; then
  echo "Error: $REPO_PATH is not a git repo" >&2
  exit 1
fi

# Create task directory
mkdir -p "$TASK_DIR"

# Write initial status
cat > "$TASK_DIR/status.json" <<EOF
{"status":"setting_up","task_id":"$TASK_ID","issue":"$ISSUE_NUMBER","started_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

# Create worktree from origin/main (no local main dependency)
cd "$REPO_PATH"
git fetch origin main
WORKTREE_PATH="$TASK_DIR/worktree"

if git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" origin/main 2>/dev/null; then
  : # success
elif git worktree add "$WORKTREE_PATH" "$BRANCH_NAME" 2>/dev/null; then
  : # branch already exists, reuse it
else
  echo "Error: failed to create worktree for $BRANCH_NAME" >&2
  cat > "$TASK_DIR/status.json" <<EOF
{"status":"failed","task_id":"$TASK_ID","issue":"$ISSUE_NUMBER","error":"worktree creation failed","started_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
  exit 1
fi

# Install dependencies if package.json exists
if [ -f "$WORKTREE_PATH/package.json" ]; then
  (cd "$WORKTREE_PATH" && npm ci --prefer-offline > /dev/null 2>&1) || true
fi

# Fetch issue body for prompt
ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json body,title -q '.title + "\n\n" + .body')
ISSUE_TITLE=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json title -q '.title')

# Detect verify command from CLAUDE.md
VERIFY_CMD="npm run verify"
if [ -f "$WORKTREE_PATH/CLAUDE.md" ]; then
  DETECTED=$(grep -oP '(?<=`)(npm run verify|npm run test|npm test)(?=`)' "$WORKTREE_PATH/CLAUDE.md" | head -1) || true
  if [ -n "${DETECTED:-}" ]; then
    VERIFY_CMD="$DETECTED"
  fi
fi

# Build prompt (dynamic context only - static instructions from sprint-worker agent)
PROMPT="## Assignment
- Issue: #$ISSUE_NUMBER - $ISSUE_TITLE
- Worktree: $WORKTREE_PATH
- Branch: $BRANCH_NAME (already checked out)
- Repo: $REPO
- Verify command: $VERIFY_CMD

## Issue Details
$ISSUE_BODY"

# Update status to running
cat > "$TASK_DIR/status.json" <<EOF
{"status":"running","task_id":"$TASK_ID","issue":"$ISSUE_NUMBER","started_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","pid":0}
EOF

# Launch crane in headless mode and record PID
nohup crane "$VENTURE" -p "$PROMPT" > "$TASK_DIR/output.log" 2>&1 &
CRANE_PID=$!
echo "$CRANE_PID" > "$TASK_DIR/pid"

# Update status with actual PID
cat > "$TASK_DIR/status.json" <<EOF
{"status":"running","task_id":"$TASK_ID","issue":"$ISSUE_NUMBER","started_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","pid":$CRANE_PID}
EOF

echo "Dispatched task $TASK_ID (PID $CRANE_PID) for issue #$ISSUE_NUMBER"
