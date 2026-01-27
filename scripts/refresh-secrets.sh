#!/bin/bash
# Refresh secrets from Bitwarden without full bootstrap
# Use after key rotation to update a single dev machine
#
# Prerequisites: Bitwarden CLI installed and logged in
# Usage:
#   export BW_SESSION=$(bw unlock --raw)
#   bash scripts/refresh-secrets.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo "=== Crane Secrets Refresh ==="
echo ""

# Check Bitwarden session
if [[ -z "$BW_SESSION" ]]; then
    echo -e "${RED}ERROR: Bitwarden vault locked.${NC}"
    echo "  Run: export BW_SESSION=\$(bw unlock --raw)"
    exit 1
fi

# Sync Bitwarden
echo "Syncing Bitwarden vault..."
bw sync > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Vault synced"
echo ""

# Detect shell config file
if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == */zsh ]]; then
    SHELL_RC="$HOME/.zshrc"
else
    SHELL_RC="$HOME/.bashrc"
fi

echo "Shell config: $SHELL_RC"
echo ""

# Function to update or add env var
update_env_var() {
    local var_name=$1
    local bw_item=$2
    local required=$3

    echo -n "Fetching $var_name... "

    # Get value from Bitwarden
    local value
    value=$(bw get item "$bw_item" 2>/dev/null | jq -r '.login.password // .notes // .fields[0].value' 2>/dev/null)

    if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
        if [[ "$required" == "required" ]]; then
            echo -e "${RED}FAILED${NC} (not found in Bitwarden)"
            return 1
        else
            echo -e "${YELLOW}SKIPPED${NC} (not found, optional)"
            return 0
        fi
    fi

    # Remove existing line and add new one
    if grep -q "^export $var_name=" "$SHELL_RC" 2>/dev/null; then
        # Update existing
        sed -i.bak "/^export $var_name=/d" "$SHELL_RC"
        rm -f "${SHELL_RC}.bak"
    fi

    echo "export $var_name=\"$value\"" >> "$SHELL_RC"
    echo -e "${GREEN}UPDATED${NC}"
    return 0
}

echo "--- Refreshing Secrets ---"
echo ""

FAILURES=0

# NOTE: Do NOT add ANTHROPIC_API_KEY here.
# Claude Code CLI should authenticate via `claude login` (Console OAuth) which is included in the subscription.
# Setting ANTHROPIC_API_KEY in env bypasses Console auth and bills API credits directly.

# CLI Keys (for Codex and Gemini only)
update_env_var "OPENAI_API_KEY" "OpenAI API Key - Codex" "optional"
update_env_var "GEMINI_API_KEY" "Gemini API Key - General" "optional"

# Infrastructure Keys
update_env_var "CRANE_CONTEXT_KEY" "Crane Context Key" "required" || ((FAILURES++))
update_env_var "CRANE_ADMIN_KEY" "Crane Admin Key" "optional"

echo ""

if [[ $FAILURES -gt 0 ]]; then
    echo -e "${RED}Refresh completed with $FAILURES failures.${NC}"
    echo ""
    echo "Check Bitwarden item names match exactly."
    exit 1
fi

echo -e "${GREEN}All secrets refreshed successfully.${NC}"
echo ""
echo "Next steps:"
echo "  1. source $SHELL_RC"
echo "  2. bash scripts/preflight-check.sh"
echo ""
