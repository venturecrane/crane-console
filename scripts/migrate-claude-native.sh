#!/bin/bash
#
# Migrate Claude Code from npm to native installer across the fleet
#
# This script upgrades remote machines to use the native Claude Code installer
# which provides automatic background updates.
#
# IMPORTANT: This script cannot upgrade the machine it's running on (the control
# machine) because Claude Code is currently executing. The control machine must
# be upgraded manually after the session ends.
#
# Usage:
#   ./scripts/migrate-claude-native.sh
#
# Environment:
#   CRANE_CONTEXT_KEY  — Required (from Infisical or env)
#   DRY_RUN=1          — Preview actions without making changes
#

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*"; }

banner() {
    echo ""
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}==========================================${NC}"
    echo ""
}

API_URL="https://crane-context.automation-ab6.workers.dev"
DRY_RUN="${DRY_RUN:-0}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes"

# Track results
UPGRADED=()
SKIPPED=()
FAILED=()
UNREACHABLE=()

# ═══════════════════════════════════════════════════════════════════════════
# Preflight
# ═══════════════════════════════════════════════════════════════════════════

banner "Claude Code Native Migration"

if [ "$DRY_RUN" = "1" ]; then
    log_warn "DRY RUN MODE — no changes will be made"
    echo ""
fi

if [ -z "${CRANE_CONTEXT_KEY:-}" ]; then
    log_err "CRANE_CONTEXT_KEY is required"
    echo "  Run: infisical run --path /vc -- $0"
    exit 1
fi

# Get this machine's hostname for exclusion
THIS_HOST=$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/\.local$//')
log_info "Control machine: $THIS_HOST (will be skipped)"

# ═══════════════════════════════════════════════════════════════════════════
# Fetch Fleet from API
# ═══════════════════════════════════════════════════════════════════════════

log_info "Fetching machine registry from API..."

