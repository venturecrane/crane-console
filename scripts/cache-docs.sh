#!/bin/bash
#
# Cache documentation from crane-context API
# Extracted from sod-universal.sh for use with MCP-based /sod
#
# Usage: ./scripts/cache-docs.sh
#
# Requires: CRANE_CONTEXT_KEY environment variable

set -o pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
CONTEXT_API_URL="https://crane-context.automation-ab6.workers.dev"
RELAY_KEY="${CRANE_CONTEXT_KEY:-}"
CACHE_DIR="/tmp/crane-context/docs"

# Check for API key
if [ -z "$RELAY_KEY" ]; then
  echo -e "${RED}Error: CRANE_CONTEXT_KEY not set${NC}" >&2
  echo "Run with: infisical run --path /vc -- $0" >&2
  exit 1
fi

# Detect venture from git remote
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's/.*github\.com[:\/]//;s/\.git$//')
if [ -z "$REPO" ]; then
  echo -e "${RED}Error: Not in a git repository${NC}" >&2
  exit 1
fi

ORG=$(echo "$REPO" | cut -d'/' -f1)

# Look up venture from API
VENTURE=$(curl -sS --max-time 5 "$CONTEXT_API_URL/ventures" 2>/dev/null | \
  jq -r --arg org "$ORG" '.ventures[] | select(.org == $org) | .code' 2>/dev/null)

if [ -z "$VENTURE" ]; then
  echo -e "${RED}Error: Unknown org '$ORG'${NC}" >&2
  exit 1
fi

# Create cache directory
mkdir -p "$CACHE_DIR"

# Fetch documentation
echo "Fetching documentation for $VENTURE..."

RESPONSE=$(curl -sS --max-time 15 "$CONTEXT_API_URL/sod" \
  -H "X-Relay-Key: $RELAY_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "{
    \"schema_version\": \"1.0\",
    \"agent\": \"cache-docs-script\",
    \"client\": \"bash\",
    \"venture\": \"$VENTURE\",
    \"repo\": \"$REPO\",
    \"include_docs\": true,
    \"docs_format\": \"full\"
  }" 2>/dev/null)

if ! echo "$RESPONSE" | jq -e '.documentation' > /dev/null 2>&1; then
  echo -e "${YELLOW}Warning: No documentation returned${NC}" >&2
  exit 0
fi

# Extract and save docs
DOC_COUNT=$(echo "$RESPONSE" | jq -r '.documentation.count // 0')

if [ "$DOC_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}No documentation available${NC}"
  exit 0
fi

echo "$RESPONSE" | jq -r '.documentation.docs[]? | @json' | while read -r doc; do
  DOC_NAME=$(echo "$doc" | jq -r '.doc_name')
  CONTENT=$(echo "$doc" | jq -r '.content')
  SCOPE=$(echo "$doc" | jq -r '.scope')
  VERSION=$(echo "$doc" | jq -r '.version')

  echo "$CONTENT" > "$CACHE_DIR/$DOC_NAME"
  echo -e "  ${GREEN}✓${NC} ${SCOPE}/${DOC_NAME} (v${VERSION})"
done

echo ""
echo -e "${GREEN}Cached $DOC_COUNT docs to $CACHE_DIR${NC}"
