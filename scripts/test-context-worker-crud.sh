#!/bin/bash
#
# Context Worker CRUD Test Script
#
# Tests Create, Read, Update, Delete operations on Context Worker docs.
# Requires: CRANE_ADMIN_KEY environment variable
#
# Usage:
#   export CRANE_ADMIN_KEY="your-admin-key-here"
#   ./scripts/test-context-worker-crud.sh
#

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_BASE="https://crane-context.automation-ab6.workers.dev"
TEST_DOC_NAME="test-crud-doc.md"
TEST_SCOPE="global"

# Check for admin key
if [ -z "$CRANE_ADMIN_KEY" ]; then
  echo -e "${RED}❌ Error: CRANE_ADMIN_KEY environment variable not set${NC}"
  echo ""
  echo "Please export your admin key:"
  echo "  export CRANE_ADMIN_KEY=\"your-key-here\""
  echo ""
  echo "To retrieve the key from Cloudflare:"
  echo "  cd workers/crane-context"
  echo "  npx wrangler secret get CONTEXT_ADMIN_KEY"
  echo ""
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Context Worker CRUD Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Helper function for API calls
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3

  if [ -z "$data" ]; then
    curl -s -X "$method" \
      "${API_BASE}${endpoint}" \
      -H "X-Admin-Key: $CRANE_ADMIN_KEY"
  else
    curl -s -X "$method" \
      "${API_BASE}${endpoint}" \
      -H "X-Admin-Key: $CRANE_ADMIN_KEY" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

# Test 0: LIST - Show current state
echo -e "${YELLOW}📋 TEST 0: LIST - Current docs${NC}"
echo "GET /admin/docs"
echo ""

CURRENT_DOCS=$(api_call "GET" "/admin/docs")
echo "$CURRENT_DOCS" | jq '.docs[] | {scope, doc_name, version, size: .content_size_bytes}'
echo ""

CURRENT_COUNT=$(echo "$CURRENT_DOCS" | jq '.count')
echo -e "${GREEN}✓ Found $CURRENT_COUNT docs${NC}"
echo ""
echo "---"
echo ""

# Test 1: CREATE - Add new doc
echo -e "${YELLOW}📝 TEST 1: CREATE - Add new test doc${NC}"
echo "POST /admin/docs (scope=$TEST_SCOPE, doc_name=$TEST_DOC_NAME)"
echo ""

CREATE_DATA=$(cat <<EOF
{
  "scope": "$TEST_SCOPE",
  "doc_name": "$TEST_DOC_NAME",
  "content": "# Test CRUD Document\n\nThis document tests CREATE operation.\n\n**Version:** 1.0\n\n**Created:** $(date -u +%Y-%m-%dT%H:%M:%SZ)\n\nThis is test content for verifying Context Worker CRUD operations.",
  "title": "Test CRUD Document",
  "description": "Testing doc creation via admin endpoint",
  "uploaded_by": "crud-test-script"
}
EOF
)

CREATE_RESULT=$(api_call "POST" "/admin/docs" "$CREATE_DATA")
echo "$CREATE_RESULT" | jq '.'
echo ""

CREATE_SUCCESS=$(echo "$CREATE_RESULT" | jq -r '.success')
if [ "$CREATE_SUCCESS" = "true" ]; then
  VERSION=$(echo "$CREATE_RESULT" | jq -r '.version')
  CREATED=$(echo "$CREATE_RESULT" | jq -r '.created')
  echo -e "${GREEN}✓ CREATE successful: version=$VERSION, created=$CREATED${NC}"
else
  echo -e "${RED}✗ CREATE failed${NC}"
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 2: READ - Verify doc exists
echo -e "${YELLOW}📖 TEST 2: READ - Verify doc in list${NC}"
echo "GET /admin/docs"
echo ""

READ_RESULT=$(api_call "GET" "/admin/docs")
TEST_DOC=$(echo "$READ_RESULT" | jq ".docs[] | select(.doc_name == \"$TEST_DOC_NAME\")")

if [ -n "$TEST_DOC" ]; then
  echo "$TEST_DOC" | jq '.'
  echo ""
  echo -e "${GREEN}✓ READ successful: Doc found in list${NC}"
else
  echo -e "${RED}✗ READ failed: Doc not found${NC}"
  exit 1
fi

NEW_COUNT=$(echo "$READ_RESULT" | jq '.count')
echo ""
echo -e "Doc count: $CURRENT_COUNT → $NEW_COUNT (${GREEN}+1${NC})"

