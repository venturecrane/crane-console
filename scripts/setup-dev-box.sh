#!/bin/bash
# Bootstrap script for new dev boxes
# Prerequisites: Node.js 18+ and npm installed, Bitwarden CLI logged in
# Usage:
#   bw login                              # if first time
#   export BW_SESSION=$(bw unlock --raw)  # unlock vault
#   curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/setup-dev-box.sh | bash

set -e

echo "=== Crane Console Dev Box Setup ==="

# Check Node version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [[ -z "$NODE_VERSION" ]] || [[ "$NODE_VERSION" -lt 18 ]]; then
    echo "ERROR: Node.js 18+ required. Current: $(node -v 2>/dev/null || echo 'not installed')"
    exit 1
fi
echo "✓ Node.js $(node -v)"

# Check Bitwarden CLI
if ! command -v bw &> /dev/null; then
    echo "ERROR: Bitwarden CLI required. Install: npm install -g @bitwarden/cli"
    exit 1
fi
echo "✓ Bitwarden CLI installed"

# Check Bitwarden session
if [[ -z "$BW_SESSION" ]]; then
    echo "ERROR: Bitwarden vault locked."
    echo "  Run: export BW_SESSION=\$(bw unlock --raw)"
    exit 1
fi
echo "✓ Bitwarden session active"

# Install Claude Code if not present
if ! command -v claude &> /dev/null; then
    echo "Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code
else
    echo "✓ Claude Code already installed"
fi

# Detect shell config file
if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == */zsh ]]; then
    SHELL_RC="$HOME/.zshrc"
else
    SHELL_RC="$HOME/.bashrc"
fi

# Add ANTHROPIC_API_KEY from Bitwarden if not present
if ! grep -q ANTHROPIC_API_KEY "$SHELL_RC" 2>/dev/null; then
    echo "Fetching ANTHROPIC_API_KEY from Bitwarden..."
    API_KEY=$(bw get item "Anthropic API Key" | jq -r '.login.password // .notes // .fields[0].value')
    if [[ -z "$API_KEY" ]] || [[ "$API_KEY" == "null" ]]; then
        echo "ERROR: Could not fetch Anthropic API Key from Bitwarden"
        exit 1
    fi
    echo "export ANTHROPIC_API_KEY=\"$API_KEY\"" >> "$SHELL_RC"
    echo "✓ ANTHROPIC_API_KEY configured"
else
    echo "✓ ANTHROPIC_API_KEY already configured"
fi

# Add CRANE_CONTEXT_KEY if not present
if ! grep -q CRANE_CONTEXT_KEY "$SHELL_RC" 2>/dev/null; then
    echo "Fetching CRANE_CONTEXT_KEY from Bitwarden..."
    CONTEXT_KEY=$(bw get item "Crane Context Key" 2>/dev/null | jq -r '.login.password // .notes // .fields[0].value' 2>/dev/null)
    if [[ -z "$CONTEXT_KEY" ]] || [[ "$CONTEXT_KEY" == "null" ]]; then
        # Fallback to hardcoded value if not in Bitwarden
        CONTEXT_KEY="0216e886dbe2c31cd5ff0b8f6f46d954177e77b168a690e111bf67cfcc7062e8"
    fi
    echo "export CRANE_CONTEXT_KEY=\"$CONTEXT_KEY\"" >> "$SHELL_RC"
    echo "✓ CRANE_CONTEXT_KEY configured"
else
    echo "✓ CRANE_CONTEXT_KEY already configured"
fi

# Clone repo if not present
REPO_DIR="$HOME/dev/crane-console"
if [[ ! -d "$REPO_DIR" ]]; then
    echo "Cloning crane-console..."
    mkdir -p "$HOME/dev"
    git clone https://github.com/venturecrane/crane-console.git "$REPO_DIR"
else
    echo "✓ Repository already cloned at $REPO_DIR"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. source $SHELL_RC"
echo "  2. cd $REPO_DIR && claude"
echo "  3. /sod"
