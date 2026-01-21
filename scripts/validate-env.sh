#!/bin/bash
#
# Environment Validation Script
# Validates Ubuntu server development environment setup
#
# Checks:
# - Git configuration
# - GitHub CLI authentication
# - Wrangler authentication
# - Required environment variables
#
# Usage: ./scripts/validate-env.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Status counters
PASSED=0
FAILED=0
WARNINGS=0

echo -e "${CYAN}## 🔍 Environment Validation${NC}"
echo ""

# ============================================================================
# Git Configuration
# ============================================================================

echo -e "${CYAN}### 📦 Git Configuration${NC}"
echo ""

# Check if git is installed
if command -v git &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Git is installed"
    ((PASSED++))

    # Check git user.name
    GIT_NAME=$(git config --get user.name 2>/dev/null || echo "")
    if [ -n "$GIT_NAME" ]; then
        echo -e "  ${GREEN}✓${NC} Git user.name: $GIT_NAME"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} Git user.name is not configured"
        echo -e "    ${YELLOW}Fix:${NC} git config --global user.name \"Your Name\""
        ((FAILED++))
    fi

    # Check git user.email
    GIT_EMAIL=$(git config --get user.email 2>/dev/null || echo "")
    if [ -n "$GIT_EMAIL" ]; then
        echo -e "  ${GREEN}✓${NC} Git user.email: $GIT_EMAIL"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} Git user.email is not configured"
        echo -e "    ${YELLOW}Fix:${NC} git config --global user.email \"your@email.com\""
        ((FAILED++))
    fi
else
    echo -e "  ${RED}✗${NC} Git is not installed"
    ((FAILED++))
fi

echo ""

# ============================================================================
# GitHub CLI Authentication
# ============================================================================

echo -e "${CYAN}### 🐙 GitHub CLI Authentication${NC}"
echo ""

if command -v gh &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} GitHub CLI is installed"
    ((PASSED++))

    # Check authentication status
    if gh auth status &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} GitHub CLI is authenticated"
        ((PASSED++))

        # Get authenticated user
        GH_USER=$(gh api user -q .login 2>/dev/null || echo "")
        if [ -n "$GH_USER" ]; then
            echo -e "  ${BLUE}  User:${NC} $GH_USER"
        fi
    else
        echo -e "  ${RED}✗${NC} GitHub CLI is not authenticated"
        echo -e "    ${YELLOW}Fix:${NC} gh auth login"
        ((FAILED++))
    fi
else
    echo -e "  ${RED}✗${NC} GitHub CLI is not installed"
    echo -e "    ${YELLOW}Fix:${NC} Install from https://cli.github.com/"
    ((FAILED++))
fi

echo ""

# ============================================================================
# Wrangler Authentication
# ============================================================================

echo -e "${CYAN}### ☁️  Wrangler Authentication${NC}"
echo ""

if command -v wrangler &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Wrangler is installed"
    ((PASSED++))

    # Check whoami (authentication)
    if wrangler whoami &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Wrangler is authenticated"
        ((PASSED++))

        # Get account info
        WRANGLER_USER=$(wrangler whoami 2>/dev/null | grep -oP '(?<=│ User )[^│]+' | xargs || echo "")
        if [ -n "$WRANGLER_USER" ]; then
            echo -e "  ${BLUE}  User:${NC} $WRANGLER_USER"
        fi
    else
        echo -e "  ${RED}✗${NC} Wrangler is not authenticated"
        echo -e "    ${YELLOW}Fix:${NC} wrangler login"
        ((FAILED++))
    fi
else
    echo -e "  ${RED}✗${NC} Wrangler is not installed"
    echo -e "    ${YELLOW}Fix:${NC} npm install -g wrangler"
    ((FAILED++))
fi

echo ""

# ============================================================================
# Environment Variables
# ============================================================================

echo -e "${CYAN}### 🔐 Environment Variables${NC}"
echo ""

# Check CRANE_CONTEXT_KEY
if [ -n "$CRANE_CONTEXT_KEY" ]; then
    # Mask the key for security
    MASKED_KEY="${CRANE_CONTEXT_KEY:0:8}...${CRANE_CONTEXT_KEY: -4}"
    echo -e "  ${GREEN}✓${NC} CRANE_CONTEXT_KEY is set ($MASKED_KEY)"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} CRANE_CONTEXT_KEY is not set (optional)"
    echo -e "    ${BLUE}Note:${NC} Required for /sod and /eod commands"
    ((WARNINGS++))
fi

# Check CLOUDFLARE_API_TOKEN (optional but useful)
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    echo -e "  ${GREEN}✓${NC} CLOUDFLARE_API_TOKEN is set"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} CLOUDFLARE_API_TOKEN is not set (optional)"
    echo -e "    ${BLUE}Note:${NC} Used by wrangler for deployments"
    ((WARNINGS++))
fi

echo ""

# ============================================================================
# Repository Context
# ============================================================================

echo -e "${CYAN}### 📁 Repository Context${NC}"
echo ""

if git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Inside a git repository"
    ((PASSED++))

    # Get current branch
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
    if [ -n "$CURRENT_BRANCH" ]; then
        echo -e "  ${BLUE}  Branch:${NC} $CURRENT_BRANCH"
    fi

    # Get remote URL
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$REMOTE_URL" ]; then
        echo -e "  ${BLUE}  Remote:${NC} $REMOTE_URL"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} Not inside a git repository"
    ((WARNINGS++))
fi

echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${CYAN}### 📊 Summary${NC}"
echo ""

TOTAL=$((PASSED + FAILED + WARNINGS))

echo -e "  ${GREEN}✓ Passed:${NC} $PASSED"
if [ $WARNINGS -gt 0 ]; then
    echo -e "  ${YELLOW}⚠ Warnings:${NC} $WARNINGS"
fi
if [ $FAILED -gt 0 ]; then
    echo -e "  ${RED}✗ Failed:${NC} $FAILED"
fi

echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}Environment is ready for development! ✅${NC}"
    exit 0
else
    echo -e "${RED}Please fix the failed checks above before proceeding.${NC}"
    exit 1
fi
