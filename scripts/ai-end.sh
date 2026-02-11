#!/bin/bash
#
# ai-end.sh - Quick session end wrapper with offline resilience
#
# Ends the current AI session with a handoff, using spool fallback
# if the network is unavailable.
#
# Usage: ai-end [outcome] [summary]
#
# Arguments:
#   outcome - Session outcome: success, done, in-progress, blocked (default: in-progress)
#   summary - Optional summary (auto-generated from git log if not provided)
#
# Examples:
#   ai-end                           # Auto-detect outcome and summary
#   ai-end success                   # Mark as successful
#   ai-end done "Completed feature"  # Mark done with custom summary
#   ai-end blocked "Waiting on API"  # Mark as blocked
#

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================================
# Parse Arguments
# ============================================================================

OUTCOME="${1:-in-progress}"
SUMMARY="${2:-}"

# Normalize outcome
case "$OUTCOME" in
  success|done|completed)
    STATUS_LABEL="done"
    ;;
  in-progress|wip|continue)
    STATUS_LABEL="in-progress"
    ;;
  blocked|waiting)
    STATUS_LABEL="blocked"
    ;;
  *)
    echo -e "${YELLOW}Unknown outcome '$OUTCOME', using 'in-progress'${NC}"
    STATUS_LABEL="in-progress"
    ;;
esac

# ============================================================================
# Find Session
# ============================================================================

SESSION_ENV_FILE="/tmp/crane-context/session.env"
SESSION_CACHE="/tmp/crane-context/session.json"

# Try to find session ID from various sources
SESSION_ID=""

# 1. Check session.env (from ai-sesh)
if [ -f "$SESSION_ENV_FILE" ]; then
  source "$SESSION_ENV_FILE"
fi

# 2. Check session.json cache (from sod-universal.sh)
if [ -z "$SESSION_ID" ] && [ -f "$SESSION_CACHE" ]; then
  SESSION_ID=$(jq -r '.session.id // empty' "$SESSION_CACHE" 2>/dev/null)
fi

