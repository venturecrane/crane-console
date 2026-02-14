#!/bin/bash
#
# Bootstrap a New macOS Dev Machine (Remote-Driven)
#
# Run this from any existing fleet machine to fully configure a new Mac
# for Crane development. This is a thin orchestrator that handles remote-only
# concerns (SSH, credentials, PATH), then invokes bootstrap-machine.sh on
# the target for tool installation, and finishes with post-bootstrap hardening.
#
# Prerequisites on the new Mac (3 manual steps):
#   1. Enable Remote Login: System Settings > General > Sharing > Remote Login > ON
#   2. Install Tailscale from App Store, sign in to tailnet
#   3. Enable passwordless sudo:
#      echo "$USER ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/$USER
#
# Usage:
#   ./scripts/bootstrap-new-mac.sh <tailscale-ip> <username> [alias]
#
# Example:
#   ./scripts/bootstrap-new-mac.sh 100.119.24.42 scottdurgan m16
#
# Environment:
#   CRANE_CONTEXT_KEY  - Required (from Infisical or env)
#   DRY_RUN=1          - Preview actions without writing
#
# Resume: On failure, fix the issue and re-run. Completed steps are skipped
# via a checkpoint file on the target (~/.bootstrap-state).
#

set -e
set -o pipefail

# ─── Colors & Logging ─────────────────────────────────────────────────

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

step() {
    CURRENT_STEP="$1"
    echo ""
    echo -e "${BLUE}Step $1: $2${NC}"
}

# ─── Arguments ─────────────────────────────────────────────────────────

TARGET_IP="${1:-}"
TARGET_USER="${2:-}"
TARGET_ALIAS="${3:-}"

DRY_RUN="${DRY_RUN:-0}"

if [[ -z "$TARGET_IP" || -z "$TARGET_USER" ]]; then
    echo -e "${RED}Usage: $0 <tailscale-ip> <username> [alias]${NC}"
    echo ""
    echo "Example: $0 100.119.24.42 scottdurgan m16"
    echo ""
    echo "Prerequisites on the new Mac:"
    echo "  1. Enable Remote Login (System Settings > General > Sharing > Remote Login > ON)"
    echo "  2. Install Tailscale from App Store, sign in"
    echo "  3. Passwordless sudo: echo \"\$USER ALL=(ALL) NOPASSWD: ALL\" | sudo tee /etc/sudoers.d/\$USER"
    exit 1
fi

TARGET="$TARGET_USER@$TARGET_IP"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

# ─── Remote Execution Helpers ──────────────────────────────────────────

# Pre-Homebrew: explicit paths, no shell profile sourcing
remote_exec_raw() {
    if [ "$DRY_RUN" = "1" ]; then
        log_warn "[DRY RUN] ssh $TARGET: $1"
        return 0
    fi
    ssh $SSH_OPTS "$TARGET" "$1"
}

# Post-Homebrew: sources brew shellenv + node PATH
remote_exec() {
    local cmd="eval \"\$(/opt/homebrew/bin/brew shellenv)\" 2>/dev/null; export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\"; $1"
    if [ "$DRY_RUN" = "1" ]; then
        log_warn "[DRY RUN] ssh $TARGET: $1"
        return 0
    fi
    ssh $SSH_OPTS "$TARGET" "$cmd"
}

# ─── Checkpoint System ─────────────────────────────────────────────────

STATE_FILE=".bootstrap-state"

checkpoint_done() {
    local step_name="$1"
    local result
    result=$(remote_exec_raw "grep -q '^${step_name}$' ~/$STATE_FILE 2>/dev/null && echo yes || echo no" 2>/dev/null || echo "no")
    [ "$result" = "yes" ]
}

checkpoint_set() {
    local step_name="$1"
    remote_exec_raw "echo '$step_name' >> ~/$STATE_FILE"
}

# ─── Trap Handler ──────────────────────────────────────────────────────

CURRENT_STEP="0"

on_error() {
    echo ""
    log_err "Failed at step $CURRENT_STEP"
    echo ""
    echo "Fix the issue and re-run - completed steps will be skipped:"
    echo "  $0 $TARGET_IP $TARGET_USER${TARGET_ALIAS:+ $TARGET_ALIAS}"
    exit 1
}

trap on_error ERR

# ═════════════════════════════════════════════════════════════════════════
# Preflight
# ═════════════════════════════════════════════════════════════════════════

banner "Bootstrap New Mac"

