#!/bin/bash
#
# Universal SOD (Start of Day) Script
# Works with any CLI that can execute bash scripts
#
# Integrates with Crane Context Worker to:
# - Load session context
# - Cache operational documentation
# - Display handoffs and work queues
#
# Usage: ./scripts/sod-universal.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Context Worker Configuration
CONTEXT_API_URL="https://crane-context.automation-ab6.workers.dev"
RELAY_KEY="056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f"
CACHE_DIR="/tmp/crane-context/docs"

# ============================================================================
# Step 1: Detect Repository Context
# ============================================================================

echo -e "${CYAN}## 🌅 Start of Day${NC}"
echo ""

REPO=$(git remote get-url origin | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?$/\1/')
ORG=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)

# Determine venture from org
case "$ORG" in
  durganfieldguide) VENTURE="dfg" ;;
  siliconcrane) VENTURE="sc" ;;
  venturecrane) VENTURE="vc" ;;
  *) VENTURE="unknown" ;;
esac

echo -e "${BLUE}Repository:${NC} $REPO_NAME"
echo -e "${BLUE}Venture:${NC} $VENTURE"
echo ""

if [ "$VENTURE" = "unknown" ]; then
  echo -e "${RED}Error: Could not determine venture from org '$ORG'${NC}"
  exit 1
fi

# ============================================================================
# Step 2: Call Context Worker /sod API
# ============================================================================

echo -e "${CYAN}### 🔄 Loading Session Context${NC}"
echo ""

# Detect CLI client
CLIENT="universal-cli"
if [ -n "$GEMINI_CLI_VERSION" ]; then
  CLIENT="gemini-cli"
elif [ -n "$CLAUDE_CLI_VERSION" ]; then
  CLIENT="claude-cli"
elif [ -n "$CODEX_CLI_VERSION" ]; then
  CLIENT="codex-cli"
fi

# Create SOD request payload
SOD_PAYLOAD=$(cat <<EOF
{
  "schema_version": "1.0",
  "agent": "$CLIENT-$(hostname)",
  "client": "$CLIENT",
  "client_version": "1.0.0",
  "host": "$(hostname)",
  "venture": "$VENTURE",
  "repo": "$REPO",
  "track": 1,
  "include_docs": true
}
EOF
)

# Call Context Worker
CONTEXT_RESPONSE=$(curl -sS "$CONTEXT_API_URL/sod" \
  -H "X-Relay-Key: $RELAY_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$SOD_PAYLOAD")

# Check for errors
if ! echo "$CONTEXT_RESPONSE" | jq -e '.session' > /dev/null 2>&1; then
  echo -e "${RED}Error: Failed to load session context${NC}"
  echo "$CONTEXT_RESPONSE" | jq '.'
  exit 1
fi

# Extract session info
SESSION_ID=$(echo "$CONTEXT_RESPONSE" | jq -r '.session.id')
SESSION_STATUS=$(echo "$CONTEXT_RESPONSE" | jq -r '.session.status')
CREATED_AT=$(echo "$CONTEXT_RESPONSE" | jq -r '.session.created_at')

echo -e "${GREEN}✓ Session loaded${NC}"
echo -e "${BLUE}Session ID:${NC} $SESSION_ID"
echo -e "${BLUE}Status:${NC} $SESSION_STATUS"
echo ""

# ============================================================================
# Step 3: Cache Documentation Locally
# ============================================================================

echo -e "${CYAN}### 📚 Caching Documentation${NC}"
echo ""

# Create cache directory
mkdir -p "$CACHE_DIR"

# Extract and save documentation
DOC_COUNT=$(echo "$CONTEXT_RESPONSE" | jq -r '.documentation.count // 0')

if [ "$DOC_COUNT" -gt 0 ]; then
  echo "$CONTEXT_RESPONSE" | jq -r '.documentation.docs[]? | @json' | while read -r doc; do
    DOC_NAME=$(echo "$doc" | jq -r '.doc_name')
    CONTENT=$(echo "$doc" | jq -r '.content')
    SCOPE=$(echo "$doc" | jq -r '.scope')
    VERSION=$(echo "$doc" | jq -r '.version')

    echo "$CONTENT" > "$CACHE_DIR/$DOC_NAME"
    echo -e "  ${GREEN}✓${NC} ${SCOPE}/${DOC_NAME} (v${VERSION})"
  done
  echo ""
  echo -e "${GREEN}Cached $DOC_COUNT docs to $CACHE_DIR${NC}"
else
  echo -e "${YELLOW}No documentation available${NC}"
fi
echo ""

# ============================================================================
# Step 4: Display Last Handoff
# ============================================================================

echo -e "${CYAN}### 📋 Last Handoff${NC}"
echo ""

HANDOFF_SUMMARY=$(echo "$CONTEXT_RESPONSE" | jq -r '.last_handoff.summary // "N/A"')

