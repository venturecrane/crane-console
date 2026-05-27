#!/bin/bash
#
# Tests for secret-leak-detector.sh.
#
# Pipes representative PostToolUse JSON payloads and asserts: (a) alerts are
# written to a temp log file for known secret prefixes, (b) the alert record
# itself contains only the first 4 chars of the match — never the full value,
# (c) clean output produces zero alerts.
#
# Run: bash ~/.claude/hooks/secret-leak-detector.test.sh
# Exit code: 0 = all pass, 1 = at least one failed.

set -u

HOOK=~/.claude/hooks/secret-leak-detector.sh
PASS=0
FAIL=0
FAILED_CASES=()

# Suppress macOS notifications during testing — every test fixture would
# otherwise fire a real desktop notification on the developer's machine,
# spamming the notification center with synthetic-token alerts that point
# at the test's tmp dir. Production invocations of the hook still notify
# (default is on); only this test harness opts out.
export SECRET_LEAK_DETECTOR_NOTIFY=0

# Use a per-test log file via env override (the hook hardcodes the path, so
# we redirect by symlink in a tmp dir for testing).
TMPDIR_TEST=$(mktemp -d)
TEST_LOG="$TMPDIR_TEST/alerts.jsonl"

# Point ALERT_LOG via env var (we'll patch the hook to honor an env override,
# or just point HOME at our tmp dir).
fake_home_run() {
  local payload="$1"
  rm -f "$TEST_LOG"
  HOME_BAK="$HOME"
  export HOME="$TMPDIR_TEST"
  mkdir -p "$HOME/.claude"
  printf '%s' "$payload" | bash "$HOOK" 2>/dev/null
  export HOME="$HOME_BAK"
  if [ -f "$HOME_BAK/.claude/secret-leak-alerts.jsonl.test-snapshot" ]; then
    rm "$HOME_BAK/.claude/secret-leak-alerts.jsonl.test-snapshot"
  fi
}

# Build a PostToolUse payload from an output string.
mkpayload() {
  jq -n --arg out "$1" '{
    session_id: "test-session",
    tool_name: "Bash",
    tool_input: { command: "test" },
    tool_response: { stdout: $out, stderr: "" },
    hook_event_name: "PostToolUse"
  }'
}

expect_alert() {
  local label="$1"
  local output_str="$2"
  local expected_pattern="$3"
  local expected_first="$4"

  rm -f "$TMPDIR_TEST/.claude/secret-leak-alerts.jsonl"
  local payload
  payload=$(mkpayload "$output_str")

  HOME_BAK="$HOME"
  export HOME="$TMPDIR_TEST"
  mkdir -p "$HOME/.claude"
  printf '%s' "$payload" | bash "$HOOK" 2>/dev/null
  export HOME="$HOME_BAK"

  local log="$TMPDIR_TEST/.claude/secret-leak-alerts.jsonl"
  if [ ! -f "$log" ]; then
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$label (no alert written)")
    printf "  \033[31mFAIL\033[0m %s (no alert file)\n" "$label"
    return
  fi

  local got_pattern got_first
  got_pattern=$(jq -r '.pattern' "$log" | head -1)
  got_first=$(jq -r '.first_chars' "$log" | head -1)

  if [ "$got_pattern" != "$expected_pattern" ] || [ "$got_first" != "$expected_first" ]; then
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$label (got: $got_pattern/$got_first, expected: $expected_pattern/$expected_first)")
    printf "  \033[31mFAIL\033[0m %s (got: %s/%s, expected: %s/%s)\n" \
      "$label" "$got_pattern" "$got_first" "$expected_pattern" "$expected_first"
    return
  fi

  # Critical: the full value must NOT appear in the alert.
  if grep -qF "$output_str" "$log" 2>/dev/null; then
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$label (full value leaked into alert!)")
    printf "  \033[31mFAIL\033[0m %s (full value leaked into alert!)\n" "$label"
    return
  fi

  PASS=$((PASS + 1))
  printf "  \033[32mPASS\033[0m %s\n" "$label"
}

