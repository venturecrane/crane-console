#!/bin/bash
# MCP Bootstrap Script for Crane Context
# Configures Claude Code to use the Crane Context MCP server
#
# Usage:
#   ./mcp-bootstrap.sh              # Interactive mode
#   CRANE_CONTEXT_KEY=xxx ./mcp-bootstrap.sh  # Non-interactive
#
# Prerequisites:
#   - jq installed (brew install jq)
#   - CRANE_CONTEXT_KEY env var or will prompt

set -euo pipefail

# Configuration
CRANE_CONTEXT_URL="https://crane-context.automation-ab6.workers.dev"
CLAUDE_CONFIG_PATH="${HOME}/.claude.json"
MCP_SERVER_NAME="crane-context"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check for jq
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed."
        echo "Install with: brew install jq"
        exit 1
    fi
}

# Validate key format (64 hex characters)
validate_key() {
    local key="$1"
    if [[ ! "$key" =~ ^[0-9a-fA-F]{64}$ ]]; then
        log_error "Invalid key format. Expected 64 hex characters."
        return 1
    fi
    return 0
}

# Get the API key
get_api_key() {
    # Check environment variable first
    if [[ -n "${CRANE_CONTEXT_KEY:-}" ]]; then
        log_info "Using CRANE_CONTEXT_KEY from environment"
        echo "$CRANE_CONTEXT_KEY"
        return 0
    fi

    # Check Bitwarden (if bw is available)
    if command -v bw &> /dev/null; then
        log_info "Attempting to retrieve key from Bitwarden..."
        local bw_key
        bw_key=$(bw get password "crane-context-relay-key" 2>/dev/null || echo "")
        if [[ -n "$bw_key" ]]; then
            log_info "Retrieved key from Bitwarden"
            echo "$bw_key"
            return 0
        fi
    fi

    # Prompt for key
    log_warn "CRANE_CONTEXT_KEY not found in environment or Bitwarden"
    echo -n "Enter CRANE_CONTEXT_KEY: "
    read -rs key
    echo
    echo "$key"
}

# Test connectivity with health endpoint
test_connectivity() {
    local key="$1"
    log_info "Testing connectivity to ${CRANE_CONTEXT_URL}/health..."

    local response
    response=$(curl -s -w "\n%{http_code}" "${CRANE_CONTEXT_URL}/health" \
        -H "X-Relay-Key: ${key}" 2>/dev/null || echo "error")

    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | head -n -1)

    if [[ "$http_code" == "200" ]]; then
        log_info "Health check passed"
        return 0
    else
        log_error "Health check failed (HTTP ${http_code})"
        echo "$body"
        return 1
    fi
}

# Test MCP endpoint
test_mcp_endpoint() {
    local key="$1"
    log_info "Testing MCP endpoint..."

    local response
    response=$(curl -s -w "\n%{http_code}" "${CRANE_CONTEXT_URL}/mcp" \
        -H "Content-Type: application/json" \
        -H "X-Relay-Key: ${key}" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null || echo "error")

    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | head -n -1)

    if [[ "$http_code" == "200" ]]; then
        local tool_count
        tool_count=$(echo "$body" | jq -r '.result.tools | length' 2>/dev/null || echo "0")
        log_info "MCP endpoint working - ${tool_count} tools available"
        return 0
    else
        log_error "MCP endpoint test failed (HTTP ${http_code})"
        echo "$body"
        return 1
    fi
}

# Create or update Claude config
update_claude_config() {
    local key="$1"

    # MCP server configuration
    local mcp_config
    mcp_config=$(cat <<EOF
{
  "command": "curl",
  "args": [
    "-s",
    "-X", "POST",
    "${CRANE_CONTEXT_URL}/mcp",
    "-H", "Content-Type: application/json",
    "-H", "X-Relay-Key: ${key}",
    "-d", "@-"
  ]
}
EOF
)

    if [[ -f "$CLAUDE_CONFIG_PATH" ]]; then
        log_info "Updating existing ${CLAUDE_CONFIG_PATH}..."

        # Check if mcpServers exists
        if jq -e '.mcpServers' "$CLAUDE_CONFIG_PATH" > /dev/null 2>&1; then
            # Update existing mcpServers
            jq --argjson config "$mcp_config" \
                ".mcpServers[\"${MCP_SERVER_NAME}\"] = \$config" \
                "$CLAUDE_CONFIG_PATH" > "${CLAUDE_CONFIG_PATH}.tmp"
        else
            # Add mcpServers section
            jq --argjson config "$mcp_config" \
                ". + {mcpServers: {\"${MCP_SERVER_NAME}\": \$config}}" \
                "$CLAUDE_CONFIG_PATH" > "${CLAUDE_CONFIG_PATH}.tmp"
        fi

        mv "${CLAUDE_CONFIG_PATH}.tmp" "$CLAUDE_CONFIG_PATH"
    else
        log_info "Creating new ${CLAUDE_CONFIG_PATH}..."

        cat > "$CLAUDE_CONFIG_PATH" <<EOF
{
  "mcpServers": {
    "${MCP_SERVER_NAME}": ${mcp_config}
  }
}
EOF
    fi

    log_info "Claude config updated successfully"
}

# Main
main() {
    echo "====================================="
    echo "  Crane Context MCP Bootstrap"
    echo "====================================="
    echo

    check_dependencies

    # Get API key
    local api_key
    api_key=$(get_api_key)

    # Validate key format
    if ! validate_key "$api_key"; then
        exit 1
    fi

    # Test connectivity
    if ! test_connectivity "$api_key"; then
        log_error "Failed to connect to Crane Context API"
        exit 1
    fi

    # Test MCP endpoint
    if ! test_mcp_endpoint "$api_key"; then
        log_error "MCP endpoint not working"
        exit 1
    fi

    # Update Claude config
    update_claude_config "$api_key"

    echo
    log_info "Bootstrap complete!"
    echo
    echo "Available MCP tools:"
    echo "  - crane_sod: Start of Day (resume/create session)"
    echo "  - crane_eod: End of Day (end session with handoff)"
    echo "  - crane_handoff: Create mid-session handoff"
    echo "  - crane_get_doc: Retrieve documentation"
    echo "  - crane_list_sessions: List active sessions"
    echo
    echo "Test in Claude Code:"
    echo "  > start my day on vc crane-console track 1"
    echo
}

main "$@"
