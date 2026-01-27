#!/bin/bash
# Bootstrap script for new dev boxes
# Sets up Claude Code, Codex CLI, and Gemini CLI with consistent /sod and /eod
#
# Prerequisites: Node.js 18+ and npm installed, Bitwarden CLI logged in
# Usage:
#   bw login                              # if first time
#   export BW_SESSION=$(bw unlock --raw)  # unlock vault
#   curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/setup-dev-box.sh | bash

set -e

echo "=== Crane Console Dev Box Setup ==="
echo "Setting up Claude Code, Codex CLI, and Gemini CLI"
echo ""

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

# Detect shell config file
if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == */zsh ]]; then
    SHELL_RC="$HOME/.zshrc"
else
    SHELL_RC="$HOME/.bashrc"
fi

echo ""
echo "--- Installing CLI Tools ---"

# Version pinning - update these intentionally, not accidentally
# Check https://www.npmjs.com/package/@anthropic-ai/claude-code for latest
CLAUDE_VERSION="2.1.20"
CODEX_VERSION="0.1.2505302029"
GEMINI_VERSION="0.1.17"

# Install Claude Code if not present
if ! command -v claude &> /dev/null; then
    echo "Installing Claude Code@$CLAUDE_VERSION..."
    npm install -g @anthropic-ai/claude-code@$CLAUDE_VERSION
else
    echo "✓ Claude Code already installed"
fi

# Install Codex CLI if not present
if ! command -v codex &> /dev/null; then
    echo "Installing Codex CLI@$CODEX_VERSION..."
    npm install -g @openai/codex@$CODEX_VERSION
else
    echo "✓ Codex CLI already installed"
fi

# Install Gemini CLI if not present
if ! command -v gemini &> /dev/null; then
    echo "Installing Gemini CLI@$GEMINI_VERSION..."
    npm install -g @google/gemini-cli@$GEMINI_VERSION
else
    echo "✓ Gemini CLI already installed"
fi

echo ""
echo "--- Configuring Environment ---"

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

# Add OPENAI_API_KEY from Bitwarden if not present
if ! grep -q OPENAI_API_KEY "$SHELL_RC" 2>/dev/null; then
    echo "Fetching OPENAI_API_KEY from Bitwarden..."
    OPENAI_KEY=$(bw get item "OpenAI API Key - Codex" 2>/dev/null | jq -r '.login.password // .notes // .fields[0].value' 2>/dev/null)
    if [[ -z "$OPENAI_KEY" ]] || [[ "$OPENAI_KEY" == "null" ]]; then
        echo "WARNING: Could not fetch OpenAI API Key from Bitwarden - Codex will require manual auth"
    else
        echo "export OPENAI_API_KEY=\"$OPENAI_KEY\"" >> "$SHELL_RC"
        echo "✓ OPENAI_API_KEY configured"
    fi
else
    echo "✓ OPENAI_API_KEY already configured"
fi

# Add GEMINI_API_KEY from Bitwarden if not present
if ! grep -q GEMINI_API_KEY "$SHELL_RC" 2>/dev/null; then
    echo "Fetching GEMINI_API_KEY from Bitwarden..."
    GEMINI_KEY=$(bw get item "Gemini API Key - General" 2>/dev/null | jq -r '.login.password // .notes // .fields[0].value' 2>/dev/null)
    if [[ -z "$GEMINI_KEY" ]] || [[ "$GEMINI_KEY" == "null" ]]; then
        echo "WARNING: Could not fetch Gemini API Key from Bitwarden - Gemini will require manual auth"
    else
        echo "export GEMINI_API_KEY=\"$GEMINI_KEY\"" >> "$SHELL_RC"
        echo "✓ GEMINI_API_KEY configured"
    fi
else
    echo "✓ GEMINI_API_KEY already configured"
fi

# Add GITHUB_MCP_PAT for Gemini MCP integration
if ! grep -q GITHUB_MCP_PAT "$SHELL_RC" 2>/dev/null; then
    echo "Adding GITHUB_MCP_PAT (uses gh auth token)..."
    echo 'export GITHUB_MCP_PAT=$(gh auth token 2>/dev/null)' >> "$SHELL_RC"
    echo "✓ GITHUB_MCP_PAT configured"
else
    echo "✓ GITHUB_MCP_PAT already configured"
fi

