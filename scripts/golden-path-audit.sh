#!/bin/bash
#
# Golden Path Audit Script
# Checks repos for compliance with Golden Path requirements
#
# Usage: ./scripts/golden-path-audit.sh [repo-path]
#        ./scripts/golden-path-audit.sh --all
#

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }

audit_repo() {
  local REPO_PATH="$1"
  local REPO_NAME=$(basename "$REPO_PATH")

  FAILURES=0
  WARNINGS=0

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  Auditing: $REPO_NAME"
  echo "  Path: $REPO_PATH"
  echo "════════════════════════════════════════════════════════════"
  echo ""

  # Check if it's a git repo
  if [ ! -d "$REPO_PATH/.git" ]; then
    fail "Not a git repository (missing .git directory)"
    echo ""
    echo "Summary: CRITICAL - Not a valid git repo"
    return 1
  else
    pass "Valid git repository"
  fi

  echo ""
  echo "── Tier 1: Validation Requirements ──"
  echo ""

  # CLAUDE.md
  if [ -f "$REPO_PATH/CLAUDE.md" ]; then
    pass "CLAUDE.md exists"
  else
    fail "CLAUDE.md missing"
  fi

  # .claude/commands/sod.md
  if [ -f "$REPO_PATH/.claude/commands/sod.md" ]; then
    pass ".claude/commands/sod.md exists"
  else
    fail ".claude/commands/sod.md missing"
  fi

  # .claude/commands/eod.md
  if [ -f "$REPO_PATH/.claude/commands/eod.md" ]; then
    pass ".claude/commands/eod.md exists"
  else
    fail ".claude/commands/eod.md missing"
  fi

  # package.json (if it's a JS/TS project)
  if [ -f "$REPO_PATH/package.json" ] || [ -d "$REPO_PATH/app" ] || [ -d "$REPO_PATH/workers" ]; then
    # Check for lockfile in root or subdirs
    if find "$REPO_PATH" -maxdepth 3 -name "package-lock.json" -o -name "yarn.lock" -o -name "pnpm-lock.yaml" 2>/dev/null | grep -q .; then
      pass "Package lockfile exists"
    else
      fail "No package lockfile found (package-lock.json, yarn.lock, or pnpm-lock.yaml)"
    fi
  fi

  # tsconfig.json
  if find "$REPO_PATH" -maxdepth 3 -name "tsconfig.json" 2>/dev/null | grep -q .; then
    pass "TypeScript configured"
  else
    warn "No tsconfig.json found"
  fi

  # .gitignore
  if [ -f "$REPO_PATH/.gitignore" ]; then
    pass ".gitignore exists"
    # Check for common patterns
    if grep -q "node_modules" "$REPO_PATH/.gitignore" 2>/dev/null; then
      pass "node_modules in .gitignore"
    else
      warn "node_modules not in .gitignore"
    fi
    if grep -q ".env" "$REPO_PATH/.gitignore" 2>/dev/null; then
      pass ".env files in .gitignore"
    else
      warn ".env files not in .gitignore"
    fi
  else
    fail ".gitignore missing"
  fi

  # CI workflow
  if [ -d "$REPO_PATH/.github/workflows" ]; then
    if ls "$REPO_PATH/.github/workflows/"*.yml 2>/dev/null | grep -q .; then
      pass "GitHub Actions workflows exist"
    else
      fail "No workflow files in .github/workflows/"
    fi
  else
    fail ".github/workflows/ directory missing"
  fi

  echo ""
  echo "── Tier 2: Growth Requirements ──"
  echo ""

  # Security workflow
  if [ -f "$REPO_PATH/.github/workflows/security.yml" ] || [ -f "$REPO_PATH/.github/workflows/security.yaml" ]; then
    pass "Security workflow exists"
  else
    warn "No security.yml workflow (required for Tier 2)"
  fi

  # README.md
  if [ -f "$REPO_PATH/README.md" ]; then
    pass "README.md exists"
  else
    warn "README.md missing"
  fi

  # Check for .env files that shouldn't be committed
  if find "$REPO_PATH" -maxdepth 3 -name ".env" -o -name ".env.local" 2>/dev/null | grep -v node_modules | grep -q .; then
    warn "Found .env files - verify they are gitignored"
  fi

  # Gitleaks config
  if [ -f "$REPO_PATH/.gitleaks.toml" ]; then
    pass ".gitleaks.toml configured"
  else
    warn "No .gitleaks.toml (recommended to exclude node_modules)"
  fi

  # scripts/sod-universal.sh
  if [ -f "$REPO_PATH/scripts/sod-universal.sh" ]; then
    pass "scripts/sod-universal.sh exists"
  else
    warn "scripts/sod-universal.sh missing (may use crane-context bootstrap)"
  fi

  echo ""
  echo "── Summary ──"
  echo ""

  if [ $FAILURES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
  elif [ $FAILURES -eq 0 ]; then
    echo -e "${YELLOW}Passed with $WARNINGS warning(s)${NC}"
  else
    echo -e "${RED}Failed: $FAILURES issue(s), $WARNINGS warning(s)${NC}"
  fi

  return $FAILURES
}

# Main
if [ "$1" == "--all" ]; then
  PROJECTS_DIR="${PROJECTS_DIR:-$HOME/dev}"
  echo "Auditing all repos in: $PROJECTS_DIR"

  TOTAL_FAILURES=0

  for dir in "$PROJECTS_DIR"/*-console; do
    if [ -d "$dir" ]; then
      audit_repo "$dir"
      TOTAL_FAILURES=$((TOTAL_FAILURES + $?))
    fi
  done

  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  Total repos with failures: $TOTAL_FAILURES"
  echo "════════════════════════════════════════════════════════════"

  exit $TOTAL_FAILURES

elif [ -n "$1" ]; then
  audit_repo "$1"
  exit $?
else
  # Default: audit current directory
  audit_repo "$(pwd)"
  exit $?
fi
