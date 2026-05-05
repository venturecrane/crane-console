#!/bin/bash
#
# Parallel Session Gate (PreToolUse hook)
#
# Enforces the worktree-first contract when SessionStart detected a peer.
# This is the cwd-verify gate that closes the existing P0 anti-pattern
# (verify-worktree-cwd-isolation-does-not-silently-fail): we don't trust
# EnterWorktree to have actually moved cwd — we observe it.
#
# Decision flow:
#   - No marker file present? Allow (no peer, primary-checkout mode).
#   - Tool is EnterWorktree? Allow (this is the path out).
#   - Cwd is inside .claude/worktrees/? Allow + cleanup stale marker.
#   - Otherwise? Deny with systemMessage instructing EnterWorktree.
#
# Wire protocol (Claude Code PreToolUse):
#   stdin:  JSON with .session_id, .cwd, .tool_name, .tool_input, .hook_event_name
#   stdout: JSON {"hookSpecificOutput": {"permissionDecision": "allow|deny",
#                                        "hookEventName": "PreToolUse"},
#                 "systemMessage": "..."}
#   exit 0

set -e

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null)
CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)

[ -z "$SESSION_ID" ] || [ -z "$CWD" ] && exit 0

# Find the repo toplevel from cwd. If not in a git repo, allow.
TOPLEVEL=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null) || exit 0

MARKER_FILE="$TOPLEVEL/.claude/parallel-isolation-required-$SESSION_ID"

# No marker = no peer detected at SessionStart. Allow.
if [ ! -f "$MARKER_FILE" ]; then
  exit 0
fi

# Marker present. Enforcement logic.

# Path 1: EnterWorktree call. This is the way out — let it through.
if [ "$TOOL" = "EnterWorktree" ]; then
  exit 0
fi

# Path 2: Already in a worktree. Cwd-verify gate says: trust observed state,
# not the tool's claim. Cwd must be inside .claude/worktrees/<id>/ for the
# session to be considered isolated.
case "$CWD" in
  "$TOPLEVEL/.claude/worktrees/"*)
    # Isolation observed. Marker can be retired (PostToolUse normally does
    # this, but if we got here it means the marker survived — clean it.)
    rm -f "$MARKER_FILE" 2>/dev/null || true
    exit 0
    ;;
esac

# Path 3: Marker present, not EnterWorktree, not in a worktree. Deny.
SYSTEM_MSG="[parallel-isolation] This session has a peer claude attached to the same repo. Working in the canonical checkout would contaminate the peer's working tree. Call EnterWorktree first; subsequent tools will be allowed once cwd is inside .claude/worktrees/. (Marker: $MARKER_FILE)"

jq -n --arg msg "$SYSTEM_MSG" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny"
  },
  systemMessage: $msg
}'

exit 0
