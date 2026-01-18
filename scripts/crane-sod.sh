#!/bin/bash
# Crane Start of Day (SOD) - Session Briefing with Documentation
# Usage: crane-sod.sh [venture] [track] [repo]
#
# Examples:
#   crane-sod.sh              # Auto-detect venture from git, track defaults to 1
#   crane-sod.sh vc           # Explicit venture, track defaults to 1
#   crane-sod.sh vc 2         # Explicit venture and track
#   crane-sod.sh vc 2 repo    # Explicit all arguments
#
# This script:
# 1. Calls the Context Worker SOD endpoint
# 2. Caches operational documentation locally
# 3. Provides a complete briefing for the agent session

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
CONTEXT_WORKER_URL="${CONTEXT_WORKER_URL:-https://crane-context.automation-ab6.workers.dev}"
RELAY_KEY="${CRANE_RELAY_KEY:-${CONTEXT_RELAY_KEY}}"
DOC_CACHE_DIR="/tmp/crane-context/docs"

# Parse arguments with defaults
VENTURE="${1:-}"
TRACK="${2:-1}"
REPO="${3:-}"

# Auto-detect venture from git remote if not provided
if [ -z "$VENTURE" ]; then
  if [ -d ".git" ]; then
    REPO_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
    case "$REPO_URL" in
      *venturecrane/crane-console*)
        VENTURE="vc"
        ;;
      *siliconcrane/sc-console*)
        VENTURE="sc"
        ;;
      *durganfieldguide/dfg-console*)
        VENTURE="dfg"
        ;;
      *)
        echo -e "${YELLOW}⚠️  Could not auto-detect venture from git remote${NC}"
        echo ""
        echo "Usage: crane-sod.sh [venture] [track] [repo]"
        echo ""
        echo "Supported ventures: vc, sc, dfg"
        echo ""
        echo "Examples:"
        echo "  crane-sod.sh              # Auto-detect from git (if in console repo)"
        echo "  crane-sod.sh vc           # Explicit venture, track=1"
        echo "  crane-sod.sh vc 2         # Explicit venture and track"
        exit 1
        ;;
    esac
    echo -e "${GREEN}✓${NC} Auto-detected venture: ${VENTURE}"
  else
    echo -e "${YELLOW}⚠️  Not in a git repository${NC}"
    echo ""
    echo "Usage: crane-sod.sh <venture> [track] [repo]"
    echo ""
    echo "Examples:"
    echo "  crane-sod.sh vc 1"
    echo "  crane-sod.sh dfg 2"
    exit 1
  fi
fi

# Auto-detect repo if not provided
if [ -z "$REPO" ]; then
  if [ -d ".git" ]; then
    # Extract from git remote
    REPO=$(git remote get-url origin 2>/dev/null | sed -E 's|^.*[:/]([^/]+/[^/]+)(\.git)?$|\1|' | sed 's/\.git$//')
  fi

  if [ -z "$REPO" ]; then
    echo "Error: Could not auto-detect repo. Please provide repo name as third argument."
    exit 1
  fi
fi

