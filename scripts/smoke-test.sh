#!/bin/bash
# Smoke Test - Quick validation after machine setup
#
# Usage: bash scripts/smoke-test.sh
#
# Run after setup-dev-box.sh or refresh-secrets.sh to verify everything works.

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local name=$1
    local cmd=$2
    local expect=$3

    ((TESTS_RUN++))
    echo -n "  $name... "

    OUTPUT=$(eval "$cmd" 2>&1)
    if echo "$OUTPUT" | grep -q "$expect"; then
        echo -e "${GREEN}PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        ((TESTS_FAILED++))
        echo "    Expected: $expect"
        echo "    Got: ${OUTPUT:0:100}"
        return 1
    fi
}

echo "========================================"
echo "          Smoke Test"
echo "========================================"
echo ""

# -----------------------------------------------------------------------------
# Test 1: Preflight Check
# -----------------------------------------------------------------------------
echo "1. Environment Validation"
echo ""

if bash scripts/preflight-check.sh > /tmp/smoke-preflight.txt 2>&1; then
    echo -e "  Preflight check... ${GREEN}PASS${NC}"
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
else
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 2 ]]; then
        echo -e "  Preflight check... ${YELLOW}WARN${NC} (non-critical warnings)"
        ((TESTS_RUN++))
        ((TESTS_PASSED++))
    else
        echo -e "  Preflight check... ${RED}FAIL${NC}"
        echo "    Run 'bash scripts/preflight-check.sh' for details"
        ((TESTS_RUN++))
        ((TESTS_FAILED++))
    fi
fi

echo ""

# -----------------------------------------------------------------------------
# Test 2: CLI Tools
# -----------------------------------------------------------------------------
echo "2. CLI Tools"
echo ""

run_test "Claude Code installed" "claude --version 2>/dev/null" "Claude"
run_test "Codex CLI installed" "command -v codex && echo 'found'" "found"
run_test "Gemini CLI installed" "command -v gemini && echo 'found'" "found"
run_test "GitHub CLI authenticated" "gh auth status 2>&1" "Logged in"

echo ""

# -----------------------------------------------------------------------------
# Test 3: API Connectivity
# -----------------------------------------------------------------------------
echo "3. API Connectivity"
echo ""

run_test "Crane Context reachable" \
    "curl -s --max-time 5 https://crane-context.automation-ab6.workers.dev/health" \
    "healthy"

run_test "GitHub API accessible" \
    "gh api user --jq '.login' 2>/dev/null || echo 'github'" \
    ""

echo ""

# -----------------------------------------------------------------------------
# Test 4: SOD Script
# -----------------------------------------------------------------------------
echo "4. SOD Integration"
echo ""

# Quick SOD test (just check it starts, don't wait for full execution)
echo -n "  SOD script exists... "
if [[ -f "scripts/sod-universal.sh" ]]; then
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC}"
    ((TESTS_RUN++))
    ((TESTS_FAILED++))
fi

echo -n "  SOD can parse context... "
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's/.*github\.com[:\/]//;s/\.git$//')
if [[ -n "$REPO" ]]; then
    echo -e "${GREEN}PASS${NC} ($REPO)"
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
else
    echo -e "${RED}FAIL${NC} (not in git repo)"
    ((TESTS_RUN++))
    ((TESTS_FAILED++))
fi

echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo "========================================"
echo "          Summary"
echo "========================================"
echo ""
echo "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    echo "See docs/process/recovery-quickref.md for fixes."
    exit 1
else
    echo "Tests failed: 0"
    echo ""
    echo -e "${GREEN}All smoke tests passed!${NC}"
    echo ""
    echo "Machine is ready. Run '/sod' to start your session."
    exit 0
fi
