#!/bin/bash
#
# ai-sesh.sh - tmux session launcher with spool integration
#
# Creates or attaches to a tmux session for AI-assisted development.
# Flushes any pending offline requests on entry.
#
# Usage: ai-sesh <repo> [agent]
#
# Arguments:
#   repo   - Repository name (e.g., crane-console)
#   agent  - Agent name (default: claude)
#
# Examples:
#   ai-sesh crane-console
#   ai-sesh crane-console claude
#   ai-sesh dfg-app gemini
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

REPO="${1:-}"
AGENT="${2:-claude}"

if [ -z "$REPO" ]; then
  echo -e "${RED}Usage: ai-sesh <repo> [agent]${NC}"
  echo ""
  echo "Arguments:"
  echo "  repo   - Repository name (e.g., crane-console)"
  echo "  agent  - Agent name (default: claude)"
  echo ""
  echo "Examples:"
  echo "  ai-sesh crane-console"
  echo "  ai-sesh crane-console gemini"
  exit 1
fi

# ============================================================================
# Generate Session Name
# ============================================================================

DATE_SUFFIX=$(date +%Y%m%d)
SESSION_NAME="${REPO}-${AGENT}-${DATE_SUFFIX}"

# ============================================================================
# Check for tmux
# ============================================================================

if ! command -v tmux &> /dev/null; then
  echo -e "${RED}Error: tmux not installed${NC}"
  echo ""
  echo "Install with:"
  echo "  macOS: brew install tmux"
  echo "  Linux: sudo apt install tmux"
  exit 1
fi

# ============================================================================
# Flush Spool on Entry
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Try to source the spool library
if [ -f "$SCRIPT_DIR/ai-spool-lib.sh" ]; then
  source "$SCRIPT_DIR/ai-spool-lib.sh"
elif [ -f "$HOME/.local/bin/ai-spool-lib.sh" ]; then
  source "$HOME/.local/bin/ai-spool-lib.sh"
fi

# Check for pending requests and flush
if type _ai_spool_count &>/dev/null; then
  SPOOL_COUNT=$(_ai_spool_count)
  if [ "$SPOOL_COUNT" -gt 0 ]; then
    echo -e "${CYAN}Flushing $SPOOL_COUNT spooled request(s)...${NC}"
    ai_spool_flush 2>/dev/null || true
    echo ""
  fi
fi

# ============================================================================
# Create or Attach to Session
# ============================================================================

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo -e "${GREEN}Attaching to existing session: $SESSION_NAME${NC}"
  tmux attach-session -t "$SESSION_NAME"
else
  echo -e "${GREEN}Creating new session: $SESSION_NAME${NC}"

  # Create session directory for transcripts (optional)
  TRANSCRIPT_DIR="$HOME/.ai_transcripts"
  mkdir -p "$TRANSCRIPT_DIR"

  # Store session info for ai-end to find
  SESSION_ENV_DIR="/tmp/crane-context"
  mkdir -p "$SESSION_ENV_DIR"

  cat > "$SESSION_ENV_DIR/session.env" << EOF
AI_SESSION_NAME=$SESSION_NAME
AI_SESSION_REPO=$REPO
AI_SESSION_AGENT=$AGENT
AI_SESSION_STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

  # Create and attach to new session
  tmux new-session -d -s "$SESSION_NAME"

  # Set up session environment
  tmux send-keys -t "$SESSION_NAME" "export AI_SESSION_NAME='$SESSION_NAME'" C-m
  tmux send-keys -t "$SESSION_NAME" "export AI_SESSION_REPO='$REPO'" C-m
  tmux send-keys -t "$SESSION_NAME" "export AI_SESSION_AGENT='$AGENT'" C-m
  tmux send-keys -t "$SESSION_NAME" "clear" C-m

  echo -e "${CYAN}Session environment:${NC}"
  echo "  AI_SESSION_NAME=$SESSION_NAME"
  echo "  AI_SESSION_REPO=$REPO"
  echo "  AI_SESSION_AGENT=$AGENT"
  echo ""

  # Attach to session
  tmux attach-session -t "$SESSION_NAME"
fi