echo "Target: $TARGET"
[ -n "$TARGET_ALIAS" ] && echo "Alias:  $TARGET_ALIAS"
echo ""

if [ "$DRY_RUN" = "1" ]; then
    log_warn "DRY RUN MODE - no changes will be made"
    echo ""
fi

step 0 "Preflight - checking control machine"

MISSING=0

# CRANE_CONTEXT_KEY
if [ -z "${CRANE_CONTEXT_KEY:-}" ]; then
    log_err "CRANE_CONTEXT_KEY not set"
    echo "  Run: infisical run --path /vc -- $0 $*"
    MISSING=1
else
    log_ok "CRANE_CONTEXT_KEY available"
fi

# GitHub token
GH_TOKEN=$(gh auth token 2>/dev/null || echo "")
if [ -z "$GH_TOKEN" ]; then
    log_err "GitHub CLI not authenticated"
    echo "  Run: gh auth login"
    MISSING=1
else
    log_ok "GitHub token available"
fi

# SSH key
if [ ! -f "$HOME/.ssh/id_ed25519.pub" ]; then
    log_err "No SSH key at ~/.ssh/id_ed25519.pub"
    MISSING=1
else
    log_ok "SSH key exists"
fi

# Tailscale
if ! command -v tailscale &>/dev/null; then
    log_err "Tailscale not installed on control machine"
    MISSING=1
else
    log_ok "Tailscale available"
fi

if [ "$MISSING" -eq 1 ]; then
    echo ""
    log_err "Fix missing items before continuing"
    exit 1
fi

# Locate this script's directory for invoking bootstrap-machine.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/bootstrap-machine.sh"
if [ ! -f "$BOOTSTRAP_SCRIPT" ]; then
    log_err "Cannot find bootstrap-machine.sh at $BOOTSTRAP_SCRIPT"
    exit 1
fi
log_ok "bootstrap-machine.sh found"

# ═════════════════════════════════════════════════════════════════════════
# Phase 1: SSH Access
# ═════════════════════════════════════════════════════════════════════════

step 1 "SSH connectivity"

if checkpoint_done "ssh_setup"; then
    log_ok "SSH setup already complete (skipping)"
else
    if ssh $SSH_OPTS -o BatchMode=yes "$TARGET" 'echo ok' &>/dev/null; then
        log_ok "SSH connection works (key already authorized)"
    else
        log_info "Copying SSH key to target..."
        if [ "$DRY_RUN" = "1" ]; then
            log_warn "[DRY RUN] would run ssh-copy-id"
        else
            ssh-copy-id -i "$HOME/.ssh/id_ed25519.pub" "$TARGET" || {
                log_err "Could not copy SSH key. Ensure Remote Login is enabled on the target."
                exit 1
            }
            log_ok "SSH key copied"
        fi
    fi
    checkpoint_set "ssh_setup"
fi

# ═════════════════════════════════════════════════════════════════════════
# Phase 2: Homebrew & PATH
# ═════════════════════════════════════════════════════════════════════════

step 2 "Homebrew installation"

if checkpoint_done "homebrew"; then
    log_ok "Homebrew already installed (skipping)"
else
    HAS_BREW=$(remote_exec_raw 'test -x /opt/homebrew/bin/brew && echo yes || echo no')
    if [ "$HAS_BREW" = "yes" ]; then
        log_ok "Homebrew already present"
    else
        log_info "Installing Homebrew (this takes a few minutes)..."
        remote_exec_raw 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        log_ok "Homebrew installed"
    fi

    # Ensure brew is in shell profile
    log_info "Configuring brew PATH in shell profiles..."
    remote_exec_raw 'grep -q "brew shellenv" ~/.zprofile 2>/dev/null || echo "eval \"\$(/opt/homebrew/bin/brew shellenv)\"" >> ~/.zprofile'
    remote_exec_raw 'grep -q "brew shellenv" ~/.zshrc 2>/dev/null || echo "eval \"\$(/opt/homebrew/bin/brew shellenv)\"" >> ~/.zshrc'
    log_ok "brew PATH configured"

    checkpoint_set "homebrew"
fi

step 3 "Tailscale CLI wrapper"

if checkpoint_done "tailscale_cli"; then
    log_ok "Tailscale CLI already configured (skipping)"
else
    HAS_TS=$(remote_exec 'command -v tailscale &>/dev/null && echo yes || echo no')
    if [ "$HAS_TS" = "yes" ]; then
        log_ok "Tailscale CLI already on PATH"
    else
        log_info "Creating Tailscale CLI wrapper..."
        remote_exec_raw 'sudo bash -c "cat > /opt/homebrew/bin/tailscale << '\''TSEOF'\''
