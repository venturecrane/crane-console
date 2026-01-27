#!/bin/bash
set -uo pipefail

# eod-universal.sh - End of Day with Auto-Generated Handoffs
# Auto-generates handoffs from git commits, GitHub activity, and TodoWrite data

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============================================================================
# Helper Functions
# ============================================================================

# Retry wrapper for curl calls (retries 2x before failing)
curl_with_retry() {
  local max_attempts=3
  local attempt=1
  local delay=2
  local result

  while [ $attempt -le $max_attempts ]; do
    if result=$(curl -sS --max-time 15 "$@" 2>&1); then
      echo "$result"
      return 0
    fi

    if [ $attempt -lt $max_attempts ]; then
      echo -e "${YELLOW}Network error, retrying ($attempt/$max_attempts)...${NC}" >&2
      sleep $delay
      delay=$((delay * 2))
    fi
    ((attempt++))
  done

  echo "$result"
  return 1
}

# ============================================================================
# 1. Detect Repository and Find Active Session
# ============================================================================

# Get current repo
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?$/\1/' || echo "")

if [ -z "$REPO" ]; then
  echo -e "${RED}❌ Not in a git repository${NC}"
  exit 1
fi

# Determine venture from repo org
ORG=$(echo "$REPO" | cut -d'/' -f1)
case "$ORG" in
  durganfieldguide) VENTURE="dfg" ;;
  siliconcrane) VENTURE="sc" ;;
  venturecrane) VENTURE="vc" ;;
  *)
    echo -e "${RED}❌ Unknown venture for org: $ORG${NC}"
    exit 1
    ;;
esac

# Check for CRANE_CONTEXT_KEY (AC1: actionable error message)
if [ -z "${CRANE_CONTEXT_KEY:-}" ]; then
  echo -e "${RED}❌ CRANE_CONTEXT_KEY not set${NC}"
  echo ""
  echo -e "${YELLOW}To fix:${NC}"
  echo "  1. Get your key from Bitwarden (item: 'Crane Context Key')"
  echo "  2. Add to your shell config:"
  echo "     echo 'export CRANE_CONTEXT_KEY=\"your-key\"' >> ~/.zshrc"
  echo "  3. Reload: source ~/.zshrc"
  echo ""
  echo "  Or run the bootstrap script:"
  echo "     bash scripts/refresh-secrets.sh"
  exit 1
fi

# Detect CLI client (matches sod-universal.sh logic)
CLIENT="universal-cli"
if [ -n "${GEMINI_CLI_VERSION:-}" ]; then
  CLIENT="gemini-cli"
elif [ -n "${CLAUDE_CLI_VERSION:-}" ]; then
  CLIENT="claude-cli"
elif [ -n "${CODEX_CLI_VERSION:-}" ]; then
  CLIENT="codex-cli"
fi
AGENT_PREFIX="$CLIENT-$(hostname)"

# Check if session ID provided as argument
if [ -n "${1:-}" ]; then
  SESSION_ID="$1"
  echo "Using provided session ID: $SESSION_ID"
  echo ""
fi

