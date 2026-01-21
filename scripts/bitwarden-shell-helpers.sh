#!/bin/bash
# Bitwarden CLI Helper Functions
# Source this file in your shell configuration (.bashrc or .zshrc)

# ================================================
# Bitwarden CLI Helpers
# ================================================

# Unlock vault and export session key
alias bwunlock='export BW_SESSION=$(bw unlock --raw)'

# Sync vault with server
alias bwsync='bw sync'

# Quick secret retrieval (tries password field, falls back to notes)
bwget() {
  local result
  result=$(bw get password "$1" 2>/dev/null)
  if [ -z "$result" ]; then
    result=$(bw get notes "$1" 2>/dev/null)
  fi
  echo "$result"
}

# Copy secret directly to clipboard
# Detects OS and uses appropriate clipboard tool
bwcopy() {
  local secret=$(bwget "$1")

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "$secret" | pbcopy
    echo "Copied to clipboard: $1"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v xclip &> /dev/null; then
      echo "$secret" | xclip -selection clipboard
      echo "Copied to clipboard: $1"
    elif command -v xsel &> /dev/null; then
      echo "$secret" | xsel --clipboard
      echo "Copied to clipboard: $1"
    else
      echo "No clipboard tool found. Install xclip or xsel:"
      echo "  sudo apt install xclip"
      echo ""
      echo "Secret value:"
      echo "$secret"
    fi
  else
    echo "Unsupported OS. Secret value:"
    echo "$secret"
  fi
}