#!/bin/bash
exec /Applications/Tailscale.app/Contents/MacOS/Tailscale \"\$@\"
TSEOF
chmod +x /opt/homebrew/bin/tailscale"'
        log_ok "Tailscale CLI wrapper created"
    fi
    checkpoint_set "tailscale_cli"
fi

# ═════════════════════════════════════════════════════════════════════════
# Phase 3: Credentials
# ═════════════════════════════════════════════════════════════════════════

step 4 "GitHub authentication"

if checkpoint_done "gh_auth"; then
    log_ok "GitHub auth already configured (skipping)"
else
    GH_STATUS=$(remote_exec "gh auth status 2>&1 || true")
    if echo "$GH_STATUS" | grep -q "Logged in"; then
        log_ok "GitHub CLI already authenticated"
    else
        log_info "Authenticating GitHub CLI on target..."
        echo "$GH_TOKEN" | remote_exec 'gh auth login --with-token'
        log_ok "GitHub CLI authenticated"
    fi
    checkpoint_set "gh_auth"
fi

step 5 "Environment variables"

if checkpoint_done "env_vars"; then
    log_ok "Environment variables already configured (skipping)"
else
    log_info "Writing CRANE_CONTEXT_KEY to target ~/.zshrc..."
    remote_exec_raw "grep -q CRANE_CONTEXT_KEY ~/.zshrc 2>/dev/null || echo 'export CRANE_CONTEXT_KEY=\"$CRANE_CONTEXT_KEY\"' >> ~/.zshrc"
    log_ok "CRANE_CONTEXT_KEY configured"

    # Push CLOUDFLARE_API_TOKEN if available
    if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
        remote_exec_raw "grep -q CLOUDFLARE_API_TOKEN ~/.zshrc 2>/dev/null || echo 'export CLOUDFLARE_API_TOKEN=\"$CLOUDFLARE_API_TOKEN\"' >> ~/.zshrc"
        log_ok "CLOUDFLARE_API_TOKEN configured"
    fi

    checkpoint_set "env_vars"
fi

# ═════════════════════════════════════════════════════════════════════════
# Phase 4: Bootstrap (invoke existing script on target)
# ═════════════════════════════════════════════════════════════════════════

step 6 "Core bootstrap (tools, SSH key, API registration, MCP, mesh config)"

if checkpoint_done "bootstrap"; then
    log_ok "Core bootstrap already complete (skipping)"
else
    log_info "Running bootstrap-machine.sh on target..."
    log_info "This installs Node, gh, Infisical, Claude Code, Wrangler, uv,"
    log_info "generates SSH key, registers with API, configures SSH mesh + MCP."
    echo ""

    # Transfer and run bootstrap-machine.sh with env vars
    ALIAS_ARG="${TARGET_ALIAS:-}"
    if [ "$DRY_RUN" = "1" ]; then
        log_warn "[DRY RUN] would scp bootstrap-machine.sh and run on target"
    else
        scp $SSH_OPTS "$BOOTSTRAP_SCRIPT" "$TARGET:/tmp/bootstrap-machine.sh"
        remote_exec "CRANE_CONTEXT_KEY='$CRANE_CONTEXT_KEY' MACHINE_ALIAS='$ALIAS_ARG' REMOTE_BOOTSTRAP=1 bash /tmp/bootstrap-machine.sh"
        remote_exec_raw "rm -f /tmp/bootstrap-machine.sh"
    fi
    log_ok "Core bootstrap complete"
    checkpoint_set "bootstrap"
fi

# ═════════════════════════════════════════════════════════════════════════
# Phase 5: Post-Bootstrap (hardening, optimization, tmux)
# ═════════════════════════════════════════════════════════════════════════

step 7 "macOS hardening"

if checkpoint_done "harden"; then
    log_ok "Hardening already applied (skipping)"
else
    HARDEN_SCRIPT="$SCRIPT_DIR/harden-mac.sh"
    if [ -f "$HARDEN_SCRIPT" ]; then
        log_info "Running harden-mac.sh on target..."
        if [ "$DRY_RUN" = "1" ]; then
            log_warn "[DRY RUN] would scp and run harden-mac.sh"
        else
            scp $SSH_OPTS "$HARDEN_SCRIPT" "$TARGET:/tmp/harden-mac.sh"
            remote_exec_raw "sudo bash /tmp/harden-mac.sh"
            remote_exec_raw "rm -f /tmp/harden-mac.sh"
        fi
        log_ok "Hardening applied"
    else
        log_warn "harden-mac.sh not found, skipping"
    fi
    checkpoint_set "harden"
