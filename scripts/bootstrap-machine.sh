#!/bin/bash
#
# Bootstrap a new dev machine for Venture Crane
#
# Single script to provision a machine: installs tools, generates SSH keys,
# registers with Crane Context API, and configures SSH mesh.
#
# Usage:
#   CRANE_CONTEXT_KEY=<key> bash scripts/bootstrap-machine.sh
#
# Or remotely:
#   CRANE_CONTEXT_KEY=<key> bash <(curl -fsSL https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/bootstrap-machine.sh)
#
# All steps are idempotent -- safe to re-run.
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

# ═════════════════════════════════════════════════════════════════════
# Preflight
# ═════════════════════════════════════════════════════════════════════

banner "Crane Machine Bootstrap"

if [ -z "$CRANE_CONTEXT_KEY" ]; then
    log_err "CRANE_CONTEXT_KEY is required"
    echo "  Usage: CRANE_CONTEXT_KEY=<key> bash $0"
    exit 1
fi

# ─── Step 1: Detect OS and Architecture ────────────────────────────

OS_RAW=$(uname -s)
ARCH_RAW=$(uname -m)

case "$OS_RAW" in
    Darwin) OS="darwin" ;;
    Linux)  OS="linux" ;;
    *)      log_err "Unsupported OS: $OS_RAW"; exit 1 ;;
esac

case "$ARCH_RAW" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64)        ARCH="x86_64" ;;
    *)             log_err "Unsupported architecture: $ARCH_RAW"; exit 1 ;;
esac

log_ok "Detected: $OS / $ARCH"

if [ "$OS" = "darwin" ] && [ -z "${REMOTE_BOOTSTRAP:-}" ]; then
    log_warn "Tip: For macOS, prefer running bootstrap-new-mac.sh from a control machine."
fi

# ─── Step 2: Verify Tailscale ──────────────────────────────────────

log_info "Checking Tailscale..."

if ! command -v tailscale &>/dev/null; then
    # macOS App Store Tailscale doesn't put CLI on PATH - create wrapper
    if [ "$OS" = "darwin" ]; then
        TS_APP="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
        if [ -x "$TS_APP" ]; then
            WRAPPER_DIR="/opt/homebrew/bin"
            [ -d "$WRAPPER_DIR" ] || WRAPPER_DIR="/usr/local/bin"
            sudo bash -c "cat > $WRAPPER_DIR/tailscale << 'TSEOF'
#!/bin/bash
exec /Applications/Tailscale.app/Contents/MacOS/Tailscale \"\$@\"
TSEOF
chmod +x $WRAPPER_DIR/tailscale"
            log_ok "Created Tailscale CLI wrapper at $WRAPPER_DIR/tailscale"
        else
            log_err "Tailscale is not installed"
            echo "  Install: https://tailscale.com/download/mac (App Store)"
            exit 1
        fi
    else
        log_err "Tailscale is not installed"
        echo "  Install: curl -fsSL https://tailscale.com/install.sh | sh"
        exit 1
    fi
fi

TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || true)
if [ -z "$TAILSCALE_IP" ]; then
    log_err "Tailscale is not connected. Run: tailscale up"
    exit 1
fi

log_ok "Tailscale IP: $TAILSCALE_IP"

# ─── Step 3: Install Tools ────────────────────────────────────────

log_info "Installing tools..."

