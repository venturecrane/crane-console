#!/bin/bash
#
# secret-leak-detector — PostToolUse observation hook.
#
# Scans tool output for known secret-shaped prefixes. On match, appends a
# JSONL alert to ~/.claude/secret-leak-alerts.jsonl and emits a macOS desktop
# notification (best-effort via osascript). The alert itself records only
# the pattern name and the first 4 chars of the match — never the full value.
#
# Hooks cannot mutate output, so the value has ALREADY reached Claude's
# context by the time this fires. The point is the feedback loop: without
# detection, prevention layers (Layer 0 deny, Layer 1 deny hook, Layer 2
# MCP tool, Layer 5 wrapper) silently fail and we don't notice until the
# next rotation cycle. With detection, residual leaks are loud.
#
# Auto-rotation is explicitly out of scope here — that's the follow-up issue
# filed at PR merge time.
#
# Wire protocol (Claude Code PostToolUse):
#   stdin:  JSON with .tool_name, .tool_input, .tool_response, ...
#   stdout: nothing (PostToolUse cannot affect Claude's view of the output)
#   exit 0 always — this hook is observational

set -e

if ! command -v jq >/dev/null 2>&1; then
  # No jq → can't parse input. Silent pass-through; the prevention layers
  # are still in place. (Detection is the backstop, not the only line.)
  exit 0
fi

ALERT_LOG=~/.claude/secret-leak-alerts.jsonl

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null)

# Tool output can be at several JSON paths depending on tool. Concat candidates
# and scan once.
OUTPUT=$(jq -r '
  ((.tool_response // {}) | if type == "string" then . else
    [
      (.stdout // ""),
      (.stderr // ""),
      (.output // ""),
      (.content // [] | if type == "array" then map(.text // "") | join("\n") else . end)
    ] | join("\n")
  end)
' <<<"$INPUT" 2>/dev/null)

if [ -z "$OUTPUT" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Pattern table. Each entry: NAME|REGEX (extended). Order doesn't matter.
# Patterns are intentionally narrow to avoid false positives — a UUID is
# NOT a secret pattern; we only flag prefixes that uniquely identify a
# secret-issuing service.
# ---------------------------------------------------------------------------
PATTERNS=(
  "github-pat|ghp_[A-Za-z0-9]{36,}"
  "github-oauth|gho_[A-Za-z0-9]{36,}"
  "github-app-user|ghu_[A-Za-z0-9]{36,}"
  "github-app-server|ghs_[A-Za-z0-9]{36,}"
  "github-app-refresh|ghr_[A-Za-z0-9]{36,}"
  "slack-bot|xoxb-[A-Za-z0-9-]{20,}"
  "slack-user|xoxp-[A-Za-z0-9-]{20,}"
  "stripe-live-secret|sk_live_[A-Za-z0-9]{24,}"
  "stripe-test-secret|sk_test_[A-Za-z0-9]{24,}"
  "openai-key|sk-[A-Za-z0-9]{32,}"
  "anthropic-key|sk-ant-[A-Za-z0-9_-]{32,}"
  "telegram-bot|[0-9]+:[A-Za-z0-9_-]{35}"
  "infisical-service-token|st\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.[A-Za-z0-9]{64,}"
  "aws-access-key|AKIA[0-9A-Z]{16}"
  "aws-session-key|ASIA[0-9A-Z]{16}"
  "google-api-key|AIza[0-9A-Za-z_-]{35}"
  "cloudflare-api-token|[A-Za-z0-9_-]{40}\\b"
)

# Skip the cloudflare-api-token pattern by default — it's lossy (40-char
# token-like strings appear in lots of unrelated places). Keep it commented
# in the array but skip during scan. Future tuning.

emit_alert() {
  local pattern_name="$1"
  local first_chars="$2"
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Append structured alert. Never the full match; first 4 chars only.
  jq -n \
    --arg ts "$ts" \
    --arg session "$SESSION_ID" \
    --arg tool "$TOOL" \
    --arg pattern "$pattern_name" \
    --arg first "$first_chars" \
    '{
      ts: $ts,
      session_id: $session,
      tool_name: $tool,
      pattern: $pattern,
      first_chars: $first
    }' >>"$ALERT_LOG"

  # Best-effort macOS desktop notification.
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"Secret-shaped value (${pattern_name}: ${first_chars}…) in ${TOOL} output. See ${ALERT_LOG}.\" with title \"⚠ Secret leak detected\"" 2>/dev/null || true
  fi
}

# Deduplicate alerts within a single invocation — many tools repeat the same
# secret across stdout/stderr/content.
SEEN=""

for entry in "${PATTERNS[@]}"; do
  name="${entry%%|*}"
  pattern="${entry#*|}"

  # Skip the lossy cloudflare pattern.
  if [ "$name" = "cloudflare-api-token" ]; then
    continue
  fi

  # Find matches. -o prints only matching parts; -E extended regex.
  matches=$(printf '%s' "$OUTPUT" | grep -oE "$pattern" 2>/dev/null | head -5 || true)
  if [ -z "$matches" ]; then
    continue
  fi

  while IFS= read -r m; do
    [ -z "$m" ] && continue
    first_chars="${m:0:4}"
    key="${name}:${first_chars}"
    case "$SEEN" in
      *"|${key}|"*) continue ;;
    esac
    SEEN="${SEEN}|${key}|"
    emit_alert "$name" "$first_chars"
  done <<<"$matches"
done

exit 0