# Verify relay key
if [ -z "$RELAY_KEY" ]; then
  echo "Error: CRANE_RELAY_KEY or CONTEXT_RELAY_KEY environment variable not set"
  exit 1
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Crane Start of Day (SOD) - Session Briefing${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Prepare request
AGENT="cc-cli-$(hostname)"
REQUEST_BODY=$(cat <<EOF
{
  "schema_version": "1.0",
  "agent": "$AGENT",
  "client": "crane-sod-script",
  "client_version": "1.0.0",
  "venture": "$VENTURE",
  "repo": "$REPO",
  "track": $TRACK,
  "include_docs": true
}
EOF
)

echo -e "${BLUE}📡 Connecting to Context Worker...${NC}"
echo "   Venture: $VENTURE | Track: $TRACK | Repo: $REPO"
echo ""

# Call SOD endpoint
RESPONSE=$(curl -s -X POST "${CONTEXT_WORKER_URL}/sod" \
  -H "Content-Type: application/json" \
  -H "X-Relay-Key: ${RELAY_KEY}" \
  -d "$REQUEST_BODY")

# Check for errors
if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error')
  echo -e "${YELLOW}⚠️  Error from Context Worker:${NC}"
  echo "   $ERROR_MSG"
  exit 1
fi

# Extract session info
SESSION_ID=$(echo "$RESPONSE" | jq -r '.session_id')
SESSION_STATUS=$(echo "$RESPONSE" | jq -r '.status')
HEARTBEAT_INTERVAL=$(echo "$RESPONSE" | jq -r '.heartbeat_interval_seconds')

echo -e "${GREEN}✓${NC} Session ${SESSION_STATUS}: ${SESSION_ID}"
echo ""

# Process documentation
DOC_COUNT=$(echo "$RESPONSE" | jq -r '.documentation.count // 0')

if [ "$DOC_COUNT" -gt 0 ]; then
  echo -e "${BLUE}📚 Caching operational documentation...${NC}"

  # Create cache directory
  mkdir -p "$DOC_CACHE_DIR"

  # Save each document
  echo "$RESPONSE" | jq -c '.documentation.docs[]' | while read -r doc; do
    DOC_NAME=$(echo "$doc" | jq -r '.doc_name')
    DOC_TITLE=$(echo "$doc" | jq -r '.title // .doc_name')
    CONTENT=$(echo "$doc" | jq -r '.content')

    # Save to cache
    echo "$CONTENT" > "${DOC_CACHE_DIR}/${DOC_NAME}"

    echo -e "   ${GREEN}✓${NC} ${DOC_TITLE} → ${DOC_CACHE_DIR}/${DOC_NAME}"
  done

  echo ""
  echo -e "${GREEN}✓${NC} Cached ${DOC_COUNT} document(s) to ${DOC_CACHE_DIR}"
  echo ""
else
  echo -e "${YELLOW}⚠️  No documentation available for venture '${VENTURE}'${NC}"
  echo ""
fi

# Display briefing
echo -e "${CYAN}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Session Briefing${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Session Information:${NC}"
echo "   Session ID: ${SESSION_ID}"
echo "   Status: ${SESSION_STATUS}"
echo "   Agent: ${AGENT}"
echo "   Venture: ${VENTURE}"
echo "   Track: ${TRACK}"
echo "   Repo: ${REPO}"
echo ""

if [ "$DOC_COUNT" -gt 0 ]; then
  echo -e "${BLUE}Cached Documentation (${DOC_COUNT} files):${NC}"
  ls -1 "$DOC_CACHE_DIR" | while read -r file; do
    echo "   • ${file}"
  done
  echo ""
  echo -e "${CYAN}💡 Access docs at: ${DOC_CACHE_DIR}/${NC}"
  echo ""
fi

echo -e "${BLUE}Heartbeat:${NC}"
echo "   Send heartbeat every ${HEARTBEAT_INTERVAL} seconds"
echo "   Command: curl -X POST ${CONTEXT_WORKER_URL}/heartbeat \\"
echo "            -H 'X-Relay-Key: \$CRANE_RELAY_KEY' \\"
echo "            -d '{\"session_id\": \"${SESSION_ID}\"}'"
echo ""

# Check for latest handoff
HANDOFF=$(echo "$RESPONSE" | jq -r '.last_handoff // null')
if [ "$HANDOFF" != "null" ]; then
  HANDOFF_SUMMARY=$(echo "$HANDOFF" | jq -r '.summary')
  HANDOFF_FROM=$(echo "$HANDOFF" | jq -r '.from_agent')
  HANDOFF_DATE=$(echo "$HANDOFF" | jq -r '.created_at')

  echo -e "${YELLOW}📋 Latest Handoff from ${HANDOFF_FROM} (${HANDOFF_DATE}):${NC}"
  echo ""
  echo "$HANDOFF_SUMMARY" | fold -s -w 70 | sed 's/^/   /'
  echo ""
fi

echo -e "${CYAN}════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✨ Ready to start work! Session active.${NC}"
echo ""

# Export session ID for use in other scripts
export CRANE_SESSION_ID="$SESSION_ID"
echo "export CRANE_SESSION_ID=\"$SESSION_ID\"" > /tmp/crane-context/session.env

# Display helpful tips
echo -e "${CYAN}Helpful Commands:${NC}"
echo "   • View docs: cat ${DOC_CACHE_DIR}/<filename>"
echo "   • List docs: ls ${DOC_CACHE_DIR}"
echo "   • Session ID: echo \$CRANE_SESSION_ID"
echo ""
