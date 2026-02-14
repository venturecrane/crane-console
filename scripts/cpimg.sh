#!/usr/bin/env bash
# cpimg — Push clipboard image to a remote machine via SCP
#
# Usage:
#   cpimg <target>    Push clipboard image to target machine, copy path to clipboard
#   cpimg             Save clipboard image locally, print path
#
# Requires: pngpaste (macOS: brew install pngpaste) or xclip (Linux)

set -euo pipefail

TARGET="${1:-}"
TIMESTAMP="$(date +%s)"
LOCAL_TMP="/tmp/cpimg-${TIMESTAMP}.png"

# --- Read clipboard image ---
if [[ "$(uname)" == "Darwin" ]]; then
  if ! command -v pngpaste &>/dev/null; then
    echo "error: pngpaste not found — install with: brew install pngpaste" >&2
    exit 1
  fi
  if ! pngpaste "$LOCAL_TMP" 2>/dev/null; then
    echo "error: no image in clipboard" >&2
    exit 1
  fi
else
  if ! command -v xclip &>/dev/null; then
    echo "error: xclip not found — install with your package manager" >&2
    exit 1
  fi
  if ! xclip -selection clipboard -t image/png -o > "$LOCAL_TMP" 2>/dev/null || [ ! -s "$LOCAL_TMP" ]; then
    rm -f "$LOCAL_TMP"
    echo "error: no image in clipboard" >&2
    exit 1
  fi
fi

# --- Clean up old cpimg files (>1 hour) ---
find /tmp -maxdepth 1 -name 'cpimg-*.png' -mmin +60 -delete 2>/dev/null || true

# --- Push or local ---
if [ -n "$TARGET" ]; then
  REMOTE_PATH="/tmp/cpimg-${TIMESTAMP}.png"
  if ! scp -o ConnectTimeout=5 "$LOCAL_TMP" "${TARGET}:${REMOTE_PATH}" 2>/dev/null; then
    rm -f "$LOCAL_TMP"
    echo "error: cannot reach $TARGET" >&2
    exit 1
  fi
  rm -f "$LOCAL_TMP"
  echo "$REMOTE_PATH"
  # Copy path to local clipboard for easy paste
  if [[ "$(uname)" == "Darwin" ]]; then
    printf '%s' "$REMOTE_PATH" | pbcopy
  elif command -v xclip &>/dev/null; then
    printf '%s' "$REMOTE_PATH" | xclip -selection clipboard
  fi
else
  echo "$LOCAL_TMP"
fi