if [ "$HANDOFF_SUMMARY" != "N/A" ]; then
  HANDOFF_FROM=$(echo "$CONTEXT_RESPONSE" | jq -r '.last_handoff.from_agent')
  HANDOFF_DATE=$(echo "$CONTEXT_RESPONSE" | jq -r '.last_handoff.created_at')
  HANDOFF_STATUS=$(echo "$CONTEXT_RESPONSE" | jq -r '.last_handoff.status_label // "N/A"')

  echo -e "${BLUE}From:${NC} $HANDOFF_FROM"
  echo -e "${BLUE}When:${NC} $HANDOFF_DATE"
  echo -e "${BLUE}Status:${NC} $HANDOFF_STATUS"
  echo -e "${BLUE}Summary:${NC} $HANDOFF_SUMMARY"
else
  echo -e "${YELLOW}*No previous handoff found*${NC}"
fi
echo ""

# ============================================================================
# Step 5: Display Active Sessions
# ============================================================================

ACTIVE_COUNT=$(echo "$CONTEXT_RESPONSE" | jq -r '.active_sessions | length' 2>/dev/null || echo "0")

if [ "$ACTIVE_COUNT" -gt 1 ]; then
  echo -e "${CYAN}### 👥 Other Active Sessions${NC}"
  echo ""

  echo "$CONTEXT_RESPONSE" | jq -r '.active_sessions[]? | select(.agent != "'$CLIENT'-'$(hostname)'") | "  • \(.agent) - Track \(.track // "N/A") - Issue #\(.issue_number // "N/A")"'
  echo ""
fi

# ============================================================================
# Step 6: Check GitHub Issues
# ============================================================================

# Check if gh CLI is available
if command -v gh &> /dev/null; then

  echo -e "${CYAN}### 🚨 P0 Issues (Drop Everything)${NC}"
  echo ""

  P0_ISSUES=$(gh issue list --repo "$REPO" --label "prio:P0" --state open --json number,title --jq '.[] | "- #\(.number): \(.title)"' 2>/dev/null || echo "")

  if [ -n "$P0_ISSUES" ]; then
    echo "$P0_ISSUES"
    echo ""
    echo -e "${RED}**⚠️ P0 issues require immediate attention**${NC}"
  else
    echo -e "${GREEN}*None — no fires today* ✅${NC}"
  fi
  echo ""

  echo -e "${CYAN}### 📥 Ready for Development${NC}"
  echo ""

  READY_ISSUES=$(gh issue list --repo "$REPO" --label "status:ready" --state open --json number,title --jq '.[] | "- #\(.number): \(.title)"' 2>/dev/null || echo "")

  if [ -n "$READY_ISSUES" ]; then
    echo "$READY_ISSUES"
  else
    echo "*No issues in status:ready*"
  fi
  echo ""

  echo -e "${CYAN}### 🔧 Currently In Progress${NC}"
  echo ""

  IN_PROGRESS=$(gh issue list --repo "$REPO" --label "status:in-progress" --state open --json number,title --jq '.[] | "- #\(.number): \(.title)"' 2>/dev/null || echo "")

  if [ -n "$IN_PROGRESS" ]; then
    echo "$IN_PROGRESS"
  else
    echo "*Nothing currently in progress*"
  fi
  echo ""

  echo -e "${CYAN}### 🛑 Blocked${NC}"
  echo ""

  BLOCKED=$(gh issue list --repo "$REPO" --label "status:blocked" --state open --json number,title --jq '.[] | "- #\(.number): \(.title)"' 2>/dev/null || echo "")

  if [ -n "$BLOCKED" ]; then
    echo "$BLOCKED"
    echo ""
    echo "*Review blockers — can any be unblocked?*"
  else
    echo -e "${GREEN}*Nothing blocked* ✅${NC}"
  fi
  echo ""

else
  echo -e "${YELLOW}Note: Install gh CLI to see GitHub issues${NC}"
  echo ""
fi

# ============================================================================
# Step 7: Summary
# ============================================================================

echo "---"
echo ""
echo -e "${CYAN}**What would you like to focus on this session?**${NC}"
echo ""

# Provide recommendations based on context
if [ -n "$P0_ISSUES" ]; then
  echo -e "Recommendations:"
  echo -e "1. ${RED}Address P0 issues immediately${NC}"
  echo "2. Review blocked items"
  echo "3. Continue in-progress work"
else
  echo "Recommendations:"
  echo "1. Pick an issue from Ready queue"
  echo "2. Continue in-progress work"
  echo "3. Review blocked items"
fi

echo ""
echo -e "${BLUE}Documentation cached at:${NC} $CACHE_DIR"
echo -e "${BLUE}Session ID:${NC} $SESSION_ID"
echo -e "${BLUE}Context API:${NC} $CONTEXT_API_URL"
echo ""