# Query Context Worker for active sessions in this repo (with retry)
if ! ACTIVE_SESSIONS=$(curl_with_retry "https://crane-context.automation-ab6.workers.dev/active?agent=$AGENT_PREFIX&venture=$VENTURE&repo=$REPO" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY"); then
  echo -e "${RED}❌ Failed to reach Context Worker after 3 attempts${NC}"
  echo ""
  echo -e "${YELLOW}To fix:${NC}"
  echo "  1. Check your network connection"
  echo "  2. Verify CRANE_CONTEXT_KEY is valid"
  echo "  3. Try again in a few minutes"
  exit 1
fi

# If session ID was provided, use it; otherwise auto-detect
if [ -z "${SESSION_ID:-}" ]; then
  # Extract session ID for this agent
  SESSION_ID=$(echo "$ACTIVE_SESSIONS" | jq -r --arg agent "$AGENT_PREFIX" \
    '.sessions[] | select(.agent | startswith($agent)) | .id' | head -1)

  if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
    echo "❌ No active session found for this agent"
    echo ""
    echo "Run /sod first to start a session"
    echo ""
    echo "If you just ran /sod, the session may still be active."
    echo "Session ID can be provided manually:"
    echo "  bash scripts/eod-universal.sh <session-id>"
    exit 1
  fi
fi

# Get full session details
SESSION=$(echo "$ACTIVE_SESSIONS" | jq --arg id "$SESSION_ID" '.sessions[] | select(.id == $id)')

if [ -z "$SESSION" ] || [ "$SESSION" = "null" ]; then
  echo "❌ Session not found: $SESSION_ID"
  echo ""
  echo "Available sessions:"
  echo "$ACTIVE_SESSIONS" | jq -r '.sessions[] | "  \(.id) - \(.agent) - \(.status)"'
  exit 1
fi

TRACK=$(echo "$SESSION" | jq -r '.track // empty')

echo -e "\033[0;36m## 🌙 End of Day\033[0m"
echo ""
echo -e "\033[0;34mRepository:\033[0m $REPO"
echo -e "\033[0;34mVenture:\033[0m $VENTURE"
if [ -n "$TRACK" ]; then
  echo -e "\033[0;34mTrack:\033[0m $TRACK"
fi
echo -e "\033[0;34mSession:\033[0m $SESSION_ID"
echo ""

# ============================================================================
# 2. Auto-Generate Handoff from Work Artifacts
# ============================================================================

# Extract session start time
SESSION_START=$(echo "$SESSION" | jq -r '.started_at')

echo -e "\033[0;36m### 📊 Analyzing Session Activity\033[0m"
echo ""
echo -e "\033[0;34mSession started:\033[0m $SESSION_START"
echo ""

# ============================================================================
# Query Git Commits
# ============================================================================

echo "Querying git commits..."
GIT_COMMITS=$(git log --since="$SESSION_START" --format="%h %s" --no-merges 2>/dev/null || echo "")

COMMIT_COUNT=$(echo "$GIT_COMMITS" | grep -c . || echo "0")
echo "Found $COMMIT_COUNT commits"

# ============================================================================
# Query GitHub Issues
# ============================================================================

if command -v gh &> /dev/null; then
  echo "Querying GitHub issues..."

  # Issues created during session
  ISSUES_CREATED=$(gh issue list --repo "$REPO" --author @me --state all --json number,title,createdAt --jq ".[] | select(.createdAt > \"$SESSION_START\") | \"#\(.number): \(.title)\"" 2>/dev/null || echo "")

  # Issues closed during session
  ISSUES_CLOSED=$(gh issue list --repo "$REPO" --state closed --json number,title,closedAt --jq ".[] | select(.closedAt > \"$SESSION_START\") | \"#\(.number): \(.title)\"" 2>/dev/null || echo "")

  ISSUE_CREATED_COUNT=$(echo "$ISSUES_CREATED" | grep -c . || echo "0")
  ISSUE_CLOSED_COUNT=$(echo "$ISSUES_CLOSED" | grep -c . || echo "0")
  echo "Found $ISSUE_CREATED_COUNT issues created, $ISSUE_CLOSED_COUNT closed"
else
  ISSUES_CREATED=""
  ISSUES_CLOSED=""
  echo "GitHub CLI not available, skipping issue detection"
fi

# ============================================================================
# Query GitHub PRs
# ============================================================================

if command -v gh &> /dev/null; then
  echo "Querying GitHub PRs..."

  # PRs created during session
  PRS_CREATED=$(gh pr list --repo "$REPO" --author @me --state all --json number,title,createdAt --jq ".[] | select(.createdAt > \"$SESSION_START\") | \"#\(.number): \(.title)\"" 2>/dev/null || echo "")

  # PRs merged during session
  PRS_MERGED=$(gh pr list --repo "$REPO" --state merged --json number,title,mergedAt --jq ".[] | select(.mergedAt > \"$SESSION_START\") | \"#\(.number): \(.title)\"" 2>/dev/null || echo "")

  PR_CREATED_COUNT=$(echo "$PRS_CREATED" | grep -c . || echo "0")
  PR_MERGED_COUNT=$(echo "$PRS_MERGED" | grep -c . || echo "0")
  echo "Found $PR_CREATED_COUNT PRs created, $PR_MERGED_COUNT merged"
else
  PRS_CREATED=""
  PRS_MERGED=""
  echo "GitHub CLI not available, skipping PR detection"
fi

# ============================================================================
# Check TodoWrite Data
# ============================================================================

# Check if todo file exists (TodoWrite stores todos locally)
TODO_FILE=".claude/.todos"
TODOS_COMPLETED=""
TODOS_IN_PROGRESS=""

if [ -f "$TODO_FILE" ]; then
  echo "Reading TodoWrite data..."

  # Extract completed and in-progress todos
  TODOS_COMPLETED=$(jq -r '.[] | select(.status == "completed") | "- " + .content' "$TODO_FILE" 2>/dev/null || echo "")
  TODOS_IN_PROGRESS=$(jq -r '.[] | select(.status == "in_progress") | "- " + .content' "$TODO_FILE" 2>/dev/null || echo "")

  COMPLETED_COUNT=$(echo "$TODOS_COMPLETED" | grep -c . || echo "0")
  IN_PROGRESS_COUNT=$(echo "$TODOS_IN_PROGRESS" | grep -c . || echo "0")
  echo "Found $COMPLETED_COUNT completed todos, $IN_PROGRESS_COUNT in progress"
else
  echo "No TodoWrite data found"
fi

echo ""

# ============================================================================
# Get Current Branch (for in-progress context)
# ============================================================================

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

# ============================================================================
# Auto-Generate Handoff Content
# ============================================================================

echo -e "\033[0;36m### 📝 Generated Handoff\033[0m"
echo ""

# Build ACCOMPLISHED section
ACCOMPLISHED=""

if [ -n "$GIT_COMMITS" ]; then
  ACCOMPLISHED="${ACCOMPLISHED}Git commits:\n${GIT_COMMITS}\n\n"
fi

if [ -n "$ISSUES_CLOSED" ]; then
  ACCOMPLISHED="${ACCOMPLISHED}Issues closed:\n${ISSUES_CLOSED}\n\n"
fi

if [ -n "$PRS_MERGED" ]; then
  ACCOMPLISHED="${ACCOMPLISHED}PRs merged:\n${PRS_MERGED}\n\n"
fi

if [ -n "$TODOS_COMPLETED" ]; then
  ACCOMPLISHED="${ACCOMPLISHED}Tasks completed:\n${TODOS_COMPLETED}\n\n"
fi

if [ -z "$ACCOMPLISHED" ]; then
  ACCOMPLISHED="No tracked accomplishments (no commits, closed issues, or completed todos)"
fi

# Build IN_PROGRESS section
IN_PROGRESS=""

if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
  IN_PROGRESS="${IN_PROGRESS}Current branch: ${CURRENT_BRANCH}\n\n"
fi

if [ -n "$PRS_CREATED" ]; then
  IN_PROGRESS="${IN_PROGRESS}Open PRs:\n${PRS_CREATED}\n\n"
fi

if [ -n "$ISSUES_CREATED" ]; then
  IN_PROGRESS="${IN_PROGRESS}Issues created:\n${ISSUES_CREATED}\n\n"
fi

if [ -n "$TODOS_IN_PROGRESS" ]; then
  IN_PROGRESS="${IN_PROGRESS}Tasks in progress:\n${TODOS_IN_PROGRESS}\n\n"
fi

if [ -z "$IN_PROGRESS" ]; then
  IN_PROGRESS="No tracked work in progress"
fi

# BLOCKED section (currently no automated detection)
BLOCKED="None detected"

# Display generated content
echo -e "\033[0;34mAccomplished:\033[0m"
echo -e "$ACCOMPLISHED" | sed 's/^/  /'
echo ""
echo -e "\033[0;34mIn Progress:\033[0m"
echo -e "$IN_PROGRESS" | sed 's/^/  /'
echo ""
echo -e "\033[0;34mBlocked:\033[0m"
echo "  $BLOCKED"
echo ""

# Auto-determine status label
STATUS_LABEL="in-progress"
if [ -z "$GIT_COMMITS" ] && [ -z "$ISSUES_CREATED" ] && [ -z "$PRS_CREATED" ] && [ -z "$TODOS_IN_PROGRESS" ]; then
  STATUS_LABEL="done"
fi

echo -e "\033[0;34mStatus:\033[0m $STATUS_LABEL"
echo ""

# Build summary for Context Worker
SUMMARY=$(cat <<EOF
Session completed for $REPO (Track $TRACK)

Accomplished:
$(echo -e "$ACCOMPLISHED")

In Progress:
$(echo -e "$IN_PROGRESS")

Blocked:
$BLOCKED
EOF
)

# Build payload
PAYLOAD=$(jq -n \
  --arg accomplished "$ACCOMPLISHED" \
  --arg in_progress "$IN_PROGRESS" \
  --arg blocked "$BLOCKED" \
  '{
    accomplished: $accomplished,
    in_progress: $in_progress,
    blocked: $blocked,
    next_steps: "Continue from where left off"
  }')

# ============================================================================
# 3. Call Context Worker /eod
# ============================================================================

echo -e "\033[0;36m### 💾 Saving Handoff\033[0m"
echo ""

# Build request body (using auto-generated content)
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
    end_reason: "manual"
  }')