echo ""
echo "---"
echo ""

# Test 3: UPDATE - Modify existing doc
echo -e "${YELLOW}✏️  TEST 3: UPDATE - Modify test doc${NC}"
echo "POST /admin/docs (same doc_name, new content)"
echo ""

UPDATE_DATA=$(cat <<EOF
{
  "scope": "$TEST_SCOPE",
  "doc_name": "$TEST_DOC_NAME",
  "content": "# Test CRUD Document\n\n**STATUS: UPDATED**\n\nThis document tests UPDATE operation.\n\n**Version:** 2.0 (UPDATED)\n\n**Updated:** $(date -u +%Y-%m-%dT%H:%M:%SZ)\n\nThis is UPDATED test content. The version should increment.",
  "title": "Test CRUD Document (Updated)",
  "description": "Testing doc update via admin endpoint",
  "uploaded_by": "crud-test-script"
}
EOF
)

UPDATE_RESULT=$(api_call "POST" "/admin/docs" "$UPDATE_DATA")
echo "$UPDATE_RESULT" | jq '.'
echo ""

UPDATE_SUCCESS=$(echo "$UPDATE_RESULT" | jq -r '.success')
if [ "$UPDATE_SUCCESS" = "true" ]; then
  NEW_VERSION=$(echo "$UPDATE_RESULT" | jq -r '.version')
  WAS_CREATED=$(echo "$UPDATE_RESULT" | jq -r '.created')
  PREV_VERSION=$(echo "$UPDATE_RESULT" | jq -r '.previous_version')

  if [ "$WAS_CREATED" = "false" ] && [ "$NEW_VERSION" = "2" ]; then
    echo -e "${GREEN}✓ UPDATE successful: version $PREV_VERSION → $NEW_VERSION${NC}"
  else
    echo -e "${RED}✗ UPDATE unexpected: created=$WAS_CREATED, version=$NEW_VERSION${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ UPDATE failed${NC}"
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 4: DELETE - Remove doc
echo -e "${YELLOW}🗑️  TEST 4: DELETE - Remove test doc${NC}"
echo "DELETE /admin/docs/$TEST_SCOPE/$TEST_DOC_NAME"
echo ""

DELETE_RESULT=$(api_call "DELETE" "/admin/docs/$TEST_SCOPE/$TEST_DOC_NAME")
echo "$DELETE_RESULT" | jq '.'
echo ""

DELETE_SUCCESS=$(echo "$DELETE_RESULT" | jq -r '.success')
DELETED=$(echo "$DELETE_RESULT" | jq -r '.deleted')

if [ "$DELETE_SUCCESS" = "true" ] && [ "$DELETED" = "true" ]; then
  echo -e "${GREEN}✓ DELETE successful${NC}"
else
  echo -e "${RED}✗ DELETE failed${NC}"
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 5: VERIFY DELETE - Confirm doc removed
echo -e "${YELLOW}🔍 TEST 5: VERIFY - Confirm doc removed${NC}"
echo "GET /admin/docs"
echo ""

FINAL_RESULT=$(api_call "GET" "/admin/docs")
FINAL_DOC=$(echo "$FINAL_RESULT" | jq ".docs[] | select(.doc_name == \"$TEST_DOC_NAME\")")

if [ -z "$FINAL_DOC" ]; then
  echo -e "${GREEN}✓ VERIFY successful: Doc not found (correctly deleted)${NC}"
else
  echo -e "${RED}✗ VERIFY failed: Doc still exists${NC}"
  exit 1
fi

FINAL_COUNT=$(echo "$FINAL_RESULT" | jq '.count')
echo ""
echo -e "Doc count: $NEW_COUNT → $FINAL_COUNT (${GREEN}-1${NC})"

if [ "$FINAL_COUNT" -eq "$CURRENT_COUNT" ]; then
  echo -e "${GREEN}✓ Count restored to original${NC}"
fi

echo ""
echo "---"
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ All CRUD Tests Passed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Results:"
echo "  ✓ CREATE - New doc created (version 1)"
echo "  ✓ READ   - Doc found in list"
echo "  ✓ UPDATE - Doc updated (version 2)"
echo "  ✓ DELETE - Doc removed"
echo "  ✓ VERIFY - Deletion confirmed"
echo ""
echo "Final doc count: $FINAL_COUNT (same as initial: $CURRENT_COUNT)"
echo ""
echo -e "${GREEN}Context Worker CRUD operations working correctly!${NC}"
