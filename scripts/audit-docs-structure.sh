#!/bin/bash
#
# Audit docs/ directory structure against the documentation standard.
#
# Validates:
# - Required index.md presence in canonical directories
# - Naming convention compliance (kebab-case)
# - Non-canonical directories produce warnings
# - Minimum content check (20 lines, TBD count)
#
# Exit codes: 0 = clean, 1 = warnings only, 2 = errors
#
# Usage:
#   bash scripts/audit-docs-structure.sh [docs-root]
#   bash scripts/audit-docs-structure.sh              # defaults to ./docs
#

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

DOCS_ROOT="${1:-docs}"
ERRORS=0
WARNINGS=0

# Detect repo type by checking for ventures/ directory
if [ -d "$DOCS_ROOT/ventures" ] && [ -d "$DOCS_ROOT/company" ]; then
  REPO_TYPE="hub"
else
  REPO_TYPE="venture"
fi

# Canonical directories per the docs-standard.md
if [ "$REPO_TYPE" = "hub" ]; then
  REQUIRED_DIRS=(
    company
    operations
    instructions
    standards
    process
    infra
    runbooks
    adr
    design-system
    ventures
    handoffs
    reviews
    research
  )
  MANAGED_DIRS=(planning)
else
  REQUIRED_DIRS=(pm process handoffs)
  MANAGED_DIRS=()
fi

ALL_CANONICAL=("${REQUIRED_DIRS[@]}" "${MANAGED_DIRS[@]}")

echo -e "${BLUE}Documentation Structure Audit${NC}"
echo -e "Root: $DOCS_ROOT | Type: $REPO_TYPE"
echo ""

# === Check 1: Required directories exist ===
echo -e "${BLUE}--- Required Directories ---${NC}"
for dir in "${REQUIRED_DIRS[@]}"; do
  if [ ! -d "$DOCS_ROOT/$dir" ]; then
    echo -e "  ${RED}ERROR${NC} Missing required directory: $dir/"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  ${GREEN}OK${NC}    $dir/"
  fi
done

# === Check 2: index.md in all canonical directories ===
echo ""
echo -e "${BLUE}--- Index Files ---${NC}"
for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$DOCS_ROOT/$dir" ] && [ ! -f "$DOCS_ROOT/$dir/index.md" ]; then
    echo -e "  ${RED}ERROR${NC} Missing index.md: $dir/"
    ERRORS=$((ERRORS + 1))
  elif [ -d "$DOCS_ROOT/$dir" ]; then
    echo -e "  ${GREEN}OK${NC}    $dir/index.md"
  fi
done

