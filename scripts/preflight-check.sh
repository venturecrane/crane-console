#!/bin/bash
# Pre-flight environment check for Crane Console dev boxes
# Validates all required env vars and API connectivity before starting work
#
# Usage: bash scripts/preflight-check.sh
# Exit codes: 0 = all good, 1 = critical failure, 2 = warnings only

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

CRITICAL_FAILURES=0
WARNINGS=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((CRITICAL_FAILURES++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

check_env_var() {
    local var_name=$1
    local required=$2  # "required" or "optional"
    local value="${!var_name}"

    if [[ -z "$value" ]]; then
        if [[ "$required" == "required" ]]; then
            fail "$var_name not set"
        else
            warn "$var_name not set (optional)"
        fi
        return 1
    else
        # Show first 20 chars for verification
        local preview="${value:0:20}..."
        pass "$var_name set ($preview)"
        return 0
    fi
}

echo "========================================"
echo "  Crane Console Pre-flight Check"
echo "========================================"
echo ""

# -----------------------------------------------------------------------------
# Phase 1: Environment Variables
# -----------------------------------------------------------------------------
echo "--- Environment Variables ---"

check_env_var "ANTHROPIC_API_KEY" "required"
check_env_var "OPENAI_API_KEY" "optional"
check_env_var "GEMINI_API_KEY" "optional"
check_env_var "CRANE_CONTEXT_KEY" "required"
check_env_var "CRANE_ADMIN_KEY" "optional"

echo ""

# -----------------------------------------------------------------------------
# Phase 2: CLI Tools
# -----------------------------------------------------------------------------
echo "--- CLI Tools ---"

if command -v claude &> /dev/null; then
    pass "Claude Code installed ($(claude --version 2>/dev/null | head -1 || echo 'version unknown'))"
else
    fail "Claude Code not installed"
fi

if command -v codex &> /dev/null; then
    pass "Codex CLI installed"
else
    warn "Codex CLI not installed (optional)"
fi

if command -v gemini &> /dev/null; then
    pass "Gemini CLI installed"
else
    warn "Gemini CLI not installed (optional)"
fi

if command -v gh &> /dev/null; then
    if gh auth status &> /dev/null; then
        pass "GitHub CLI authenticated"
    else
        fail "GitHub CLI not authenticated (run: gh auth login)"
    fi
else
    fail "GitHub CLI not installed"
fi

if command -v jq &> /dev/null; then
    pass "jq installed"
else
    fail "jq not installed (required for scripts)"
fi

echo ""

# -----------------------------------------------------------------------------
# Phase 3: API Connectivity
# -----------------------------------------------------------------------------
echo "--- API Connectivity ---"

# Crane Context Worker
if [[ -n "$CRANE_CONTEXT_KEY" ]]; then
    HEALTH_RESPONSE=$(curl -s --max-time 5 "https://crane-context.automation-ab6.workers.dev/health" 2>/dev/null)
    if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' &> /dev/null; then
        pass "crane-context worker reachable"
    else
        fail "crane-context worker not reachable or unhealthy"
    fi
else
    warn "Skipping crane-context check (no key)"
fi

# Anthropic API validation (lightweight)
if [[ -n "$ANTHROPIC_API_KEY" ]]; then
    # Use a minimal request to check if key is valid
    ANTHROPIC_RESPONSE=$(curl -s --max-time 10 \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -H "content-type: application/json" \
        -d '{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
        "https://api.anthropic.com/v1/messages" 2>/dev/null)

    if echo "$ANTHROPIC_RESPONSE" | jq -e '.id' &> /dev/null; then
        pass "Anthropic API key valid"
    elif echo "$ANTHROPIC_RESPONSE" | jq -e '.error.type == "authentication_error"' &> /dev/null; then
        fail "Anthropic API key INVALID - check or rotate key"
    elif echo "$ANTHROPIC_RESPONSE" | jq -e '.error.type == "rate_limit_error"' &> /dev/null; then
        warn "Anthropic API rate limited (key may be valid)"
    else
        warn "Anthropic API check inconclusive: ${ANTHROPIC_RESPONSE:0:100}"
    fi
else
    warn "Skipping Anthropic API check (no key)"
fi

# GitHub API
if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    if gh api user --jq '.login' &> /dev/null; then
        pass "GitHub API accessible"
    else
        warn "GitHub API check failed"
    fi
fi

echo ""

# -----------------------------------------------------------------------------
# Phase 4: Repository State
# -----------------------------------------------------------------------------
echo "--- Repository State ---"

if git rev-parse --is-inside-work-tree &> /dev/null; then
    REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
    BRANCH=$(git branch --show-current)
    pass "In git repo: $REPO_NAME (branch: $BRANCH)"

    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        warn "Uncommitted changes present"
    else
        pass "Working tree clean"
    fi
else
    warn "Not in a git repository"
fi

echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo "========================================"
if [[ $CRITICAL_FAILURES -gt 0 ]]; then
    echo -e "${RED}FAILED${NC}: $CRITICAL_FAILURES critical issue(s), $WARNINGS warning(s)"
    echo ""
    echo "Fix critical issues before proceeding."
    echo "Common fixes:"
    echo "  - Missing env var: Check ~/.zshrc or ~/.bashrc, then 'source' it"
    echo "  - Invalid API key: Rotate in respective console, update Bitwarden, re-run bootstrap"
    echo "  - CLI not installed: Run setup-dev-box.sh or npm install -g <package>"
    exit 1
elif [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}PASSED WITH WARNINGS${NC}: $WARNINGS warning(s)"
    echo ""
    echo "Environment functional but some optional components missing."
    exit 2
else
    echo -e "${GREEN}ALL CHECKS PASSED${NC}"
    echo ""
    echo "Environment ready. Run /sod to start your session."
    exit 0
fi
