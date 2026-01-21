#!/bin/bash
set -euo pipefail

# eod-universal.sh - End of Day with Auto-Generated Handoffs
# Auto-generates handoffs from git commits, GitHub activity, and TodoWrite data

# ============================================================================
# 1. Detect Repository and Find Active Session
# ============================================================================

# Get current repo
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?$/\1/' || echo "")

if [ -z "$REPO" ]; then
  echo "❌ Not in a git repository"
  exit 1
fi

# Determine venture from repo org
ORG=$(echo "$REPO" | cut -d'/' -f1)
case "$ORG" in
  durganfieldguide) VENTURE="dfg" ;;
  siliconcrane) VENTURE="sc" ;;
  venturecrane) VENTURE="vc" ;;
  *)
    echo "❌ Unknown venture for org: $ORG"
    exit 1
    ;;
esac

# Check for CRANE_CONTEXT_KEY
if [ -z "$CRANE_CONTEXT_KEY" ]; then
  echo "❌ CRANE_CONTEXT_KEY not set"
  echo ""
  echo "Export the key:"
  echo "  export CRANE_CONTEXT_KEY=\"your-key-here\""
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

# Query Context Worker for active sessions in this repo
ACTIVE_SESSIONS=$(curl -sS "https://crane-context.automation-ab6.workers.dev/active?agent=$AGENT_PREFIX&venture=$VENTURE&repo=$REPO" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY")

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

# Get full session details
SESSION=$(echo "$ACTIVE_SESSIONS" | jq --arg id "$SESSION_ID" '.sessions[] | select(.id == $id)')
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

# Call API
RESPONSE=$(curl -sS "https://crane-context.automation-ab6.workers.dev/eod" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$REQUEST_BODY")

# Check for errors
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
if [ -n "$ERROR" ]; then
  echo "❌ Failed to end session"
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