echo ""
echo "--- Cloning Repository ---"

# Clone repo if not present
REPO_DIR="$HOME/dev/crane-console"
if [[ ! -d "$REPO_DIR" ]]; then
    echo "Cloning crane-console..."
    mkdir -p "$HOME/dev"
    git clone https://github.com/venturecrane/crane-console.git "$REPO_DIR"
else
    echo "✓ Repository already cloned at $REPO_DIR"
    echo "  Pulling latest..."
    cd "$REPO_DIR" && git pull origin main
fi

echo ""
echo "--- Setting up Codex Prompts ---"

# Create Codex prompts directory
mkdir -p "$HOME/.codex/prompts"

# Create Codex /sod prompt
cat > "$HOME/.codex/prompts/sod.md" << 'SODEOF'
# Start of Day (SOD)

Load session context and operational documentation from Crane Context Worker.

## Execution

Run the Start of Day script:

```bash
bash scripts/sod-universal.sh
```

## What This Does

1. Detects the current repository and venture
2. Loads session context from Crane Context Worker
3. Caches operational documentation to /tmp/crane-context/docs/
4. Displays handoffs from previous sessions
5. Shows GitHub issues and work priorities

## Requirements

- `CRANE_CONTEXT_KEY` environment variable must be set
- Network access to crane-context.automation-ab6.workers.dev
- `gh` CLI (optional, for GitHub issue display)

## After Running

1. **CONFIRM CONTEXT**: State the venture and repo shown in the Context Confirmation box. Verify with user this is correct.
2. **STOP** and wait for user direction. Do NOT automatically start working on issues.
3. Present a brief summary and ask "What would you like to focus on?"

You will have:
- Complete operational documentation cached locally
- Session context from previous work
- Visibility into current work priorities
- GitHub issue status across all queues

Use the cached documentation at /tmp/crane-context/docs/ as reference throughout this session.

## Wrong Repo Prevention

If you create any GitHub issues during this session, they MUST go to the repo shown in Context Confirmation. If you find yourself targeting a different repo, STOP and verify with the user before proceeding.
SODEOF
echo "✓ Codex /sod prompt created"

# Create Codex /eod prompt
cat > "$HOME/.codex/prompts/eod.md" << 'EODEOF'
# End of Day (EOD)

Auto-generate a handoff and end your development session.

## Execution

Run the End of Day script:

```bash
bash scripts/eod-universal.sh
```

## What This Does

1. Finds your active session in Crane Context Worker
2. Auto-generates a handoff summary from:
   - Git commits in your current session
   - GitHub issue/PR activity
   - Work completed and in-progress items
3. Creates a structured handoff for the next session
4. Ends your session cleanly

## Handoff Storage

The handoff will be stored in Crane Context Worker and automatically loaded when the next session starts with /sod.

## Optional: Specific Session

If you have a specific session ID to end, pass it as an argument:

```bash
bash scripts/eod-universal.sh <session-id>
```
EODEOF
echo "✓ Codex /eod prompt created"

echo ""
echo "--- Configuring Claude Code ---"

# Set hasCompletedOnboarding to skip login prompt when using API key
CLAUDE_CONFIG="$HOME/.claude.json"
if [[ -f "$CLAUDE_CONFIG" ]]; then
    if command -v jq &> /dev/null; then
        jq '.hasCompletedOnboarding = true' "$CLAUDE_CONFIG" > /tmp/claude.json && mv /tmp/claude.json "$CLAUDE_CONFIG"
        echo "✓ Claude Code onboarding flag set"
    fi
else
    # Create minimal config
    echo '{"hasCompletedOnboarding": true}' > "$CLAUDE_CONFIG"
    echo "✓ Claude Code config created"
fi

echo ""
echo "=========================================="
echo "        Setup Complete!"
echo "=========================================="
echo ""
echo "Installed:"
echo "  • Claude Code  - /sod and /eod via repo skills"
echo "  • Codex CLI    - /sod and /eod via ~/.codex/prompts/"
echo "  • Gemini CLI   - /sod and /eod via repo .gemini/commands/"
echo ""
echo "Next steps:"
echo "  1. source $SHELL_RC"
echo "  2. cd $REPO_DIR"
echo "  3. Pick your CLI: claude, codex, or gemini"
echo "  4. Run /sod to start your session"
echo ""
