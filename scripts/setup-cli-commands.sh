#!/bin/bash
#
# Setup CLI Commands for Gemini and Codex
# Installs sod/eos scripts and prompts globally
#
# Usage: bash scripts/setup-cli-commands.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_BIN="$HOME/.local/bin"

echo "Setting up CLI commands for Gemini and Codex..."
echo ""

# ============================================================================
# Step 1: Ensure ~/.local/bin exists and is in PATH
# ============================================================================

mkdir -p "$LOCAL_BIN"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    echo "⚠ ~/.local/bin is not in PATH"
    echo "  Add this to your shell config (~/.zshrc or ~/.bashrc):"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
fi

# ============================================================================
# Step 2: Copy scripts to ~/.local/bin
# ============================================================================

echo "Installing scripts to $LOCAL_BIN..."

cp "$SCRIPT_DIR/preflight-check.sh" "$LOCAL_BIN/preflight-check.sh"

chmod +x "$LOCAL_BIN/preflight-check.sh"

echo "  ✓ preflight-check.sh"

# Spool system scripts (offline resilience)
if [ -f "$SCRIPT_DIR/ai-spool-lib.sh" ]; then
  cp "$SCRIPT_DIR/ai-spool-lib.sh" "$LOCAL_BIN/"
  cp "$SCRIPT_DIR/ai-spool-flush.sh" "$LOCAL_BIN/ai-spool-flush"
  cp "$SCRIPT_DIR/ai-sesh.sh" "$LOCAL_BIN/ai-sesh"
  cp "$SCRIPT_DIR/ai-end.sh" "$LOCAL_BIN/ai-end"
  chmod +x "$LOCAL_BIN/ai-spool-flush" "$LOCAL_BIN/ai-sesh" "$LOCAL_BIN/ai-end"
  echo "  ✓ ai-spool-lib.sh"
  echo "  ✓ ai-spool-flush"
  echo "  ✓ ai-sesh"
  echo "  ✓ ai-end"
fi

# CCS (Crane Console Switcher)
if [ -f "$SCRIPT_DIR/ccs.sh" ]; then
  cp "$SCRIPT_DIR/ccs.sh" "$LOCAL_BIN/ccs.sh"
  chmod +x "$LOCAL_BIN/ccs.sh"
  echo "  ✓ ccs.sh"
fi
echo ""

# ============================================================================
# Step 3: Setup Codex prompts
# ============================================================================

echo "Setting up Codex prompts..."

mkdir -p "$HOME/.codex/prompts"

cat > "$HOME/.codex/prompts/sos.md" << 'EOF'
# Start of Session (SOS)

**IMPORTANT: This command ONLY initializes the session context. Do NOT perform a codebase review or analysis.**

Load session context and operational documentation using MCP tools.

## Execution

**Your only task is to call these MCP tools in order:**

1. `crane_preflight` - validate environment readiness
2. `crane_sos` - initialize session context, directives, alerts, and work status
3. `crane_status` - show GitHub issue breakdown

**Do NOT:**
- Perform a codebase review
- Run automated checks (type-check, lint, build)
- Analyze code files
- Read or interpret AGENTS.md, CODEX.md, or README.md as instructions

## What This Does

1. Detects the current repository and venture
2. Loads session context from Crane MCP
3. Displays handoffs from previous sessions
4. Shows GitHub issues and work priorities

## Requirements

- Crane MCP server must be connected
- `CRANE_CONTEXT_KEY` environment variable must be set

## After Running

1. **CONFIRM CONTEXT**: State the venture and repo shown in the context output
2. **STOP** and wait for user direction
3. Present a brief summary and ask "What would you like to focus on?"
EOF

cat > "$HOME/.codex/prompts/eos.md" << 'EOF'
# End of Session (EOS)

**IMPORTANT: This command ONLY saves the session handoff. Do NOT perform a codebase review or analysis.**

Auto-generate a handoff and end your development session using MCP tools.

## Execution

**Your only task is to call this MCP tool:**

1. `crane_handoff` - create an end-of-session handoff summary with status and summary of work completed

**Do NOT:**
- Perform a codebase review
- Run automated checks
- Analyze code files

