#!/bin/bash
# Check for pending reminders

REMINDER_FILE="$HOME/Documents/SMDurgan LLC/Projects/crane-console/REMINDER-delete-apple-note.md"
TARGET_DATE="2026-02-04"

if [ ! -f "$REMINDER_FILE" ]; then
  # Reminder already handled
  exit 0
fi

# Get current date in same format
CURRENT_DATE=$(date +%Y-%m-%d)

# Compare dates
if [[ "$CURRENT_DATE" > "$TARGET_DATE" ]] || [[ "$CURRENT_DATE" == "$TARGET_DATE" ]]; then
  echo ""
  echo "⏰ ============================================"
  echo "   REMINDER: Time to delete Apple Note backup!"
  echo "============================================"
  echo ""
  echo "It's been 2 weeks since Bitwarden migration."
  echo "Review the checklist and delete the old Apple Note:"
  echo ""
  echo "  cat '$REMINDER_FILE'"
  echo ""
  echo "After completing, remove the reminder:"
  echo "  rm '$REMINDER_FILE'"
  echo ""
fi
