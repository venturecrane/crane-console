#!/bin/bash
# Bootstrap script for new dev boxes
# Prerequisites: Node.js 18+ and npm installed
# Usage: curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/setup-dev-box.sh | bash

set -e

echo "=== Crane Console Dev Box Setup ==="

# Check Node version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [[ -z "$NODE_VERSION" ]] || [[ "$NODE_VERSION" -lt 18 ]]; then
    echo "ERROR: Node.js 18+ required. Current: $(node -v 2>/dev/null || echo 'not installed')"
    exit 1
fi
echo "✓ Node.js $(node -v)"

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

# Add CRANE_CONTEXT_KEY if not present
if ! grep -q CRANE_CONTEXT_KEY "$SHELL_RC" 2>/dev/null; then
    echo "Adding CRANE_CONTEXT_KEY to $SHELL_RC..."
    echo 'export CRANE_CONTEXT_KEY="0216e886dbe2c31cd5ff0b8f6f46d954177e77b168a690e111bf67cfcc7062e8"' >> "$SHELL_RC"
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
echo "  2. claude /login"
echo "  3. cd $REPO_DIR && claude"
echo "  4. /sod"
