#!/usr/bin/env bash
# crane-session — Start or reattach to a Claude session for a venture
# Usage: crane-session <venture>
#   e.g., crane-session vc
#
# If a tmux session named <venture> exists, attaches to it.
# Otherwise creates one and launches `crane <venture>` inside it.
# Transport-agnostic — works the same via ssh or mosh.

VENTURE="${1:-}"
if [ -z "$VENTURE" ]; then
  echo "Usage: crane-session <venture>"
  echo "Ventures: vc, ke, sc, dfg"
  exit 1
fi

SESSION="$VENTURE"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux attach-session -t "$SESSION"
else
  tmux new-session -d -s "$SESSION"
  tmux send-keys -t "$SESSION" "crane $VENTURE" C-m
  tmux attach-session -t "$SESSION"
fi