# Check venture subdirectories (hub only)
if [ "$REPO_TYPE" = "hub" ] && [ -d "$DOCS_ROOT/ventures" ]; then
  for venture_dir in "$DOCS_ROOT"/ventures/*/; do
    [ -d "$venture_dir" ] || continue
    code=$(basename "$venture_dir")
    if [ ! -f "$venture_dir/index.md" ]; then
      echo -e "  ${RED}ERROR${NC} Missing index.md: ventures/$code/"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "  ${GREEN}OK${NC}    ventures/$code/index.md"
    fi
  done
fi

# === Check 3: Non-canonical directories ===
echo ""
echo -e "${BLUE}--- Non-Canonical Directories ---${NC}"
NON_CANONICAL=0
for dir in "$DOCS_ROOT"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")

  # Skip hidden dirs
  [[ "$name" == .* ]] && continue

  is_canonical=false
  for canonical in "${ALL_CANONICAL[@]}"; do
    if [ "$name" = "$canonical" ]; then
      is_canonical=true
      break
    fi
  done

  if ! $is_canonical; then
    echo -e "  ${YELLOW}WARN${NC}  Non-canonical directory: $name/"
    WARNINGS=$((WARNINGS + 1))
    NON_CANONICAL=$((NON_CANONICAL + 1))
  fi
done
if [ $NON_CANONICAL -eq 0 ]; then
  echo -e "  ${GREEN}OK${NC}    All directories are canonical"
fi

# === Check 4: Naming conventions ===
echo ""
echo -e "${BLUE}--- Naming Conventions ---${NC}"
NAMING_ISSUES=0
while IFS= read -r -d '' file; do
  filename=$(basename "$file")

  # Skip known exceptions
  case "$filename" in
    CLAUDE.md|README.md|index.md|.DS_Store|.gitkeep) continue ;;
  esac

  # Skip non-markdown files
  [[ "$filename" != *.md ]] && continue

  # Check kebab-case: only lowercase letters, digits, hyphens, dots
  if echo "$filename" | grep -qE '[A-Z_]'; then
    relpath="${file#$DOCS_ROOT/}"
    echo -e "  ${YELLOW}WARN${NC}  Non-kebab-case: $relpath"
    WARNINGS=$((WARNINGS + 1))
    NAMING_ISSUES=$((NAMING_ISSUES + 1))
  fi
done < <(find "$DOCS_ROOT" -type f -print0 2>/dev/null)
if [ $NAMING_ISSUES -eq 0 ]; then
  echo -e "  ${GREEN}OK${NC}    All files follow naming conventions"
fi

# === Check 5: Content quality ===
echo ""
echo -e "${BLUE}--- Content Quality ---${NC}"
CONTENT_ISSUES=0
while IFS= read -r -d '' file; do
  [[ "$file" != *.md ]] && continue
  relpath="${file#$DOCS_ROOT/}"

  line_count=$(wc -l < "$file" | tr -d '[:space:]')
  tbd_count=$(grep -ci 'TBD' "$file" 2>/dev/null || true)
  tbd_count="${tbd_count:-0}"
  tbd_count=$(echo "$tbd_count" | tr -d '[:space:]')

  if [ "$line_count" -lt 20 ] && [ "$line_count" -gt 0 ]; then
    echo -e "  ${YELLOW}WARN${NC}  Stub ($line_count lines): $relpath"
    WARNINGS=$((WARNINGS + 1))
    CONTENT_ISSUES=$((CONTENT_ISSUES + 1))
  fi

  if [ "$tbd_count" -gt 2 ]; then
    echo -e "  ${YELLOW}WARN${NC}  $tbd_count TBDs: $relpath"
    WARNINGS=$((WARNINGS + 1))
    CONTENT_ISSUES=$((CONTENT_ISSUES + 1))
  fi
done < <(find "$DOCS_ROOT" -type f -name "*.md" -print0 2>/dev/null)
if [ $CONTENT_ISSUES -eq 0 ]; then
  echo -e "  ${GREEN}OK${NC}    All content meets quality thresholds"
fi

# === Check 6: README.md completeness ===
echo ""
echo -e "${BLUE}--- README.md Completeness ---${NC}"
if [ ! -f "$DOCS_ROOT/README.md" ]; then
  echo -e "  ${RED}ERROR${NC} Missing docs/README.md"
  ERRORS=$((ERRORS + 1))
else
  README_ISSUES=0
  for dir in "${REQUIRED_DIRS[@]}"; do
    if ! grep -q "$dir" "$DOCS_ROOT/README.md" 2>/dev/null; then
      echo -e "  ${YELLOW}WARN${NC}  README.md does not mention: $dir/"
      WARNINGS=$((WARNINGS + 1))
      README_ISSUES=$((README_ISSUES + 1))
    fi
  done
  if [ $README_ISSUES -eq 0 ]; then
    echo -e "  ${GREEN}OK${NC}    README.md references all canonical directories"
  fi
fi

# === Summary ===
echo ""
echo "========================================="
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}$ERRORS error(s), $WARNINGS warning(s)${NC}"
  exit 2
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}0 errors, $WARNINGS warning(s)${NC}"
  exit 1
else
  echo -e "${GREEN}All checks passed${NC}"
  exit 0
fi
