#!/bin/bash
# Generate weekly development summary using Claude
#
# Usage: ./scripts/claude-weekly-summary.sh [since]
#   since: Optional, defaults to "1 week ago"
#
# Examples:
#   ./scripts/claude-weekly-summary.sh              # Last week
#   ./scripts/claude-weekly-summary.sh "2 days ago" # Last 2 days
#   ./scripts/claude-weekly-summary.sh "2026-01-27" # Since specific date
#
# Requires: claude CLI, jq
# Cost: ~$0.03 per run

set -e

# Check dependencies
command -v claude >/dev/null 2>&1 || { echo "Error: claude CLI not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq not found"; exit 1; }

SINCE="${1:-1 week ago}"

# Get commit log
LOG=$(git log --oneline --since="$SINCE" 2>/dev/null)

if [ -z "$LOG" ]; then
  echo "No commits since $SINCE"
  exit 0
fi

COMMIT_COUNT=$(echo "$LOG" | wc -l | tr -d ' ')
echo "Generating summary for $COMMIT_COUNT commits since \"$SINCE\"..."

# Generate summary
RESULT=$(echo "$LOG" | claude -p "Summarize this development work for a standup or weekly update.

Format your response as:
## Summary
2-3 sentence overview of the week's work.

## Key Accomplishments
- Bullet points of main achievements
- Focus on outcomes, not just activities

## Themes
Any patterns or focus areas this week.

Be concise and professional." \
  --model sonnet \
  --output-format json 2>/dev/null)

# Check for errors
if echo "$RESULT" | jq -e '.is_error == true' > /dev/null 2>&1; then
  echo "Error generating summary: $(echo "$RESULT" | jq -r '.result')"
  exit 1
fi

SUMMARY=$(echo "$RESULT" | jq -r '.result')
COST=$(echo "$RESULT" | jq -r '.total_cost_usd')

if [ -z "$SUMMARY" ] || [ "$SUMMARY" = "null" ]; then
  echo "Failed to generate summary"
  exit 1
fi

echo ""
echo "$SUMMARY"
echo ""
echo "---"
echo "(Cost: \$$COST | Commits: $COMMIT_COUNT)"
