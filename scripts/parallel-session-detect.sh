#!/bin/bash
#
# Parallel Session Detector (SessionStart hook)
#
# Detects whether another claude process is already attached to this repo.
# If yes, drops a marker file and injects strong context instructing the model
# to call EnterWorktree before any other tool. The PreToolUse gate
# (parallel-session-gate.sh) enforces the wait. The PostToolUse hook
# (parallel-session-provision.sh) then clones node_modules into the worktree.
#
# Detection mechanism (kernel-reliable, ~3-6 syscalls):
#   pgrep -x claude                              # enumerate claude pids by exact name
#   lsof -p <pid> -a -d cwd -Fn                  # cwd of each pid (per-pid; not +D)
#   git -C <cwd> rev-parse --show-toplevel       # normalize to repo toplevel
#   compare against this session's toplevel
#
# Why pgrep -x not -f:
#   -f matches argv strings; tab titles, prompts, or env vars containing
#   "claude" produce false positives. -x matches the binary name only.
#
# Why lsof -p <pid> -a -d cwd not lsof +D:
#   Per-pid fd query is one stat per process. +D recursively walks the path,
#   which can take seconds on a large repo. Unsuitable for a hook.
#
# Wire protocol (Claude Code SessionStart):
#   stdin:  JSON with .session_id, .cwd, .transcript_path
#   stdout: JSON {"hookSpecificOutput": {"hookEventName": "SessionStart",
#                                        "additionalContext": "..."}}
#   exit 0 always; never block session start on hook plumbing
#
# Marker file:
#   $REPO/.claude/parallel-isolation-required-$SESSION_ID
#   Created when peer detected. Contains JSON with peer pid + repo toplevel.
#   PreToolUse gate reads it. PostToolUse on EnterWorktree removes it.

set -e

# Required tools. If anything is missing, exit silently — the cost of a
# missed detection is a possible collision; the cost of a blocked session
# start is a broken Captain.
for tool in jq pgrep lsof git; do
  command -v "$tool" >/dev/null 2>&1 || exit 0
done

# Read hook input. CWD comes from Claude Code; SESSION_ID identifies this
# session for the marker file name.
INPUT=$(cat)
CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null) || exit 0
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null) || exit 0
[ -z "$CWD" ] && exit 0
[ -z "$SESSION_ID" ] && exit 0

# Resolve canonical repo toplevel. If we're not in a git repo, no isolation
# work to do — just exit silently.
THIS_TOPLEVEL=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null) || exit 0

# This session's own pid is in $PPID? No — claude is the parent of the hook
# script, so $PPID should be the claude process. We exclude it from peer
# detection so we don't detect ourselves.
SELF_PID=$PPID

# Enumerate peer claude processes.
PEER_PIDS=()
while IFS= read -r pid; do
  [ -z "$pid" ] && continue
  [ "$pid" = "$SELF_PID" ] && continue
  # Get cwd of this pid. lsof -Fn prints the cwd as a line starting with 'n'.
  PEER_CWD=$(lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}')
  [ -z "$PEER_CWD" ] && continue
  # Normalize to repo toplevel. If pid isn't in a git repo, skip.
  PEER_TOPLEVEL=$(git -C "$PEER_CWD" rev-parse --show-toplevel 2>/dev/null) || continue
  # Same repo? Same toplevel string after normalization.
  if [ "$PEER_TOPLEVEL" = "$THIS_TOPLEVEL" ]; then
    PEER_PIDS+=("$pid")
  fi
done < <(pgrep -x claude 2>/dev/null)

MARKER_DIR="$THIS_TOPLEVEL/.claude"
MARKER_FILE="$MARKER_DIR/parallel-isolation-required-$SESSION_ID"
LOG_DIR="$MARKER_DIR/parallel-isolation-log"
mkdir -p "$LOG_DIR" 2>/dev/null || true

if [ ${#PEER_PIDS[@]} -eq 0 ]; then
  # No peer detected. Log for the weekly metric (no-peer = solo session,
  # primary checkout). No additional context needed.
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) session=$SESSION_ID peer=none toplevel=$THIS_TOPLEVEL" \
    >> "$LOG_DIR/sessions.log" 2>/dev/null || true
  exit 0
fi

# Peer detected. Drop marker, log, inject context.
PEER_LIST=$(IFS=,; echo "${PEER_PIDS[*]}")
mkdir -p "$MARKER_DIR" 2>/dev/null || true
cat > "$MARKER_FILE" <<EOF
{
  "session_id": "$SESSION_ID",
  "toplevel": "$THIS_TOPLEVEL",
  "peer_pids": [$PEER_LIST],
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) session=$SESSION_ID peer=$PEER_LIST toplevel=$THIS_TOPLEVEL" \
  >> "$LOG_DIR/sessions.log" 2>/dev/null || true

# Inject context. The instruction is intentionally strong; it's the only
# control surface we have over the model's first action. The PreToolUse
# gate is the actual enforcement.
ADDITIONAL_CONTEXT="[parallel-isolation] Peer claude process(es) detected on this repo (pid: $PEER_LIST). To prevent working-tree contamination across concurrent sessions, you MUST call EnterWorktree as your FIRST action this session. Do not call any other tool first. After EnterWorktree completes, the post-tool hook will provision node_modules automatically; you can proceed normally from there. This isolation is enforced by a PreToolUse gate — non-EnterWorktree tool calls will be blocked until you are inside a worktree under .claude/worktrees/."

# Emit the SessionStart additionalContext payload.
jq -n --arg ctx "$ADDITIONAL_CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