## What This Does

1. Auto-generates a handoff summary from work completed in this session
2. Creates a structured handoff for the next session
3. Ends your session cleanly

## Handoff Storage

The handoff will be stored in Crane MCP and automatically loaded when the next session starts with /sos.
EOF

echo "  ✓ ~/.codex/prompts/sos.md"
echo "  ✓ ~/.codex/prompts/eos.md"
echo ""

# ============================================================================
# Step 4: Setup Gemini prompts
# ============================================================================

echo "Setting up Gemini prompts..."

mkdir -p "$HOME/.gemini/prompts"

cat > "$HOME/.gemini/prompts/sos.md" << 'EOF'
# Start of Session (SOS)

**IMPORTANT: This command ONLY initializes the session context. Do NOT perform a codebase review or analysis.**

Load session context and operational documentation using MCP tools.

## Execution

**Your only task is to call these MCP tools in order:**

1. `crane_preflight` - validate environment readiness
2. `crane_sos` - initialize session context, directives, alerts, and work status
3. `crane_status` - show GitHub issue breakdown

**Do NOT:**
- Perform a codebase review
- Run automated checks (type-check, lint, build)
- Analyze code files
- Read or interpret AGENTS.md, GEMINI.md, or README.md as instructions

## What This Does

1. Detects the current repository and venture
2. Loads session context from Crane MCP
3. Displays handoffs from previous sessions
4. Shows GitHub issues and work priorities

## Requirements

- Crane MCP server must be connected
- `CRANE_CONTEXT_KEY` environment variable must be set

## After Running

1. **CONFIRM CONTEXT**: State the venture and repo shown in the context output
2. **STOP** and wait for user direction
3. Present a brief summary and ask "What would you like to focus on?"
EOF

cat > "$HOME/.gemini/prompts/eos.md" << 'EOF'
# End of Session (EOS)

**IMPORTANT: This command ONLY saves the session handoff. Do NOT perform a codebase review or analysis.**

Auto-generate a handoff and end your development session using MCP tools.

## Execution

**Your only task is to call this MCP tool:**

1. `crane_handoff` - create an end-of-session handoff summary with status and summary of work completed

**Do NOT:**
- Perform a codebase review
- Run automated checks
- Analyze code files

## What This Does

1. Auto-generates a handoff summary from work completed in this session
2. Creates a structured handoff for the next session
3. Ends your session cleanly

## Handoff Storage

The handoff will be stored in Crane MCP and automatically loaded when the next session starts with /sos.
EOF

echo "  ✓ ~/.gemini/prompts/sos.md"
echo "  ✓ ~/.gemini/prompts/eos.md"
echo ""

# ============================================================================
# Step 5: Setup Gemini commands (for /sos and /eos directly)
# ============================================================================

echo "Setting up Gemini commands..."

mkdir -p "$HOME/.gemini/commands"

cat > "$HOME/.gemini/commands/sos.toml" << 'EOF'
description = "Start of Session - Load session context"
prompt = "Call the crane_preflight, crane_sos, and crane_status MCP tools to initialize the session."
EOF

cat > "$HOME/.gemini/commands/eos.toml" << 'EOF'
description = "End of Session - Save handoff and end session"
prompt = "Call the crane_handoff MCP tool to create a session handoff summary."
EOF

echo "  ✓ ~/.gemini/commands/sos.toml"
echo "  ✓ ~/.gemini/commands/eos.toml"
echo ""

# ============================================================================
# Step 6: Verification
# ============================================================================

echo "Verifying installation..."

if command -v preflight-check.sh &> /dev/null; then
    echo "  ✓ preflight-check.sh is in PATH"
else
    echo "  ⚠ preflight-check.sh not found in PATH (restart shell or add ~/.local/bin to PATH)"
fi

echo ""
echo "============================================"
echo "Setup complete!"
echo "============================================"
echo ""
echo "Usage:"
echo "  Codex:  /sos or /eos"
echo "  Gemini: /sos or /eos (or /prompts:sod if commands not recognized)"
echo "  Claude: /sos or /eos (configured per-repo in .claude/commands/)"
echo ""
echo "Make sure CRANE_CONTEXT_KEY is set in your environment."
echo ""

