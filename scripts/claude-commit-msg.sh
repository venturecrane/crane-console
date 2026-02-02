#!/bin/bash
# Generate commit message from staged changes using Claude
#
# Usage: ./scripts/claude-commit-msg.sh
#
# Requires: claude CLI, jq
# Cost: ~$0.01 per run

set -e

# Check dependencies
command -v claude >/dev/null 2>&1 || { echo "Error: claude CLI not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq not found"; exit 1; }

# Check for staged changes
if [ -z "$(git diff --cached)" ]; then
  echo "No staged changes to commit"
  exit 1
fi

# Generate commit message
echo "Generating commit message..."
RESULT=$(git diff --cached | claude -p "Write a commit message for these staged changes.

Rules:
- Use conventional commits format (feat/fix/docs/refactor/test/chore)
- First line: type(scope): description (max 72 chars)
- If the change is complex, add a blank line then bullet points explaining what changed
- Output ONLY the commit message, no explanation or markdown formatting
- Do not wrap in quotes" \
  --model sonnet \
  --output-format json 2>/dev/null)

# Check for errors
if echo "$RESULT" | jq -e '.is_error == true' > /dev/null 2>&1; then
  echo "Error generating message: $(echo "$RESULT" | jq -r '.result')"
  exit 1
fi

MSG=$(echo "$RESULT" | jq -r '.result')
COST=$(echo "$RESULT" | jq -r '.total_cost_usd')

if [ -z "$MSG" ] || [ "$MSG" = "null" ]; then
  echo "Failed to generate commit message"
  exit 1
fi

echo ""
echo "Generated message:"
echo "---"
echo "$MSG"
echo "---"
echo "(Cost: \$$COST)"
echo ""
read -p "Use this message? [Y/n/e(dit)] " choice

case "$choice" in
  n|N)
    echo "Aborted"
    exit 1
    ;;
  e|E)
    # Open in editor
    TMPFILE=$(mktemp)
    echo "$MSG" > "$TMPFILE"
    ${EDITOR:-vim} "$TMPFILE"
    MSG=$(cat "$TMPFILE")
    rm "$TMPFILE"
    ;;
esac

# Add co-author
MSG="$MSG

Co-Authored-By: Claude <noreply@anthropic.com>"

git commit -m "$MSG"
echo "Committed!"