# 3. Query active sessions from API
if [ -z "$SESSION_ID" ]; then
  # Get current repo
  REPO=$(git remote get-url origin 2>/dev/null | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?$/\1/' || echo "")

  if [ -z "$REPO" ]; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
  fi

  # Determine venture from repo name (all repos now under venturecrane)
  REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)
  case "$REPO_NAME" in
    crane-console) VENTURE="vc" ;;
    dfg-console) VENTURE="dfg" ;;
    sc-console) VENTURE="sc" ;;
    ke-console) VENTURE="ke" ;;
    smd-console) VENTURE="smd" ;;
    dc-console) VENTURE="dc" ;;
    *)
      echo -e "${RED}Error: Unknown venture for repo: $REPO_NAME${NC}"
      exit 1
      ;;
  esac

  # Detect CLI client
  CLIENT="universal-cli"
  if [ -n "${GEMINI_CLI_VERSION:-}" ]; then
    CLIENT="gemini-cli"
  elif [ -n "${CLAUDE_CLI_VERSION:-}" ]; then
    CLIENT="claude-cli"
  elif [ -n "${CODEX_CLI_VERSION:-}" ]; then
    CLIENT="codex-cli"
  fi
  AGENT_PREFIX="$CLIENT-$(hostname)"

  # Check for CRANE_CONTEXT_KEY
  if [ -z "${CRANE_CONTEXT_KEY:-}" ]; then
    echo -e "${RED}Error: CRANE_CONTEXT_KEY not set${NC}"
    exit 1
  fi

  # Query API for active sessions
  ACTIVE_SESSIONS=$(curl -sS --max-time 10 \
    "https://crane-context.automation-ab6.workers.dev/active?agent=$AGENT_PREFIX&venture=$VENTURE&repo=$REPO" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" 2>/dev/null) || ACTIVE_SESSIONS=""

  if [ -n "$ACTIVE_SESSIONS" ]; then
    SESSION_ID=$(echo "$ACTIVE_SESSIONS" | jq -r --arg agent "$AGENT_PREFIX" \
      '.sessions[] | select(.agent | startswith($agent)) | .id' 2>/dev/null | head -1)
  fi
fi

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
  echo -e "${RED}Error: No active session found${NC}"
  echo ""
  echo "Run /sod first to start a session, or provide session ID:"
  echo "  bash scripts/eod-universal.sh <session-id>"
  exit 1
fi

echo -e "${CYAN}## 🌙 Quick End of Day${NC}"
echo ""
echo -e "${CYAN}Session:${NC} $SESSION_ID"
echo -e "${CYAN}Outcome:${NC} $STATUS_LABEL"
echo ""

# ============================================================================
# Auto-Generate Summary if Not Provided
# ============================================================================

if [ -z "$SUMMARY" ]; then
  echo "Auto-generating summary from git log..."

  # Get commits from today
  GIT_COMMITS=$(git log --since="8 hours ago" --format="%s" --no-merges 2>/dev/null | head -5)

  if [ -n "$GIT_COMMITS" ]; then
    SUMMARY="Session commits:\n$GIT_COMMITS"
  else
    SUMMARY="Session ended (no commits)"
  fi
fi

echo -e "${CYAN}Summary:${NC}"
echo -e "$SUMMARY" | sed 's/^/  /'
echo ""

# ============================================================================
# Source Spool Library
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Try to source the spool library
SPOOL_AVAILABLE=false
if [ -f "$SCRIPT_DIR/ai-spool-lib.sh" ]; then
  source "$SCRIPT_DIR/ai-spool-lib.sh"
  SPOOL_AVAILABLE=true
elif [ -f "$HOME/.local/bin/ai-spool-lib.sh" ]; then
  source "$HOME/.local/bin/ai-spool-lib.sh"
  SPOOL_AVAILABLE=true
fi

# ============================================================================
# Build Request
# ============================================================================

# Build payload
PAYLOAD=$(jq -n \
  --arg accomplished "$SUMMARY" \
  --arg status "$STATUS_LABEL" \
  '{
    accomplished: $accomplished,
    in_progress: "See next session",
    blocked: "None",
    next_steps: "Continue from where left off"
  }')

# Build request body
REQUEST_BODY=$(jq -n \
  --arg session_id "$SESSION_ID" \
  --arg summary "$SUMMARY" \
  --argjson payload "$PAYLOAD" \
  --arg status_label "$STATUS_LABEL" \
  '{
    session_id: $session_id,
    summary: $summary,
    payload: $payload,
    status_label: $status_label,
    end_reason: "quick-end"
  }')

# ============================================================================
# Send Request with Spool Fallback
# ============================================================================

echo -e "${CYAN}### 💾 Saving Handoff${NC}"
echo ""

if [ "$SPOOL_AVAILABLE" = true ]; then
  # Use spool-aware function
  if RESPONSE=$(_ai_post_or_spool "/eod" "$SESSION_ID" "$REQUEST_BODY"); then
    # Check for API errors
    ERROR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$ERROR" ]; then
      echo -e "${RED}Error: $ERROR${NC}"
      exit 1
    fi

    HANDOFF_ID=$(echo "$RESPONSE" | jq -r '.handoff_id // "N/A"')
    echo -e "${GREEN}✓ Session ended successfully${NC}"
    echo -e "  Handoff ID: $HANDOFF_ID"
  else
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 1 ]; then
      echo -e "${YELLOW}Offline - handoff queued for later${NC}"
      echo "  Run 'ai-spool-flush' or '/sod' to send when online"
    else
      echo -e "${RED}Failed to end session${NC}"
      exit 1
    fi
  fi
else
  # Fallback to direct curl (no spool support)
  echo -e "${YELLOW}Note: Spool library not found, no offline fallback${NC}"

  RESPONSE=$(curl -sS --max-time 15 \
    "https://crane-context.automation-ab6.workers.dev/eod" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "$REQUEST_BODY" 2>&1)

  if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to reach API${NC}"
    echo "$RESPONSE"
    exit 1
  fi

  ERROR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
  if [ -n "$ERROR" ]; then
    echo -e "${RED}Error: $ERROR${NC}"
    exit 1
  fi

  HANDOFF_ID=$(echo "$RESPONSE" | jq -r '.handoff_id // "N/A"')
  echo -e "${GREEN}✓ Session ended successfully${NC}"
  echo -e "  Handoff ID: $HANDOFF_ID"
fi

# ============================================================================
# Clean Up
# ============================================================================

# Clear session cache
if [ -f "$SESSION_CACHE" ]; then
  rm -f "$SESSION_CACHE"
fi

echo ""
echo "Good work! 👋"