if [ "$OS" = "darwin" ]; then
    # Homebrew
    if ! command -v brew &>/dev/null; then
        log_info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add to path for this session
        if [ -f /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
    else
        log_ok "Homebrew already installed"
    fi

    # Node.js 20
    if ! command -v node &>/dev/null || ! node -v 2>/dev/null | grep -q "^v2[0-9]"; then
        log_info "Installing Node.js 20..."
        brew install node@20
        brew link node@20 --overwrite 2>/dev/null || true
        export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
    else
        log_ok "Node.js $(node -v) already installed"
    fi
    # Ensure node@20 is on PATH even if already installed (brew link may not be active)
    [ -d "/opt/homebrew/opt/node@20/bin" ] && export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

    # GitHub CLI
    if ! command -v gh &>/dev/null; then
        log_info "Installing GitHub CLI..."
        brew install gh
    else
        log_ok "GitHub CLI already installed"
    fi

    # Infisical
    if ! command -v infisical &>/dev/null; then
        log_info "Installing Infisical..."
        brew install infisical/get-cli/infisical
    else
        log_ok "Infisical already installed"
    fi

    # Claude Code (native installer for auto-updates)
    if ! command -v claude &>/dev/null; then
        log_info "Installing Claude Code (native installer)..."
        curl -fsSL https://claude.ai/install.sh | bash
    else
        log_ok "Claude Code already installed"
    fi

    # Wrangler
    if ! command -v wrangler &>/dev/null; then
        log_info "Installing Wrangler..."
        npm install -g wrangler
    else
        log_ok "Wrangler already installed"
    fi

    # uv (Python package runner - useful for Python MCP servers)
    if ! command -v uv &>/dev/null; then
        log_info "Installing uv..."
        brew install uv
    else
        log_ok "uv already installed"
    fi

elif [ "$OS" = "linux" ]; then
    # Node.js 20
    if ! command -v node &>/dev/null || ! node -v 2>/dev/null | grep -q "^v2[0-9]"; then
        log_info "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        log_ok "Node.js $(node -v) already installed"
    fi

    # GitHub CLI
    if ! command -v gh &>/dev/null; then
        log_info "Installing GitHub CLI..."
        (type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) \
          && sudo mkdir -p -m 755 /etc/apt/keyrings \
          && out=$(mktemp) && wget -nv -O"$out" https://cli.github.com/packages/githubcli-archive-keyring.gpg \
          && cat "$out" | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
          && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
          && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
          && sudo apt update \
          && sudo apt install gh -y
    else
        log_ok "GitHub CLI already installed"
    fi

    # Infisical
    if ! command -v infisical &>/dev/null; then
        log_info "Installing Infisical..."
        curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
        sudo apt-get update && sudo apt-get install -y infisical
    else
        log_ok "Infisical already installed"
    fi

    # Claude Code (native installer for auto-updates)
    if ! command -v claude &>/dev/null; then
        log_info "Installing Claude Code (native installer)..."
        curl -fsSL https://claude.ai/install.sh | bash
    else
        log_ok "Claude Code already installed"
    fi

    # Wrangler
    if ! command -v wrangler &>/dev/null; then
        log_info "Installing Wrangler..."
        npm install -g wrangler
    else
        log_ok "Wrangler already installed"
    fi
fi

# ─── Step 4: Fix PATH ─────────────────────────────────────────────

NPM_BIN="$HOME/.npm-global/bin"
if [ -d "$NPM_BIN" ]; then
    if ! echo "$PATH" | grep -q "$NPM_BIN"; then
        export PATH="$NPM_BIN:$PATH"
        # Add to shell profile if not already there
        SHELL_PROFILE=""
        if [ -f "$HOME/.zshrc" ]; then
            SHELL_PROFILE="$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then
            SHELL_PROFILE="$HOME/.bashrc"
        fi

        if [ -n "$SHELL_PROFILE" ] && ! grep -q ".npm-global/bin" "$SHELL_PROFILE" 2>/dev/null; then
            echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$SHELL_PROFILE"
            log_ok "Added ~/.npm-global/bin to $SHELL_PROFILE"
        fi
    fi
fi

# ─── Step 5: Generate SSH Key ─────────────────────────────────────

SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
    log_info "Generating SSH key..."
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)" -f "$SSH_KEY" -N ""
    log_ok "SSH key generated: $SSH_KEY"
else
    log_ok "SSH key already exists: $SSH_KEY"
fi

PUBKEY=$(cat "${SSH_KEY}.pub")

# ─── Step 6: Machine Alias ────────────────────────────────────────

