#!/bin/bash
#
# Tests for bash-secret-deny.sh.
#
# Pipes representative JSON payloads into the hook and asserts the emitted
# JSON contains either `permissionDecision: "deny"` (for cases that should
# be blocked) or no decision at all (for cases that should pass through).
#
# Run: bash ~/.claude/hooks/bash-secret-deny.test.sh
# Exit code: 0 = all pass, 1 = at least one failed.

set -u

HOOK=~/.claude/hooks/bash-secret-deny.sh
PASS=0
FAIL=0
FAILED_CASES=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Build a PreToolUse payload from a command string.
mkpayload() {
  jq -n --arg cmd "$1" '{
    session_id: "test",
    tool_name: "Bash",
    tool_input: { command: $cmd },
    hook_event_name: "PreToolUse"
  }'
}

# Assert the hook DENIES the given command.
expect_deny() {
  local label="$1"
  local cmd="$2"
  local out
  out=$(mkpayload "$cmd" | bash "$HOOK" 2>/dev/null)
  local decision
  decision=$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null)
  if [ "$decision" = "deny" ]; then
    PASS=$((PASS + 1))
    printf "  \033[32mPASS\033[0m %s\n" "$label"
  else
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$label")
    printf "  \033[31mFAIL\033[0m %s (got: %s)\n" "$label" "${decision:-pass-through}"
  fi
}

# Assert the hook PASSES the given command (no deny decision).
expect_pass() {
  local label="$1"
  local cmd="$2"
  local out
  out=$(mkpayload "$cmd" | bash "$HOOK" 2>/dev/null)
  local decision
  decision=$(echo "$out" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null)
  if [ "$decision" != "deny" ]; then
    PASS=$((PASS + 1))
    printf "  \033[32mPASS\033[0m %s\n" "$label"
  else
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$label")
    printf "  \033[31mFAIL\033[0m %s (false-positive deny)\n" "$label"
  fi
}

# ---------------------------------------------------------------------------
# Should DENY
# ---------------------------------------------------------------------------

echo "== infisical secrets listing =="
expect_deny "bare listing" "infisical secrets --env prod --path /vc"
expect_deny "listing with --output json (still leaks via | grep value)" "infisical secrets --env prod --path /vc --output json"
expect_deny "listing with absolute path binary" "/opt/homebrew/bin/infisical secrets --env prod --path /vc"
expect_deny "listing via variable indirection" "INF=infisical; \$INF secrets --env prod --path /vc"
expect_deny "listing wrapped in bash -c double-quoted" 'bash -c "infisical secrets --env prod --path /vc"'
expect_deny "listing wrapped in bash -c single-quoted" "bash -c 'infisical secrets --env prod --path /vc'"
expect_deny "listing in command substitution" 'echo "$(infisical secrets --env prod --path /vc)"'
expect_deny "listing in backticks" 'echo "`infisical secrets --env prod --path /vc`"'
expect_deny "listing piped to grep" "infisical secrets --env prod --path /vc | grep TOKEN"
expect_deny "listing redirected to file" "infisical secrets --env prod --path /vc > /tmp/k"

echo
echo "== infisical secrets get =="
expect_deny "secrets get single name" "infisical secrets get TELEGRAM_BOT_TOKEN --env prod --path /vc"
expect_deny "secrets get with --plain" "infisical secrets get API_KEY --env prod --path /vc --plain"

echo
echo "== infisical export =="
expect_deny "export bare" "infisical export --env prod --path /vc"
expect_deny "export with format" "infisical export --env prod --path /vc --format=json"

echo
echo "== .env dotfile dumps =="
expect_deny "cat .env" "cat .env"
expect_deny "cat .env.local" "cat .env.local"
expect_deny "head .env" "head .env"
expect_deny "tail .env" "tail -n 20 .env"
expect_deny "grep against .env" "grep TOKEN .env"

echo
echo "== printenv / bare env =="
expect_deny "bare printenv" "printenv"
expect_deny "printenv redirected" "printenv > /tmp/e"
expect_deny "bare env (terminal)" "env"
expect_deny "env redirected" "env > /tmp/e"

echo
echo "== wrangler secret put with literal =="
expect_deny "literal token as third arg" "wrangler secret put API_KEY abc123def456ghi789"

echo
echo "== Authorization Bearer with literal =="
# Bearer-token literal built at runtime to keep the file clean of token-shaped
# strings at rest (GitHub push protection / gitleaks). The joined runtime
# string still matches the deny-hook regex.
P_TOKEN_PFX="ghp_"
TOKEN_FIXTURE="${P_TOKEN_PFX}abc123def456ghi789jkl"
expect_deny "literal Bearer token in curl" "curl -H 'Authorization: Bearer ${TOKEN_FIXTURE}' https://api.github.com"

echo
echo "== eval / source laundering =="
expect_deny "eval of infisical secrets" 'eval "$(infisical secrets --env prod --path /vc)"'
expect_deny "source <(infisical secrets)" "source <(infisical secrets --env prod --path /vc)"

echo
echo "== command substitution capture =="
expect_deny "VAR=\$(infisical secrets)" 'TOKEN=$(infisical secrets get TELEGRAM_BOT_TOKEN --env prod --path /vc --plain)'

echo
echo "== nested bash -c (hook evasion) =="
expect_deny "nested bash -c -c" 'bash -c "bash -c \"infisical secrets --env prod --path /vc\""'

# ---------------------------------------------------------------------------
# Should PASS (no deny)
# ---------------------------------------------------------------------------

echo
echo "== legitimate operations (must pass through) =="
expect_pass "npm test" "npm test"
expect_pass "git status" "git status"
expect_pass "gh pr list" "gh pr list --repo venturecrane/crane-console"
expect_pass "infisical run -- npm run dev" "infisical run --env prod --path /vc -- npm run dev"
expect_pass "infisical login" "infisical login"
expect_pass "infisical secrets set" "infisical secrets set NEW_KEY=value --path /vc --env dev"
expect_pass "infisical secrets folders" "infisical secrets folders --path /vc --env prod"
expect_pass "env VAR=val cmd" "env API_URL=http://x npm test"
expect_pass "env | awk keys" "env | awk -F= '/^[A-Z_]+=/ {print \$1}'"
expect_pass "awk keys from .env" "awk -F= '{print \$1}' .env"
expect_pass "wrangler secret put via stdin" "echo \"\$TOKEN\" | wrangler secret put API_KEY"
expect_pass "curl with Bearer env var" "curl -H \"Authorization: Bearer \$TOKEN\" https://api.example.com"
expect_pass "cat package.json" "cat package.json"
expect_pass "cat README.md" "cat README.md"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

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
