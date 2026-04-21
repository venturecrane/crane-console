#!/usr/bin/env bash
#
# Setup Claude Desktop MCP configuration for crane-mcp (local stdio transport).
#
# This script generates the Claude Desktop config file with the correct
# paths and secrets for the local crane-mcp MCP server.
#
# Usage:
#   ./scripts/setup-claude-desktop-mcp.sh
#
# Prerequisites:
#   - Infisical CLI installed and logged in
#   - crane-mcp built (npm run build in packages/crane-mcp)
#   - Node.js installed

set -euo pipefail

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# Find node binary
NODE_BIN=$(which node 2>/dev/null || echo "")
if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found in PATH"
  exit 1
fi

# Find crane-mcp entry point
CRANE_MCP_DIR="$(cd "$(dirname "$0")/../packages/crane-mcp" && pwd)"
CRANE_MCP_BIN="$CRANE_MCP_DIR/dist/index.js"

if [ ! -f "$CRANE_MCP_BIN" ]; then
  echo "Error: crane-mcp not built. Run: cd packages/crane-mcp && npm run build"
  exit 1
fi

# Fetch secrets from Infisical
echo "Fetching secrets from Infisical..."
CRANE_CONTEXT_KEY=$(infisical secrets get CRANE_CONTEXT_KEY --path /vc --env prod --plain 2>/dev/null)
GH_TOKEN=$(infisical secrets get GH_TOKEN --path /vc --env prod --plain 2>/dev/null)

if [ -z "$CRANE_CONTEXT_KEY" ]; then
  echo "Error: Could not fetch CRANE_CONTEXT_KEY from Infisical"
  exit 1
fi

if [ -z "$GH_TOKEN" ]; then
  echo "Error: Could not fetch GH_TOKEN from Infisical"
  exit 1
fi

# Create config directory if needed
mkdir -p "$CONFIG_DIR"

# Build config - merge with existing if present
if [ -f "$CONFIG_FILE" ]; then
  echo "Existing config found. Backing up to ${CONFIG_FILE}.bak"
  cp "$CONFIG_FILE" "${CONFIG_FILE}.bak"

  # Check if crane server already exists
  if python3 -c "
import json, sys
with open('$CONFIG_FILE') as f:
    cfg = json.load(f)
if 'crane' in cfg.get('mcpServers', {}):
    print('exists')
" 2>/dev/null | grep -q "exists"; then
    echo "crane MCP server already configured. Updating..."
  fi
fi

# Generate config with crane MCP server
python3 -c "
import json, os

config_file = '$CONFIG_FILE'

# Load existing or create new
try:
    with open(config_file) as f:
        config = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    config = {}

if 'mcpServers' not in config:
    config['mcpServers'] = {}

config['mcpServers']['crane'] = {
    'command': '$NODE_BIN',
    'args': ['$CRANE_MCP_BIN'],
    'env': {
        'CRANE_CONTEXT_KEY': '$CRANE_CONTEXT_KEY',
        'GH_TOKEN': '$GH_TOKEN',
        'CRANE_ENV': 'prod'
    }
}

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

print('Config written to:', config_file)
"

echo ""
echo "Claude Desktop MCP configured successfully."
echo "Restart Claude Desktop to pick up the changes."
echo ""
echo "Available tools: crane_preflight, crane_sos, crane_status,"
echo "  crane_ventures, crane_context, crane_handoff, crane_doc, crane_doc_audit,"
echo "  crane_notes, crane_note, crane_schedule, crane_fleet_dispatch, crane_fleet_status"
