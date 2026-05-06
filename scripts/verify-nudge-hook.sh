#!/bin/bash
#
# verify-nudge-hook.sh — PreToolUse hook (Prong 2 of the verify substrate)
#
# Fires before Bash / Edit / Write tool calls and emits a nudge systemMessage
# when the call matches a runtime-config-shaped pattern (wrangler deploy,
# gh pr merge, edits to settings/wrangler/env files). Allows the call;
# never blocks. The nudge instructs the agent to record evidence with
# crane_verify after the operation completes — the recorded vfy_ ID is what
# PR-CI checks for on surface PRs.
#
# Per-user per-session per-pattern cookie suppression prevents nudge spam
# when an agent runs the same pattern multiple times. SessionStart rotation
# legitimately re-arms the cookie (a fresh session is a fresh agent).
#
# No network I/O. Local JSONL telemetry only. The PreToolUse contract is
# request/response — a synchronous POST adds tail latency to every matched
# call, and a backgrounded curl orphans on parent exit. Recording is the
# agent's job after the fact via crane_verify.
#
# Wire protocol (Claude Code PreToolUse):
#   stdin:  JSON with .session_id, .cwd, .tool_name, .tool_input, .hook_event_name
#   stdout: JSON {"hookSpecificOutput": {"permissionDecision": "allow",
#                                        "hookEventName": "PreToolUse"},
#                 "systemMessage": "..."}  (only emitted on match + no cookie)
#   exit 0  (always — fail-open on any error)

set -e

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null || true)
CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null || true)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null || true)

# No session_id is unusual but not fatal — exit 0 (allow, no message).
[ -z "$SESSION_ID" ] && exit 0

# Restrict to the three tool kinds we care about. Other tools pass through silently.
case "$TOOL" in
  Bash|Edit|Write) ;;
  *) exit 0 ;;
esac

# ----------------------------------------------------------------------------
# Pattern matching
# ----------------------------------------------------------------------------
# Tight trigger set — the things we'd ask "did this actually work?" about
# in a session post-mortem. Excludes --help / --dry-run variants which
# don't change real state and would only produce noise.

PATTERN_NAME=""

if [ "$TOOL" = "Bash" ]; then
  COMMAND=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null || true)
  [ -z "$COMMAND" ] && exit 0

  # Skip --help / --dry-run / -h up-front for all bash patterns
  if echo "$COMMAND" | grep -qE '(\s--help|\s--dry-run|\s-h\b)'; then
    exit 0
  fi

  if echo "$COMMAND" | grep -qE 'wrangler\s+(deploy|secret|d1\s+execute)\b'; then
    PATTERN_NAME="wrangler runtime-config command"
  elif echo "$COMMAND" | grep -qE 'gh\s+pr\s+merge\b'; then
    PATTERN_NAME="gh pr merge"
  elif echo "$COMMAND" | grep -qE 'infisical\s+secrets\s+(set|get)\b' && ! echo "$COMMAND" | grep -qE -- '--plain\b'; then
    PATTERN_NAME="infisical secrets read/write (non-plain)"
  elif echo "$COMMAND" | grep -qE 'gcloud\s+\w+\s+deploy\b'; then
    PATTERN_NAME="gcloud deploy"
  fi
elif [ "$TOOL" = "Edit" ] || [ "$TOOL" = "Write" ]; then
  FILE_PATH=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>/dev/null || true)
  [ -z "$FILE_PATH" ] && exit 0

  if echo "$FILE_PATH" | grep -qE '\.claude/settings\.json$'; then
    PATTERN_NAME=".claude/settings.json edit"
  elif echo "$FILE_PATH" | grep -qE 'wrangler\.toml$'; then
    PATTERN_NAME="wrangler.toml edit"
  elif echo "$FILE_PATH" | grep -qE '\.env(\.\w+)?$'; then
    PATTERN_NAME=".env file edit"
  fi
fi

# No pattern matched → silent allow.
[ -z "$PATTERN_NAME" ] && exit 0

# ----------------------------------------------------------------------------
# Suppression cookie + JSONL telemetry
# ----------------------------------------------------------------------------
# Per-user per-session per-pattern. /tmp is per-machine; ${USER} prevents
# cross-user collisions; SESSION_ID rotation by SessionStart is fine —
# a fresh session is a fresh agent.

TMP_DIR="${TMPDIR:-/tmp}"
TMP_DIR="${TMP_DIR%/}"
SAFE_USER=$(echo "${USER:-unknown}" | tr -cd '[:alnum:]_-')

# Bound /tmp growth at 4h TTL — quiet on errors.
find "$TMP_DIR" -maxdepth 1 -name "verify-nudge-${SAFE_USER}-*" -mmin +240 -delete 2>/dev/null || true

# Hash the pattern name so cookie filenames stay short and shell-safe.
PATTERN_HASH=$(printf '%s' "$PATTERN_NAME" | shasum -a 256 2>/dev/null | awk '{print substr($1,1,12)}')
[ -z "$PATTERN_HASH" ] && PATTERN_HASH="$(printf '%s' "$PATTERN_NAME" | tr -cd '[:alnum:]' | head -c 12)"

COOKIE="${TMP_DIR}/verify-nudge-${SAFE_USER}-${SESSION_ID}-${PATTERN_HASH}"

# Local JSONL telemetry — append even when suppressed, so /tmp growth
# isn't the only signal. The log dir is best-effort.
LOG_DIR="${HOME}/.claude/logs"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="${LOG_DIR}/verify-hook-$(date +%Y-%m).jsonl"

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SUPPRESSED="false"
[ -f "$COOKIE" ] && SUPPRESSED="true"

# JSON-encode the pattern_name and cwd so embedded quotes/backslashes are safe.
JSON_LINE=$(jq -nc \
  --arg ts "$TS" \
  --arg sid "$SESSION_ID" \
  --arg pat "$PATTERN_NAME" \
  --arg cwd "$CWD" \
  --argjson sup "$SUPPRESSED" \
  '{ts: $ts, session_id: $sid, pattern_name: $pat, cwd: $cwd, suppressed: $sup}')
echo "$JSON_LINE" >>"$LOG_FILE" 2>/dev/null || true

# Cookie present → suppress the systemMessage but allow the call.
if [ -f "$COOKIE" ]; then
  exit 0
fi

# Drop the cookie so subsequent matches in this session are silent.
touch "$COOKIE" 2>/dev/null || true

# ----------------------------------------------------------------------------
# Emit nudge
# ----------------------------------------------------------------------------

SYSTEM_MSG="[verify] About to ${PATTERN_NAME}. After running, record evidence with crane_verify(method:\"fresh_process\", claim:\"...\", output:\"...\", command:\"...\", tool_used:\"Bash\"). PR-CI checks PR body for vfy_ IDs on surface PRs."

jq -n --arg msg "$SYSTEM_MSG" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow"
  },
  systemMessage: $msg
}'

exit 0