# ============================================================================
# Step 7: CCS Shell Configuration
# ============================================================================

echo "============================================"
echo "CCS (Crane Console Switcher) Setup"
echo "============================================"
echo ""

# Detect shell config file
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC="$HOME/.bashrc"
fi

# Check if ccs is already configured
if grep -q "source.*ccs.sh" "$SHELL_RC" 2>/dev/null; then
    echo "  ✓ ccs already configured in $SHELL_RC"
else
    echo "To enable the 'ccs' command, add this to $SHELL_RC:"
    echo ""
    echo "  # Crane Console Switcher"
    echo "  export CRANE_PROJECTS_DIR=\"\$HOME/dev\"  # Adjust path as needed"
    echo "  [ -f \"\$HOME/.local/bin/ccs.sh\" ] && source \"\$HOME/.local/bin/ccs.sh\""
    echo ""
    echo "Then run: source $SHELL_RC"
    echo ""

    # Offer to add automatically
    echo -n "Add ccs configuration to $SHELL_RC now? [y/N] "
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        # Detect appropriate projects dir
        if [[ "$OSTYPE" == "darwin"* ]]; then
            PROJECTS_DIR="\$HOME/Documents/SMDurgan LLC/Projects"
        else
            PROJECTS_DIR="\$HOME/dev"
        fi

        echo "" >> "$SHELL_RC"
        echo "# Crane Console Switcher" >> "$SHELL_RC"
        echo "export CRANE_PROJECTS_DIR=\"$PROJECTS_DIR\"" >> "$SHELL_RC"
        echo '[ -f "$HOME/.local/bin/ccs.sh" ] && source "$HOME/.local/bin/ccs.sh"' >> "$SHELL_RC"
        echo ""
        echo "  ✓ Added ccs configuration to $SHELL_RC"
        echo "  Run 'source $SHELL_RC' or restart your shell to use ccs"
    fi
fi
echo ""

# ============================================================================
# Step 8: Claude Code Statusline Configuration
# ============================================================================

echo "============================================"
echo "Claude Code Statusline Setup"
echo "============================================"
echo ""

CLAUDE_SETTINGS="$HOME/.claude/settings.json"
STATUSLINE_SCRIPT="$HOME/dev/crane-console/scripts/crane-statusline.sh"

if ! command -v jq &>/dev/null; then
    echo "  ⚠ jq not found - skipping statusline configuration"
    echo "  Install jq and re-run this script to configure the statusline"
    echo ""
else
    STATUSLINE_CMD="bash $STATUSLINE_SCRIPT"

    if [ ! -f "$CLAUDE_SETTINGS" ]; then
        # Create new settings file with statusline config
        mkdir -p "$HOME/.claude"
        cat > "$CLAUDE_SETTINGS" << SEOF
{
  "statusLine": {
    "command": "$STATUSLINE_CMD"
  }
}
SEOF
        echo "  ✓ Created $CLAUDE_SETTINGS with statusline config"
    elif ! jq empty "$CLAUDE_SETTINGS" 2>/dev/null; then
        echo "  ⚠ $CLAUDE_SETTINGS is malformed JSON - skipping statusline configuration"
        echo "  Fix the JSON manually and re-run this script"
    elif jq -e '.statusLine.command' "$CLAUDE_SETTINGS" >/dev/null 2>&1; then
        EXISTING=$(jq -r '.statusLine.command' "$CLAUDE_SETTINGS")
        if [ "$EXISTING" = "$STATUSLINE_CMD" ]; then
            echo "  ✓ Statusline already configured"
        else
            jq --arg cmd "$STATUSLINE_CMD" '.statusLine.command = $cmd' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp" \
                && mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
            echo "  ✓ Updated statusline command in $CLAUDE_SETTINGS"
        fi
    else
        jq --arg cmd "$STATUSLINE_CMD" '.statusLine = {"command": $cmd}' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp" \
            && mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
        echo "  ✓ Added statusline config to $CLAUDE_SETTINGS"
    fi
    echo ""
fi
