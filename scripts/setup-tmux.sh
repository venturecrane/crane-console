#!/usr/bin/env bash
# setup-tmux.sh — Deploy consistent tmux config across the Crane fleet
#
# Usage: bash scripts/setup-tmux.sh [machine...]
#   No args = all machines (mac23, mini, mbp27, m16)
#   With args = only specified machines
#
# What it does:
#   1. Installs Ghostty terminfo (xterm-ghostty) from local machine
#   2. Deploys ~/.tmux.conf (consistent config across fleet)
#
# Safe to re-run.

set -euo pipefail

ALL_MACHINES="mac23 mini mbp27 m16"

# Parse args — specific machines or all
if [ $# -gt 0 ]; then
  MACHINES="$*"
else
  MACHINES="$ALL_MACHINES"
fi

# The tmux.conf we deploy everywhere
TMUX_CONF='# Crane fleet tmux config
# Managed by scripts/setup-tmux.sh

# Use tmux-256color inside tmux (fixes backspace, colors from Ghostty)
set -g default-terminal "tmux-256color"

# Pass through true color from Ghostty
set -ga terminal-overrides ",xterm-ghostty:Tc"

# Mouse support (scroll, click, resize panes)
set -g mouse on

# 50k line scrollback
set -g history-limit 50000

# Start window/pane numbering at 1
set -g base-index 1
setw -g pane-base-index 1

# Show hostname in status bar (critical for multi-machine SSH)
set -g status-left "[#h] "
set -g status-left-length 20
set -g status-right "%H:%M"

# Faster escape (no lag when pressing Esc)
set -s escape-time 10

# Reload config with prefix+r
bind r source-file ~/.tmux.conf \; display "Config reloaded"

# Better scroll wheel handling
bind -n WheelUpPane if-shell -F -t = "#{mouse_any_flag}" "send-keys -M" "if -Ft= \"#{pane_in_mode}\" \"send-keys -M\" \"copy-mode -e; send-keys -M\""
bind -n WheelDownPane select-pane -t = \; send-keys -M

# OSC 52 clipboard — lets tmux copy reach the local clipboard
# through SSH/Mosh. Ghostty needs clipboard-write = allow (default).
# For manual selection: hold Shift + click/drag bypasses tmux mouse capture.
set -g set-clipboard on

# Keep copy mode after mouse drag
unbind -T copy-mode MouseDragEnd1Pane
unbind -T copy-mode-vi MouseDragEnd1Pane'

for machine in $MACHINES; do
  echo "--- $machine ---"

  # Check connectivity
  if ! ssh -o ConnectTimeout=5 "$machine" true 2>/dev/null; then
    echo "  SKIP: cannot reach $machine"
    continue
  fi

  # Install Ghostty terminfo if available locally and missing remotely
  if infocmp xterm-ghostty >/dev/null 2>&1; then
    if ssh "$machine" 'infocmp xterm-ghostty >/dev/null 2>&1'; then
      echo "  ghostty terminfo already installed — skipped"
    else
      infocmp -x xterm-ghostty | ssh "$machine" 'tic -x -' 2>/dev/null
      echo "  ghostty terminfo installed"
    fi
  fi

  # Deploy tmux.conf
  echo "$TMUX_CONF" | ssh "$machine" 'cat > ~/.tmux.conf'
  echo "  tmux.conf deployed"

  echo "  done"
done

echo ""
echo "Setup complete. tmux config deployed (use 'tmux' manually after SSH)"
