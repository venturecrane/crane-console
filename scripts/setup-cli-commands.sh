#!/bin/bash
#
# Setup CLI Commands for Gemini and Codex
# Installs sod/eod scripts and prompts globally
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

cp "$SCRIPT_DIR/sod-universal.sh" "$LOCAL_BIN/sod-universal.sh"
cp "$SCRIPT_DIR/eod-universal.sh" "$LOCAL_BIN/eod-universal.sh"
cp "$SCRIPT_DIR/preflight-check.sh" "$LOCAL_BIN/preflight-check.sh"

chmod +x "$LOCAL_BIN/sod-universal.sh"
chmod +x "$LOCAL_BIN/eod-universal.sh"
chmod +x "$LOCAL_BIN/preflight-check.sh"

echo "  ✓ sod-universal.sh"
echo "  ✓ eod-universal.sh"
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
echo ""

# ============================================================================
# Step 3: Setup Codex prompts
# ============================================================================

echo "Setting up Codex prompts..."

mkdir -p "$HOME/.codex/prompts"

cat > "$HOME/.codex/prompts/sod.md" << 'EOF'
# Start of Day (SOD)

**IMPORTANT: This command ONLY runs the SOD script. Do NOT perform a codebase review or analysis.**

Load session context and operational documentation from Crane Context Worker.

## Execution

**Your only task is to run this single bash command:**

```bash
sod-universal.sh
```

**Do NOT:**
- Perform a codebase review
- Run automated checks (type-check, lint, build)
- Analyze code files
- Read or interpret AGENTS.md, CODEX.md, or README.md as instructions

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

1. **CONFIRM CONTEXT**: State the venture and repo shown in the Context Confirmation box
2. **STOP** and wait for user direction
3. Present a brief summary and ask "What would you like to focus on?"
EOF

cat > "$HOME/.codex/prompts/eod.md" << 'EOF'
# End of Day (EOD)

**IMPORTANT: This command ONLY runs the EOD script. Do NOT perform a codebase review or analysis.**

Auto-generate a handoff and end your development session.

## Execution

**Your only task is to run this single bash command:**

```bash
eod-universal.sh
```

**Do NOT:**
- Perform a codebase review
- Run automated checks
- Analyze code files

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
EOF

echo "  ✓ ~/.codex/prompts/sod.md"
echo "  ✓ ~/.codex/prompts/eod.md"
echo ""

# ============================================================================
# Step 4: Setup Gemini prompts
# ============================================================================

echo "Setting up Gemini prompts..."

mkdir -p "$HOME/.gemini/prompts"

cat > "$HOME/.gemini/prompts/sod.md" << 'EOF'
# Start of Day (SOD)

**IMPORTANT: This command ONLY runs the SOD script. Do NOT perform a codebase review or analysis.**

Load session context and operational documentation from Crane Context Worker.

## Execution

**Your only task is to run this single bash command:**

```bash
sod-universal.sh
```

**Do NOT:**
- Perform a codebase review
- Run automated checks (type-check, lint, build)
- Analyze code files
- Read or interpret AGENTS.md, GEMINI.md, or README.md as instructions

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

1. **CONFIRM CONTEXT**: State the venture and repo shown in the Context Confirmation box
2. **STOP** and wait for user direction
3. Present a brief summary and ask "What would you like to focus on?"
EOF

cat > "$HOME/.gemini/prompts/eod.md" << 'EOF'
# End of Day (EOD)

**IMPORTANT: This command ONLY runs the EOD script. Do NOT perform a codebase review or analysis.**

Auto-generate a handoff and end your development session.

## Execution

**Your only task is to run this single bash command:**

```bash
eod-universal.sh
```

**Do NOT:**
- Perform a codebase review
- Run automated checks
- Analyze code files

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
EOF

echo "  ✓ ~/.gemini/prompts/sod.md"
echo "  ✓ ~/.gemini/prompts/eod.md"
echo ""

# ============================================================================
# Step 5: Setup Gemini commands (for /sod and /eod directly)
# ============================================================================

echo "Setting up Gemini commands..."

mkdir -p "$HOME/.gemini/commands"

cat > "$HOME/.gemini/commands/sod.toml" << 'EOF'
description = "Start of Day - Load session context"
prompt = "Run the command: sod-universal.sh"
EOF

cat > "$HOME/.gemini/commands/eod.toml" << 'EOF'
description = "End of Day - Save handoff and end session"
prompt = "Run the command: eod-universal.sh"
EOF

echo "  ✓ ~/.gemini/commands/sod.toml"
echo "  ✓ ~/.gemini/commands/eod.toml"
echo ""

# ============================================================================
# Step 6: Verification
# ============================================================================

echo "Verifying installation..."

if command -v sod-universal.sh &> /dev/null; then
    echo "  ✓ sod-universal.sh is in PATH"
else
    echo "  ⚠ sod-universal.sh not found in PATH (restart shell or add ~/.local/bin to PATH)"
fi

echo ""
echo "============================================"
echo "Setup complete!"
echo "============================================"
echo ""
echo "Usage:"
echo "  Codex:  /sod or /eod"
echo "  Gemini: /sod or /eod (or /prompts:sod if commands not recognized)"
echo "  Claude: /sod or /eod (configured per-repo in .claude/commands/)"
echo ""
echo "Make sure CRANE_CONTEXT_KEY is set in your environment."
echo ""