DEFAULT_HOSTNAME=$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/\.local$//')
if [ -z "${MACHINE_ALIAS:-}" ]; then
    if [ -t 0 ]; then
        echo ""
        read -rp "Machine alias [$DEFAULT_HOSTNAME]: " MACHINE_ALIAS
    fi
    MACHINE_ALIAS="${MACHINE_ALIAS:-$DEFAULT_HOSTNAME}"
fi

log_ok "Machine alias: $MACHINE_ALIAS"

# ─── Step 7: Clone crane-console ──────────────────────────────────

REPO_DIR="$HOME/dev/crane-console"
if [ ! -d "$REPO_DIR" ]; then
    log_info "Cloning crane-console..."
    mkdir -p "$HOME/dev"
    gh repo clone venturecrane/crane-console "$REPO_DIR"
    log_ok "Cloned to $REPO_DIR"
else
    log_ok "crane-console already exists at $REPO_DIR"
fi

# ─── Step 8: Build Crane CLI ──────────────────────────────────────

CRANE_MCP_DIR="$REPO_DIR/packages/crane-mcp"
if [ -d "$CRANE_MCP_DIR" ]; then
    log_info "Building and linking crane CLI..."
    (cd "$CRANE_MCP_DIR" && npm install && npm run build && npm link)
    log_ok "Crane CLI built and linked"
else
    log_warn "packages/crane-mcp not found, skipping crane CLI build"
fi

# ─── Step 8b: Configure MCP Servers ──────────────────────────────

if [ "$OS" = "darwin" ]; then
    # Apple Notes MCP (full CRUD - macOS only)
    # Uses yuki-mtmr/mcp-apple-notes (npm) with JXA for read/create/update/delete/move
    EXISTING_MCP=$(claude mcp list 2>/dev/null || echo "")
    if echo "$EXISTING_MCP" | grep -q "apple-notes"; then
        log_ok "Apple Notes MCP already configured"
    else
        log_info "Adding Apple Notes MCP server..."
        claude mcp add apple-notes -s user -- npx mcp-apple-notes@latest 2>/dev/null
        log_ok "Apple Notes MCP configured (read/write via JXA)"
    fi
fi

# ─── Step 9: Register with API ────────────────────────────────────

log_info "Registering machine with Crane Context API..."

REGISTER_RESPONSE=$(curl -sf "$API_URL/machines/register" \
    -H "Content-Type: application/json" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
    -d "{
        \"hostname\": \"$MACHINE_ALIAS\",
        \"tailscale_ip\": \"$TAILSCALE_IP\",
        \"user\": \"$(whoami)\",
        \"os\": \"$OS\",
        \"arch\": \"$ARCH\",
        \"pubkey\": \"$PUBKEY\",
        \"role\": \"dev\"
    }" 2>/dev/null || true)

if [ -n "$REGISTER_RESPONSE" ]; then
    CREATED=$(echo "$REGISTER_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('created', ''))" 2>/dev/null || echo "")
    if [ "$CREATED" = "True" ] || [ "$CREATED" = "true" ]; then
        log_ok "Machine registered (new)"
    else
        log_ok "Machine updated (existing)"
    fi
else
    log_warn "Failed to register with API (will retry next session)"
fi

# ─── Step 10: Fetch SSH Mesh Config ───────────────────────────────

log_info "Fetching SSH mesh config..."