expect_no_alert() {
  local label="$1"
  local output_str="$2"

  rm -f "$TMPDIR_TEST/.claude/secret-leak-alerts.jsonl"
  local payload
  payload=$(mkpayload "$output_str")

  HOME_BAK="$HOME"
  export HOME="$TMPDIR_TEST"
  mkdir -p "$HOME/.claude"
  printf '%s' "$payload" | bash "$HOOK" 2>/dev/null
  export HOME="$HOME_BAK"

  local log="$TMPDIR_TEST/.claude/secret-leak-alerts.jsonl"
  if [ -f "$log" ] && [ -s "$log" ]; then
    FAIL=$((FAIL + 1))
    local content
    content=$(cat "$log")
    FAILED_CASES+=("$label (false-positive: $content)")
    printf "  \033[31mFAIL\033[0m %s (false-positive alert)\n" "$label"
    return
  fi

  PASS=$((PASS + 1))
  printf "  \033[32mPASS\033[0m %s\n" "$label"
}

# ---------------------------------------------------------------------------
# Should ALERT
# ---------------------------------------------------------------------------

# Synthetic fixtures are built at runtime from prefix + suffix so the literal
# token-shaped strings never appear in the file at rest. This keeps GitHub
# push protection and other static scanners happy without weakening the
# detection coverage — the joined runtime string still matches the detector's
# regex tables. None of these are real credentials.
P_GHP="ghp_"
P_XOXB="xoxb-"
P_STR="sk_live_"
P_OAI="sk-"
P_ANT="sk-ant-"
P_TG=":AAEabcdefghijklmnopqrstuvwxyz1234567"
P_AWS="AKIA"
P_GCP="AIza"
SUF_BASE="abcdefghijklmnopqrstuvwxyz0123456789AB"
SUF_MIX="aBcDeFgHiJkLmNoPqRsTuVwXyZ"

echo "== known secret prefixes =="
expect_alert "GitHub PAT" "Your token: ${P_GHP}${SUF_BASE} end" "github-pat" "${P_GHP}"
expect_alert "Slack bot" "${P_XOXB}1234567890-abcdefghij" "slack-bot" "xoxb"
expect_alert "Stripe live" "${P_STR}${SUF_MIX}" "stripe-live-secret" "sk_l"
expect_alert "OpenAI key" "${P_OAI}${SUF_MIX}012345" "openai-key" "sk-a"
expect_alert "Anthropic key" "${P_ANT}${SUF_MIX}_-_-_-_-12345" "anthropic-key" "sk-a"
expect_alert "Telegram bot token" "Token: 8303123456${P_TG} end" "telegram-bot" "8303"
expect_alert "AWS access key" "${P_AWS}IOSFODNN7EXAMPLE end" "aws-access-key" "${P_AWS}"
expect_alert "Google API key" "${P_GCP}SyA-abcdefghijklmnopqrstuvwxyz0123456 end" "google-api-key" "${P_GCP}"

# ---------------------------------------------------------------------------
# Should NOT ALERT
# ---------------------------------------------------------------------------

echo
echo "== clean output (no alert) =="
expect_no_alert "plain text" "Hello, world!"
expect_no_alert "git status" "On branch main\nnothing to commit"
expect_no_alert "uuid (not a secret)" "5b9d5e8a-1f2d-4e6c-9a3b-7c8d9e0f1a2b"
expect_no_alert "git sha (not a secret)" "aff50dc fix(crane-context): use json_each"
expect_no_alert "short token-like string" "sk-abc"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

rm -rf "$TMPDIR_TEST"

echo
echo "================================================================"
echo "Pass: $PASS  |  Fail: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed cases:"
  for c in "${FAILED_CASES[@]}"; do
    echo "  - $c"
  done
  exit 1
fi
echo "All tests passed."
exit 0