fi

step 8 "macOS optimization"

if checkpoint_done "optimize"; then
    log_ok "Optimization already applied (skipping)"
else
    OPTIMIZE_SCRIPT="$SCRIPT_DIR/optimize-macos.sh"
    if [ -f "$OPTIMIZE_SCRIPT" ]; then
        log_info "Running optimize-macos.sh on target..."
        if [ "$DRY_RUN" = "1" ]; then
            log_warn "[DRY RUN] would scp and run optimize-macos.sh"
        else
            scp $SSH_OPTS "$OPTIMIZE_SCRIPT" "$TARGET:/tmp/optimize-macos.sh"
            remote_exec_raw "sudo bash /tmp/optimize-macos.sh"
            remote_exec_raw "rm -f /tmp/optimize-macos.sh"
        fi
        log_ok "Optimization applied"
    else
        log_warn "optimize-macos.sh not found, skipping"
    fi
    checkpoint_set "optimize"
fi

step 9 "tmux configuration"

if checkpoint_done "tmux"; then
    log_ok "tmux already configured (skipping)"
else
    TMUX_SCRIPT="$SCRIPT_DIR/setup-tmux.sh"
    if [ -f "$TMUX_SCRIPT" ]; then
        log_info "Deploying tmux config to target..."
        if [ "$DRY_RUN" = "1" ]; then
            log_warn "[DRY RUN] would deploy tmux config"
        else
            # Extract tmux.conf content and deploy
            TMUX_CONF="$SCRIPT_DIR/../config/tmux.conf"
            if [ -f "$TMUX_CONF" ]; then
                scp $SSH_OPTS "$TMUX_CONF" "$TARGET:~/.tmux.conf"
                log_ok "tmux config deployed"
            else
                # Fall back to running setup-tmux.sh locally for this target
                log_info "No config/tmux.conf, deploying via setup-tmux.sh..."
                remote_exec "brew install tmux 2>/dev/null || true"
                log_ok "tmux installed (config can be deployed via setup-tmux.sh later)"
            fi
        fi
    else
        log_info "setup-tmux.sh not found, installing tmux only..."
        remote_exec "brew install tmux 2>/dev/null || true"
        log_ok "tmux installed"
    fi
    checkpoint_set "tmux"
fi

# ═════════════════════════════════════════════════════════════════════════
# Phase 6: SSH Mesh Distribution (from control machine)
# ═════════════════════════════════════════════════════════════════════════

step 10 "SSH mesh key distribution"

if checkpoint_done "mesh_keys"; then
    log_ok "Mesh key distribution already done (skipping)"
else
    log_info "Distributing new machine's SSH key to fleet..."

    # Get the new machine's public key
    NEW_PUBKEY=$(remote_exec_raw 'cat ~/.ssh/id_ed25519.pub' 2>/dev/null || true)
    if [ -z "$NEW_PUBKEY" ]; then
        log_warn "Could not read target's public key - mesh distribution skipped"
    else
        NEW_KEY_FP=$(echo "$NEW_PUBKEY" | awk '{print $2}')
        ALIAS_LABEL="${TARGET_ALIAS:-new-mac}"

        # Add new machine's key to each fleet machine's authorized_keys
        # We use the existing SSH mesh config on this control machine
        FLEET_HOSTS=$(ssh -G '*' 2>/dev/null | awk '/^hostname / {print $2}' | sort -u || true)

        # Read fleet machines from crane mesh config if available
        if [ -f "$HOME/.ssh/config.d/crane-mesh" ]; then
            log_info "Reading fleet from SSH mesh config..."
            while IFS= read -r host_line; do
                FLEET_HOST=$(echo "$host_line" | awk '{print $2}')
                [ -z "$FLEET_HOST" ] && continue
                [ "$FLEET_HOST" = "$TARGET_IP" ] && continue  # Skip the target itself

                # Get user for this host
                HOST_USER=$(ssh -G "$FLEET_HOST" 2>/dev/null | awk '/^user / {print $2}')
                [ -z "$HOST_USER" ] && HOST_USER="$USER"

                echo -n "  $FLEET_HOST ($HOST_USER)... "
                if [ "$DRY_RUN" = "1" ]; then
                    log_warn "[DRY RUN] would add key"
                    continue
                fi

                # Add key if not already present
                ssh -o ConnectTimeout=5 -o BatchMode=yes "${HOST_USER}@${FLEET_HOST}" bash -s <<MESHEOF 2>/dev/null || { log_warn "unreachable"; continue; }
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
if grep -q "$NEW_KEY_FP" ~/.ssh/authorized_keys 2>/dev/null; then
    echo "already present"