MESH_CONFIG=$(curl -sf "$API_URL/machines/ssh-mesh-config?for=$MACHINE_ALIAS" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" 2>/dev/null || true)

if [ -n "$MESH_CONFIG" ]; then
    CONFIG_TEXT=$(echo "$MESH_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('config', ''))" 2>/dev/null || echo "")
    if [ -n "$CONFIG_TEXT" ]; then
        mkdir -p "$HOME/.ssh/config.d"
        echo "$CONFIG_TEXT" > "$HOME/.ssh/config.d/crane-mesh"
        chmod 600 "$HOME/.ssh/config.d/crane-mesh"

        # Ensure Include directive in main config
        if [ ! -f "$HOME/.ssh/config" ]; then
            echo "Include config.d/*" > "$HOME/.ssh/config"
            chmod 600 "$HOME/.ssh/config"
        elif ! grep -q "Include config.d/\*" "$HOME/.ssh/config"; then
            TMP=$(mktemp)
            echo "Include config.d/*" > "$TMP"
            echo "" >> "$TMP"
            cat "$HOME/.ssh/config" >> "$TMP"
            mv "$TMP" "$HOME/.ssh/config"
            chmod 600 "$HOME/.ssh/config"
        fi

        log_ok "SSH mesh config written to ~/.ssh/config.d/crane-mesh"
    else
        log_warn "Empty SSH mesh config (no other machines registered yet?)"
    fi
else
    log_warn "Failed to fetch SSH mesh config (will retry with setup-ssh-mesh.sh)"
fi

# ─── Step 10b: Distribute fleet authorized_keys from API ─────────

log_info "Fetching fleet pubkeys from API..."

FLEET_MACHINES=$(curl -sf "$API_URL/machines" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" 2>/dev/null || true)

if [ -n "$FLEET_MACHINES" ]; then
    FLEET_KEYS=$(echo "$FLEET_MACHINES" | python3 -c "
import json, sys
data = json.load(sys.stdin)
this_host = '$MACHINE_ALIAS'
for m in data.get('machines', []):
    if m['hostname'] != this_host and m.get('pubkey'):
        print(m['pubkey'])
" 2>/dev/null || true)

    if [ -n "$FLEET_KEYS" ]; then
        mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
        touch "$HOME/.ssh/authorized_keys"
        chmod 600 "$HOME/.ssh/authorized_keys"

        # Include this machine's own key (required for inbound SSH)
        ALL_KEYS="$PUBKEY
$FLEET_KEYS"

        ADDED=0
        while IFS= read -r key; do
            [ -z "$key" ] && continue
            key_fingerprint=$(echo "$key" | awk '{print $2}')
            if ! grep -q "$key_fingerprint" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
                echo "$key" >> "$HOME/.ssh/authorized_keys"
                ((ADDED++)) || true
            fi
        done <<< "$ALL_KEYS"

        log_ok "Authorized keys: $ADDED added (self + fleet)"
    else
        log_warn "No fleet pubkeys found in API"
    fi
else
    log_warn "Failed to fetch fleet machines (authorized_keys not updated)"
fi

# ─── Step 10c: Block analytics beacon ────────────────────────────

log_info "Blocking analytics beacon (exclude fleet from Web Analytics)..."

BEACON_DOMAIN="static.cloudflareinsights.com"
if grep -q "$BEACON_DOMAIN" /etc/hosts 2>/dev/null; then
    log_ok "Analytics beacon already blocked in /etc/hosts"
else
    echo "0.0.0.0 $BEACON_DOMAIN" | sudo tee -a /etc/hosts >/dev/null
    log_ok "Blocked $BEACON_DOMAIN in /etc/hosts"
fi

# ─── Step 11: Copy .infisical.json ────────────────────────────────

INFISICAL_JSON="$REPO_DIR/.infisical.json"
if [ ! -f "$INFISICAL_JSON" ]; then
    cat > "$INFISICAL_JSON" << 'INFISICAL_EOF'
{
    "workspaceId": "6741e87bf3e3700b1f46e63f",
    "defaultEnvironment": "dev",
    "gitBranchToEnvironmentMapping": null
}
INFISICAL_EOF
    log_ok "Created .infisical.json"
else
    log_ok ".infisical.json already exists"
fi

# ═════════════════════════════════════════════════════════════════════
# Next Steps
# ═════════════════════════════════════════════════════════════════════

banner "Bootstrap Complete"

echo "Next steps:"
echo ""
echo "  1. Login to Infisical:"
echo "     infisical login"
echo ""
echo "  2. Login to Claude:"
echo "     claude login"
echo ""
echo "  3. Login to GitHub CLI:"
echo "     gh auth login"
echo ""
echo "  4. Start a session:"
echo "     crane vc"
echo ""
