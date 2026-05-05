#!/bin/bash
#
# Parallel Session Provisioner (PostToolUse hook on EnterWorktree)
#
# Runs after EnterWorktree creates a per-session worktree. Provisions
# node_modules into the new worktree using APFS clonefile when available,
# falling back to npm ci. Removes the parallel-isolation marker so the
# PreToolUse gate stops blocking subsequent tool calls.
#
# Provisioning strategy:
#   1. Detect APFS via diskutil. If APFS volume + node_modules exists in
#      canonical -> cp -c -R (clonefile, ~5s for 484M).
#   2. Else -> npm ci in the worktree (~30s, baseline).
#   3. Failure of either -> log + exit 0 (don't block; the worktree exists,
#      the model can resolve it manually if needed).
#
# CRITICAL: cp -c falls back silently to a regular copy on non-APFS volumes.
# We pre-check with diskutil to avoid the silent slowdown. The clone-fallback
# rate is logged for the weekly metric.
#
# Wire protocol (Claude Code PostToolUse):
#   stdin:  JSON with .session_id, .cwd (POST-EnterWorktree, the new worktree path),
#           .tool_name (will be "EnterWorktree"), .tool_input
#   stdout: ignored unless we want to inject systemMessage
#   exit 0

set -e

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)
WORKTREE_CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null)
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null)

# Only act on EnterWorktree calls.
[ "$TOOL" != "EnterWorktree" ] && exit 0
[ -z "$WORKTREE_CWD" ] && exit 0

# Resolve canonical (the parent worktree). git worktree list shows all,
# but the simplest path: the worktree's `.git` file points back to the
# main .git via gitdir. We use `git rev-parse --git-common-dir` from inside
# the worktree to get the shared .git, then derive canonical.
COMMON_DIR=$(git -C "$WORKTREE_CWD" rev-parse --git-common-dir 2>/dev/null) || exit 0
# common-dir is canonical/.git ; canonical toplevel is its parent.
CANONICAL=$(cd "$COMMON_DIR" && cd .. && pwd)

# Sanity: are we actually in a worktree? If WORKTREE_CWD == CANONICAL, the
# tool didn't isolate (the silent-failure mode). Don't provision; let the
# PreToolUse gate keep blocking.
if [ "$WORKTREE_CWD" = "$CANONICAL" ]; then
  exit 0
fi

# Logging dir.
LOG_DIR="$CANONICAL/.claude/parallel-isolation-log"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="$LOG_DIR/provision.log"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# If canonical has no node_modules, nothing to provision. Skip cleanly.
if [ ! -d "$CANONICAL/node_modules" ]; then
  echo "$TIMESTAMP session=$SESSION_ID method=skip reason=no-canonical-node_modules" \
    >> "$LOG_FILE" 2>/dev/null || true
  rm -f "$CANONICAL/.claude/parallel-isolation-required-$SESSION_ID" 2>/dev/null || true
  exit 0
fi

# If worktree already has node_modules (manual provision, retry, etc.), skip.
if [ -d "$WORKTREE_CWD/node_modules" ]; then
  echo "$TIMESTAMP session=$SESSION_ID method=skip reason=already-provisioned" \
    >> "$LOG_FILE" 2>/dev/null || true
  rm -f "$CANONICAL/.claude/parallel-isolation-required-$SESSION_ID" 2>/dev/null || true
  exit 0
fi

# Detect APFS on the canonical volume. diskutil info wants a mount point or
# disk id, not an arbitrary path, so we resolve via df first. cp -c falls
# back silently to a regular copy on non-APFS volumes; the precondition
# check is what avoids the unobserved 30s tax.
IS_APFS=0
if command -v diskutil >/dev/null 2>&1 && command -v df >/dev/null 2>&1; then
  MOUNT_POINT=$(df -P "$CANONICAL" 2>/dev/null | awk 'NR==2{print $NF}')
  if [ -n "$MOUNT_POINT" ] && diskutil info "$MOUNT_POINT" 2>/dev/null | grep -q "File System Personality:.*APFS"; then
    IS_APFS=1
  fi
fi

START=$(date +%s)
METHOD=""
RESULT="ok"

if [ "$IS_APFS" = "1" ]; then
  METHOD="cp_clonefile"
  if cp -c -R "$CANONICAL/node_modules" "$WORKTREE_CWD/node_modules" 2>/dev/null; then
    :
  else
    # Clone failed. Try npm ci as fallback.
    METHOD="npm_ci_after_clone_fail"
    if (cd "$WORKTREE_CWD" && npm ci --silent 2>/dev/null); then
      :
    else
      RESULT="failed"
    fi
  fi
else
  METHOD="npm_ci"
  if (cd "$WORKTREE_CWD" && npm ci --silent 2>/dev/null); then
    :
  else
    RESULT="failed"
  fi
fi

END=$(date +%s)
ELAPSED=$((END - START))

echo "$TIMESTAMP session=$SESSION_ID method=$METHOD result=$RESULT elapsed_s=$ELAPSED canonical=$CANONICAL worktree=$WORKTREE_CWD" \
  >> "$LOG_FILE" 2>/dev/null || true

# Marker removal: only on success. On failure, leave the marker so the model
# can see the gate is still active and can troubleshoot.
if [ "$RESULT" = "ok" ]; then
  rm -f "$CANONICAL/.claude/parallel-isolation-required-$SESSION_ID" 2>/dev/null || true
  jq -n --arg method "$METHOD" --arg elapsed "$ELAPSED" '{
    systemMessage: ("[parallel-isolation] node_modules provisioned in worktree (" + $method + ", " + $elapsed + "s). Isolation gate cleared.")
  }'
fi

exit 0
