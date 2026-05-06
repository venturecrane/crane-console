#!/bin/bash
#
# Inline shell test for scripts/verify-nudge-hook.sh.
#
# Run from repo root: bash scripts/__tests__/verify-nudge-hook.test.sh
# Exit 0 = all tests pass; exit 1 = at least one failed.
#
# Sets up a sandboxed HOME and TMPDIR per assertion so cookies and JSONL
# logs don't leak across cases.

set -u

HOOK="$(cd "$(dirname "$0")/../.." && pwd)/scripts/verify-nudge-hook.sh"
[ -x "$HOOK" ] || { echo "fatal: hook not executable at $HOOK"; exit 2; }

PASS=0
FAIL=0

# Helpers ====================================================================

# run_hook <input_json> [extra_env_assignments]
# Echoes hook stdout (single line or empty); returns hook's exit code.
run_hook() {
  local input="$1"
  local sandbox
  sandbox=$(mktemp -d -t verify-nudge-test.XXXXXX)
  mkdir -p "$sandbox/home" "$sandbox/tmp"
  local out
  out=$(printf '%s' "$input" | HOME="$sandbox/home" TMPDIR="$sandbox/tmp" USER="testuser" bash "$HOOK" 2>/dev/null)
  local rc=$?
  printf '%s' "$out"
  rm -rf "$sandbox"
  return $rc
}

# Persistent sandbox variant — caller passes the dir, we don't clean.
run_hook_in() {
  local sandbox="$1"
  local input="$2"
  mkdir -p "$sandbox/home" "$sandbox/tmp"
  printf '%s' "$input" | HOME="$sandbox/home" TMPDIR="$sandbox/tmp" USER="testuser" bash "$HOOK" 2>/dev/null
}

assert_emit() {
  local label="$1"
  local input="$2"
  local needle="$3"
  local out
  out=$(run_hook "$input")
  if echo "$out" | grep -q "$needle"; then
    echo "  ✓ $label"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label  (got: $(echo "$out" | head -c 200))"
    FAIL=$((FAIL+1))
  fi
}

assert_silent() {
  local label="$1"
  local input="$2"
  local out
  out=$(run_hook "$input")
  if [ -z "$out" ]; then
    echo "  ✓ $label"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label  (got: $(echo "$out" | head -c 200))"
    FAIL=$((FAIL+1))
  fi
}

# Tests =====================================================================

echo "Bash patterns — should emit:"

assert_emit "wrangler deploy" \
  '{"session_id":"s1","cwd":"/x","tool_name":"Bash","tool_input":{"command":"npm run deploy && wrangler deploy"},"hook_event_name":"PreToolUse"}' \
  "wrangler runtime-config command"

assert_emit "wrangler secret put" \
  '{"session_id":"s2","cwd":"/x","tool_name":"Bash","tool_input":{"command":"wrangler secret put FOO"},"hook_event_name":"PreToolUse"}' \
  "wrangler runtime-config command"

assert_emit "wrangler d1 execute" \
  '{"session_id":"s3","cwd":"/x","tool_name":"Bash","tool_input":{"command":"wrangler d1 execute db --command \"SELECT 1\""},"hook_event_name":"PreToolUse"}' \
  "wrangler runtime-config command"

assert_emit "gh pr merge" \
  '{"session_id":"s4","cwd":"/x","tool_name":"Bash","tool_input":{"command":"gh pr merge 123 --squash"},"hook_event_name":"PreToolUse"}' \
  "gh pr merge"

assert_emit "infisical secrets get (no --plain)" \
  '{"session_id":"s5","cwd":"/x","tool_name":"Bash","tool_input":{"command":"infisical secrets get FOO"},"hook_event_name":"PreToolUse"}' \
  "infisical secrets read/write"

assert_emit "gcloud deploy" \
  '{"session_id":"s6","cwd":"/x","tool_name":"Bash","tool_input":{"command":"gcloud run deploy svc --region us"},"hook_event_name":"PreToolUse"}' \
  "gcloud deploy"

echo ""
echo "Bash patterns — should be silent (--help / --dry-run / -h excluded):"

assert_silent "wrangler deploy --help" \
  '{"session_id":"s7","cwd":"/x","tool_name":"Bash","tool_input":{"command":"wrangler deploy --help"},"hook_event_name":"PreToolUse"}'

assert_silent "wrangler deploy --dry-run" \
  '{"session_id":"s8","cwd":"/x","tool_name":"Bash","tool_input":{"command":"wrangler deploy --dry-run"},"hook_event_name":"PreToolUse"}'