FLEET_JSON=$(curl -sf "$API_URL/machines" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" 2>/dev/null || true)

if [ -z "$FLEET_JSON" ]; then
    log_err "Failed to fetch machine registry from API"
    exit 1
fi

# Parse machines using Python (available on all target systems)
MACHINES=$(echo "$FLEET_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for m in data.get('machines', []):
    print(f\"{m['hostname']}|{m.get('tailscale_ip', '')}|{m.get('user', '')}\")
" 2>/dev/null || true)

if [ -z "$MACHINES" ]; then
    log_warn "No machines found in registry"
    exit 0
fi

MACHINE_COUNT=$(echo "$MACHINES" | wc -l | tr -d ' ')
log_ok "Found $MACHINE_COUNT machines in registry"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Process Each Machine
# ═══════════════════════════════════════════════════════════════════════════

while IFS='|' read -r hostname ip user; do
    [ -z "$hostname" ] && continue

    echo -e "${BLUE}━━━ $hostname ━━━${NC}"

    # Skip control machine
    if [ "$hostname" = "$THIS_HOST" ]; then
        log_warn "Skipping (control machine — upgrade manually after session)"
        SKIPPED+=("$hostname (control machine)")
        echo ""
        continue
    fi

    # Determine SSH target
    if [ -n "$ip" ] && [ -n "$user" ]; then
        TARGET="$user@$ip"
    elif [ -n "$ip" ]; then
        TARGET="$ip"
    else
        # Try hostname as SSH alias
        TARGET="$hostname"
    fi

    # Test connectivity
    if ! ssh $SSH_OPTS "$TARGET" 'echo ok' &>/dev/null; then
        log_warn "Unreachable via SSH"
        UNREACHABLE+=("$hostname")
        echo ""
        continue
    fi

    # Check current installation method
    # npm installed = found in npm global list
    # native installed = exists at ~/.local/bin/claude
    # not installed = neither
    INSTALL_STATUS=$(ssh $SSH_OPTS "$TARGET" '
        if npm list -g @anthropic-ai/claude-code 2>/dev/null | grep -q claude-code; then
            echo "npm"
        elif [ -x "$HOME/.local/bin/claude" ]; then
            echo "native"
        elif command -v claude &>/dev/null; then
            echo "other"
        else
            echo "none"
        fi
    ' 2>/dev/null || echo "unknown")

    case "$INSTALL_STATUS" in
        native)
            log_ok "Already using native installer"
            # Ensure PATH is configured
            ssh $SSH_OPTS "$TARGET" 'grep -q "\.local/bin" ~/.zshrc 2>/dev/null || echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> ~/.zshrc' 2>/dev/null || true
            SKIPPED+=("$hostname (already native)")
            echo ""
            continue
            ;;
        none)
            log_warn "Claude Code not installed"
            SKIPPED+=("$hostname (not installed)")
            echo ""
            continue
            ;;
        npm)
            log_info "Currently installed via npm"
            ;;
        other)
            log_info "Installed via unknown method, proceeding with migration..."
            ;;
        *)
            log_warn "Could not determine installation status"
            SKIPPED+=("$hostname (status unknown)")
            echo ""
            continue
            ;;
    esac

    # Perform migration
    if [ "$DRY_RUN" = "1" ]; then
        log_warn "[DRY RUN] Would uninstall npm version and install native"
        UPGRADED+=("$hostname (dry run)")
    else
        log_info "Uninstalling npm version..."
        if ssh $SSH_OPTS "$TARGET" 'npm uninstall -g @anthropic-ai/claude-code 2>/dev/null || true' &>/dev/null; then
            log_ok "npm version removed"
        fi

        log_info "Installing native version..."
        if ssh $SSH_OPTS "$TARGET" 'curl -fsSL https://claude.ai/install.sh | bash' 2>/dev/null; then
            log_ok "Native version installed"
        else
            log_err "Failed to install native version"
            FAILED+=("$hostname")
            echo ""
            continue
        fi

        # Ensure ~/.local/bin is in PATH
        log_info "Configuring PATH..."
        ssh $SSH_OPTS "$TARGET" 'grep -q "\.local/bin" ~/.zshrc 2>/dev/null || echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> ~/.zshrc' 2>/dev/null || true
        # Also try .bashrc for Linux machines
        ssh $SSH_OPTS "$TARGET" 'grep -q "\.local/bin" ~/.bashrc 2>/dev/null || echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> ~/.bashrc 2>/dev/null' 2>/dev/null || true
        log_ok "PATH configured"

        # Verify installation
        VERSION=$(ssh $SSH_OPTS "$TARGET" '~/.local/bin/claude --version 2>/dev/null || echo FAILED' 2>/dev/null)
        if [ "$VERSION" != "FAILED" ]; then
            log_ok "Verified: $VERSION"
            UPGRADED+=("$hostname")
        else
            log_warn "Could not verify installation"
            UPGRADED+=("$hostname (unverified)")
        fi
    fi

    echo ""
done <<< "$MACHINES"

# ═══════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════

banner "Migration Summary"

if [ ${#UPGRADED[@]} -gt 0 ]; then
    echo -e "${GREEN}Upgraded:${NC}"
    for m in "${UPGRADED[@]}"; do
        echo "  - $m"
    done
    echo ""
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
    echo -e "${YELLOW}Skipped:${NC}"
    for m in "${SKIPPED[@]}"; do
        echo "  - $m"
    done
    echo ""
fi

if [ ${#UNREACHABLE[@]} -gt 0 ]; then
    echo -e "${YELLOW}Unreachable:${NC}"
    for m in "${UNREACHABLE[@]}"; do
        echo "  - $m"
    done
    echo ""
fi

if [ ${#FAILED[@]} -gt 0 ]; then
    echo -e "${RED}Failed:${NC}"
    for m in "${FAILED[@]}"; do
        echo "  - $m"
    done
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════
# Control Machine Instructions
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Upgrade this machine ($THIS_HOST) after exiting Claude Code:${NC}"
echo ""
echo "  npm uninstall -g @anthropic-ai/claude-code"
echo "  curl -fsSL https://claude.ai/install.sh | bash"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
