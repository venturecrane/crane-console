#!/bin/bash
#
# Upload Venture Design Specs to Context Worker
#
# Iterates over docs/design/ventures/{code}/design-spec.md and uploads each
# as a venture-scoped document. Also uploads the VC design charter.
#
# Usage:
#   bash scripts/upload-design-specs.sh
#   bash scripts/upload-design-specs.sh --dry-run
#
# Requires CRANE_ADMIN_KEY in environment (available in crane sessions).
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPLOAD_SCRIPT="$SCRIPT_DIR/upload-doc-to-context-worker.sh"
VENTURES_DIR="$REPO_ROOT/docs/design/ventures"
CHARTER_FILE="$REPO_ROOT/docs/design/charter.md"

DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
fi

if [ "$DRY_RUN" = false ] && [ -z "$CRANE_ADMIN_KEY" ]; then
  echo -e "${RED}Error: CRANE_ADMIN_KEY not set.${NC}"
  echo "  Launch a crane session first: crane vc"
  echo "  Or preview with: bash scripts/upload-design-specs.sh --dry-run"
  exit 1
fi

if [ ! -x "$UPLOAD_SCRIPT" ]; then
  chmod +x "$UPLOAD_SCRIPT"
fi

echo -e "${YELLOW}Upload Venture Design Specs to Context Worker${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY RUN - no uploads will be performed${NC}"
fi
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# Upload venture design specs
if [ -d "$VENTURES_DIR" ]; then
  for venture_dir in "$VENTURES_DIR"/*/; do
    [ -d "$venture_dir" ] || continue
    code=$(basename "$venture_dir")
    spec_file="$venture_dir/design-spec.md"

    if [ ! -f "$spec_file" ]; then
      echo -e "${YELLOW}Skip: $code (no design-spec.md)${NC}"
      SKIP_COUNT=$((SKIP_COUNT + 1))
      continue
    fi

    echo "---"
    if [ "$DRY_RUN" = true ]; then
      size=$(wc -c < "$spec_file" | tr -d ' ')
      echo -e "${BLUE}Would upload:${NC} $spec_file -> scope=$code, doc_name=design-spec.md (${size} bytes)"
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
      if "$UPLOAD_SCRIPT" "$spec_file" "$code"; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo -e "${RED}Failed: $code/design-spec.md${NC}"
      fi
    fi
  done
else
  echo -e "${RED}Error: $VENTURES_DIR not found${NC}"
  exit 1
fi

# Upload VC design charter
echo ""
echo "---"
if [ -f "$CHARTER_FILE" ]; then
  if [ "$DRY_RUN" = true ]; then
    size=$(wc -c < "$CHARTER_FILE" | tr -d ' ')
    echo -e "${BLUE}Would upload:${NC} $CHARTER_FILE -> scope=vc, doc_name=design-charter.md (${size} bytes)"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    # Upload charter as design-charter.md scoped to vc.
    # Create a temp copy with the desired filename so the upload script
    # derives doc_name correctly.
    CHARTER_TEMP_DIR=$(mktemp -d)
    cp "$CHARTER_FILE" "$CHARTER_TEMP_DIR/design-charter.md"
    if "$UPLOAD_SCRIPT" "$CHARTER_TEMP_DIR/design-charter.md" vc; then
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
      echo -e "${RED}Failed: vc/design-charter.md${NC}"
    fi
    rm -rf "$CHARTER_TEMP_DIR"
  fi
else
  echo -e "${YELLOW}Skip: VC design charter (docs/design/charter.md not found)${NC}"
  SKIP_COUNT=$((SKIP_COUNT + 1))
fi

echo ""
echo "========================================="
echo -e "${GREEN}Uploaded: $SUCCESS_COUNT specs${NC}"
if [ $SKIP_COUNT -gt 0 ]; then
  echo -e "${YELLOW}Skipped: $SKIP_COUNT${NC}"
fi
if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}Failed: $FAIL_COUNT specs${NC}"
  exit 1
fi