assert_silent "infisical secrets get with --plain" \
  '{"session_id":"s9","cwd":"/x","tool_name":"Bash","tool_input":{"command":"infisical secrets get FOO --plain"},"hook_event_name":"PreToolUse"}'

assert_silent "gcloud --dry-run" \
  '{"session_id":"s10","cwd":"/x","tool_name":"Bash","tool_input":{"command":"gcloud run deploy svc --dry-run"},"hook_event_name":"PreToolUse"}'

echo ""
echo "Bash patterns — non-matching commands:"

assert_silent "ls" \
  '{"session_id":"s11","cwd":"/x","tool_name":"Bash","tool_input":{"command":"ls -la"},"hook_event_name":"PreToolUse"}'

assert_silent "git status" \
  '{"session_id":"s12","cwd":"/x","tool_name":"Bash","tool_input":{"command":"git status"},"hook_event_name":"PreToolUse"}'

assert_silent "npm run verify" \
  '{"session_id":"s13","cwd":"/x","tool_name":"Bash","tool_input":{"command":"npm run verify"},"hook_event_name":"PreToolUse"}'

echo ""
echo "Edit/Write file patterns:"

assert_emit "Edit .claude/settings.json" \
  '{"session_id":"s14","cwd":"/x","tool_name":"Edit","tool_input":{"file_path":"/repo/.claude/settings.json"},"hook_event_name":"PreToolUse"}' \
  ".claude/settings.json edit"

assert_emit "Write wrangler.toml" \
  '{"session_id":"s15","cwd":"/x","tool_name":"Write","tool_input":{"file_path":"/repo/workers/foo/wrangler.toml"},"hook_event_name":"PreToolUse"}' \
  "wrangler.toml edit"

assert_emit "Edit .env.production" \
  '{"session_id":"s16","cwd":"/x","tool_name":"Edit","tool_input":{"file_path":"/repo/.env.production"},"hook_event_name":"PreToolUse"}' \
  ".env file edit"

assert_silent "Edit unrelated file" \
  '{"session_id":"s17","cwd":"/x","tool_name":"Edit","tool_input":{"file_path":"/repo/src/foo.ts"},"hook_event_name":"PreToolUse"}'

echo ""
echo "Other tools — pass through silently:"

assert_silent "Read tool" \
  '{"session_id":"s18","cwd":"/x","tool_name":"Read","tool_input":{"file_path":"/repo/.env"},"hook_event_name":"PreToolUse"}'

assert_silent "Glob tool" \
  '{"session_id":"s19","cwd":"/x","tool_name":"Glob","tool_input":{"pattern":"**/*.toml"},"hook_event_name":"PreToolUse"}'

echo ""
echo "Suppression cookie — second match in same session is silent:"

SANDBOX=$(mktemp -d -t verify-nudge-cookie.XXXXXX)
INPUT='{"session_id":"cookie-test","cwd":"/x","tool_name":"Bash","tool_input":{"command":"wrangler deploy"},"hook_event_name":"PreToolUse"}'
OUT1=$(run_hook_in "$SANDBOX" "$INPUT")
OUT2=$(run_hook_in "$SANDBOX" "$INPUT")
if echo "$OUT1" | grep -q "wrangler runtime-config" && [ -z "$OUT2" ]; then
  echo "  ✓ first emit, second suppressed"
  PASS=$((PASS+1))
else
  echo "  ✗ cookie suppression failed (out1=$OUT1, out2=$OUT2)"
  FAIL=$((FAIL+1))
fi
rm -rf "$SANDBOX"

echo ""
echo "JSONL telemetry written even when suppressed:"

SANDBOX=$(mktemp -d -t verify-nudge-jsonl.XXXXXX)
INPUT='{"session_id":"jsonl-test","cwd":"/x","tool_name":"Bash","tool_input":{"command":"wrangler deploy"},"hook_event_name":"PreToolUse"}'
run_hook_in "$SANDBOX" "$INPUT" >/dev/null
run_hook_in "$SANDBOX" "$INPUT" >/dev/null
LOG="$SANDBOX/home/.claude/logs/verify-hook-$(date +%Y-%m).jsonl"
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" | tr -d ' ')" = "2" ]; then
  if grep -q '"suppressed":false' "$LOG" && grep -q '"suppressed":true' "$LOG"; then
    echo "  ✓ JSONL has 2 lines, one suppressed=false and one suppressed=true"
    PASS=$((PASS+1))
  else
    echo "  ✗ JSONL missing suppression flags ($(cat "$LOG"))"
    FAIL=$((FAIL+1))
  fi
else
  echo "  ✗ JSONL not written or wrong line count"
  FAIL=$((FAIL+1))
fi
rm -rf "$SANDBOX"

echo ""
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
