#!/bin/bash
#
# Upload Instruction Modules to Context Worker
#
# Iterates over docs/instructions/*.md and uploads each as a global-scoped
# document via upload-doc-to-context-worker.sh.
#
# Usage:
#   infisical run --path /vc -- bash scripts/upload-instructions.sh
#
# Requires CRANE_ADMIN_KEY in environment (injected by infisical).
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTRUCTIONS_DIR="$REPO_ROOT/docs/instructions"
UPLOAD_SCRIPT="$SCRIPT_DIR/upload-doc-to-context-worker.sh"

if [ -z "$CRANE_ADMIN_KEY" ]; then
  echo -e "${RED}Error: CRANE_ADMIN_KEY not set. Run with:${NC}"
  echo "  infisical run --path /vc -- bash scripts/upload-instructions.sh"
  exit 1
fi

if [ ! -d "$INSTRUCTIONS_DIR" ]; then
  echo -e "${RED}Error: $INSTRUCTIONS_DIR not found${NC}"
  exit 1
fi

if [ ! -x "$UPLOAD_SCRIPT" ]; then
  chmod +x "$UPLOAD_SCRIPT"
fi

echo -e "${YELLOW}Uploading instruction modules to Context Worker${NC}"
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0

for doc in "$INSTRUCTIONS_DIR"/*.md; do
  [ -f "$doc" ] || continue
  echo "---"
  if "$UPLOAD_SCRIPT" "$doc" global; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo -e "${RED}Failed: $(basename "$doc")${NC}"
  fi
done

echo ""
echo "========================================="
echo -e "${GREEN}Uploaded: $SUCCESS_COUNT modules${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}Failed: $FAIL_COUNT modules${NC}"
  exit 1
fi