else
    echo "$NEW_PUBKEY" >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    echo "added"
fi
MESHEOF
            done < <(grep "^Host " "$HOME/.ssh/config.d/crane-mesh" 2>/dev/null || true)
        fi

        # Also add fleet keys to the new machine
        log_info "Adding control machine's key to target authorized_keys..."
        MY_PUBKEY=$(cat "$HOME/.ssh/id_ed25519.pub")
        MY_KEY_FP=$(echo "$MY_PUBKEY" | awk '{print $2}')
        remote_exec_raw "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && (grep -q '$MY_KEY_FP' ~/.ssh/authorized_keys 2>/dev/null || echo '$MY_PUBKEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys)"

        log_ok "Mesh keys distributed"
    fi
    checkpoint_set "mesh_keys"
fi

# ═════════════════════════════════════════════════════════════════════════
# Phase 7: Verification
# ═════════════════════════════════════════════════════════════════════════

step 11 "Verification"

echo ""

# Tailscale ping
TS_ALIAS="${TARGET_ALIAS:-$TARGET_IP}"
echo -n "  Tailscale ping... "
if tailscale ping -c 1 "$TARGET_IP" &>/dev/null; then
    log_ok "OK"
else
    log_warn "failed (may need a moment to sync)"
fi

# SSH via alias (if configured)
if [ -n "$TARGET_ALIAS" ]; then
    echo -n "  SSH via alias ($TARGET_ALIAS)... "
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "$TARGET_ALIAS" 'echo ok' &>/dev/null; then
        log_ok "OK"
    else
        log_warn "not working yet (run setup-ssh-mesh.sh to update configs)"
    fi
fi

# Tool versions
echo ""
log_info "Installed tool versions:"
remote_exec 'echo "  Node.js:     $(node --version 2>/dev/null || echo NOT FOUND)"'
remote_exec 'echo "  npm:         $(npm --version 2>/dev/null || echo NOT FOUND)"'
remote_exec 'echo "  gh:          $(gh --version 2>/dev/null | head -1 || echo NOT FOUND)"'
remote_exec 'echo "  claude:      $(claude --version 2>/dev/null || echo NOT FOUND)"'
remote_exec 'echo "  wrangler:    $(wrangler --version 2>/dev/null | head -1 || echo NOT FOUND)"'
remote_exec 'echo "  infisical:   $(infisical --version 2>/dev/null | head -1 || echo NOT FOUND)"'
remote_exec 'echo "  uv:          $(uv --version 2>/dev/null || echo NOT FOUND)"'
remote_exec 'echo "  tmux:        $(tmux -V 2>/dev/null || echo NOT FOUND)"'
remote_exec 'echo "  tailscale:   $(tailscale version 2>/dev/null | head -1 || echo NOT FOUND)"'

# ═════════════════════════════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════════════════════════════

banner "Bootstrap Complete"

ALIAS_DISPLAY="${TARGET_ALIAS:-$(remote_exec_raw 'hostname' 2>/dev/null || echo "$TARGET_IP")}"

echo "Machine:    $ALIAS_DISPLAY"
echo "Target:     $TARGET"
echo "Tailscale:  $TARGET_IP"
echo ""
echo "Installed:"
echo "  Node.js, npm, GitHub CLI, Claude Code, Wrangler"
echo "  Infisical, uv, tmux, Tailscale CLI"
echo "  Crane CLI + MCP server, Apple Notes MCP"
echo ""
echo "Configured:"
echo "  SSH key generated + registered with API"
echo "  SSH mesh config, CRANE_CONTEXT_KEY"
echo "  Firewall hardened, performance optimized"
echo ""
echo "Remaining manual steps on the target:"
echo ""
echo "  1. Login to Infisical:"
echo "     ssh $ALIAS_DISPLAY"
echo "     infisical login"
echo ""
echo "  2. Login to Claude:"
echo "     claude login"
echo ""
echo "  3. Update SSH mesh on all machines:"
echo "     ./scripts/setup-ssh-mesh.sh"
echo ""
echo "  4. Start a session:"
echo "     infisical run --path /vc -- crane vc"
echo ""