# Call API with retry
if ! RESPONSE=$(curl_with_retry "https://crane-context.automation-ab6.workers.dev/eod" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$REQUEST_BODY"); then
  echo -e "${RED}❌ Failed to reach Context Worker after 3 attempts${NC}"
  echo ""
  echo "Your handoff was NOT saved. You can try again with:"
  echo "  bash scripts/eod-universal.sh $SESSION_ID"
  exit 1
fi

# Check for errors
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
if [ -n "$ERROR" ]; then
  echo -e "${RED}❌ Failed to end session${NC}"
  echo ""
  echo "Error: $ERROR"
  echo "$RESPONSE" | jq '.'
  exit 1
fi

# ============================================================================
# 4. Display Results
# ============================================================================

HANDOFF_ID=$(echo "$RESPONSE" | jq -r '.handoff_id')
ENDED_AT=$(echo "$RESPONSE" | jq -r '.ended_at')

echo -e "\033[0;32m✅ Session ended successfully\033[0m"
echo ""
echo -e "\033[0;34mHandoff ID:\033[0m $HANDOFF_ID"
echo -e "\033[0;34mEnded at:\033[0m $ENDED_AT"
echo ""

# ============================================================================
# 5. Clean Up Local Cache
# ============================================================================

SESSION_CACHE="/tmp/crane-context/session.json"
if [ -f "$SESSION_CACHE" ]; then
  rm -f "$SESSION_CACHE"
  echo "🧹 Local session cache cleared"
  echo ""
fi

# ============================================================================
# 6. Display Next Steps
# ============================================================================

echo "---"
echo ""
echo "Your handoff has been stored in Context Worker."
echo ""
echo "Next session:"
echo "  1. Run /sod to start a new session"
echo "  2. The handoff will be available in 'last_handoff'"
echo ""
echo "Good work today! 👋"
