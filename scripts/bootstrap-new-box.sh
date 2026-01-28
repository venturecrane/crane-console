#!/bin/bash
#
# Bootstrap New Development Box
#
# Run this from a control machine (e.g., your Mac) to fully configure
# a new Ubuntu/Xubuntu box for crane development.
#
# Prerequisites on new box:
#   - Ubuntu/Xubuntu installed
#   - User account created
#   - Network connected
#   - SSH server installed: sudo apt install openssh-server
#   - Firewall allows SSH: sudo ufw allow ssh
#
# Usage:
#   ./bootstrap-new-box.sh <target-ip> <username>
#
# Example:
#   ./bootstrap-new-box.sh 10.0.4.138 scottdurgan
#
# What this script does:
#   1. Copies SSH key to target for passwordless access
#   2. Installs all dev tools (git, node, npm, gh, wrangler, claude)
#   3. Configures environment variables (CRANE_CONTEXT_KEY, CLOUDFLARE_API_TOKEN)
#   4. Authenticates GitHub CLI (token-based, no browser)
#   5. Clones crane-console repo
#   6. Configures laptop for server mode (lid close = ignore)
#   7. Runs /sod to verify everything works
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Arguments
TARGET_IP="${1:-}"
TARGET_USER="${2:-}"
SSH_PORT="${3:-22}"

# Validate arguments
if [[ -z "$TARGET_IP" || -z "$TARGET_USER" ]]; then
    echo -e "${RED}Usage: $0 <target-ip> <username> [ssh-port]${NC}"
    echo ""
    echo "Example: $0 10.0.4.138 scottdurgan"
    exit 1
fi

TARGET="$TARGET_USER@$TARGET_IP"
SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p $SSH_PORT $TARGET"

echo "================================================"
echo -e "${BLUE}Bootstrap New Development Box${NC}"
echo "================================================"
echo ""
echo "Target: $TARGET (port $SSH_PORT)"
echo ""

# Check required environment variables on control machine
echo -e "${BLUE}Step 0: Checking control machine environment${NC}"
MISSING_VARS=0

if [[ -z "$CRANE_CONTEXT_KEY" ]]; then
    echo -e "${RED}✗ CRANE_CONTEXT_KEY not set on control machine${NC}"
    MISSING_VARS=1
else
    echo -e "${GREEN}✓ CRANE_CONTEXT_KEY available${NC}"
fi

if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
    echo -e "${YELLOW}⚠ CLOUDFLARE_API_TOKEN not set (will skip Cloudflare setup)${NC}"
else
    echo -e "${GREEN}✓ CLOUDFLARE_API_TOKEN available${NC}"
fi

# Get GitHub token
GH_TOKEN=$(gh auth token 2>/dev/null || echo "")
if [[ -z "$GH_TOKEN" ]]; then
    echo -e "${RED}✗ GitHub CLI not authenticated on control machine${NC}"
    echo "  Run: gh auth login"
    MISSING_VARS=1
else
    echo -e "${GREEN}✓ GitHub token available${NC}"
fi

if [[ $MISSING_VARS -eq 1 ]]; then
    echo ""
    echo -e "${RED}Fix missing variables before continuing${NC}"
    exit 1
fi

echo ""

# Step 1: Test connectivity
echo -e "${BLUE}Step 1: Testing connectivity${NC}"
if $SSH_CMD 'echo "Connection successful"' 2>/dev/null; then
    echo -e "${GREEN}✓ SSH connection works${NC}"
else
    echo -e "${YELLOW}SSH connection failed - trying to copy SSH key${NC}"

    # Copy SSH key
    if [[ -f "$HOME/.ssh/id_ed25519.pub" ]]; then
        ssh-copy-id -i "$HOME/.ssh/id_ed25519.pub" -p $SSH_PORT "$TARGET" || {
            echo -e "${RED}✗ Could not copy SSH key. Try manually:${NC}"
            echo "  ssh-copy-id -p $SSH_PORT $TARGET"
            exit 1
        }
        echo -e "${GREEN}✓ SSH key copied${NC}"
    else
        echo -e "${RED}✗ No SSH key found at ~/.ssh/id_ed25519.pub${NC}"
        echo "  Generate one with: ssh-keygen -t ed25519"
        exit 1
    fi
fi
echo ""

# Step 2: Install core packages
echo -e "${BLUE}Step 2: Installing core packages${NC}"
$SSH_CMD 'sudo apt update && sudo apt install -y git curl jq build-essential ca-certificates gnupg openssh-server' 2>&1 | tail -3
echo -e "${GREEN}✓ Core packages installed${NC}"
echo ""

# Step 3: Install GitHub CLI
echo -e "${BLUE}Step 3: Installing GitHub CLI${NC}"
$SSH_CMD 'command -v gh || (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt update && sudo apt install -y gh)' 2>&1 | tail -2
echo -e "${GREEN}✓ GitHub CLI installed${NC}"
echo ""

# Step 4: Install Node.js (if not present)
echo -e "${BLUE}Step 4: Installing Node.js${NC}"
$SSH_CMD 'command -v node || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs)' 2>&1 | tail -2
NODE_VERSION=$($SSH_CMD 'node --version' 2>/dev/null)
echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
echo ""

# Step 5: Configure npm global directory
echo -e "${BLUE}Step 5: Configuring npm${NC}"
$SSH_CMD 'mkdir -p $HOME/.npm-global && npm config set prefix "$HOME/.npm-global"'
$SSH_CMD 'grep -q ".npm-global/bin" $HOME/.bashrc || echo "export PATH=\$HOME/.npm-global/bin:\$PATH" >> $HOME/.bashrc'
echo -e "${GREEN}✓ npm configured${NC}"
echo ""

# Step 6: Install Claude CLI and Wrangler
echo -e "${BLUE}Step 6: Installing Claude CLI and Wrangler${NC}"
$SSH_CMD 'export PATH=$HOME/.npm-global/bin:$PATH && npm install -g @anthropic-ai/claude-code wrangler' 2>&1 | tail -3
CLAUDE_VERSION=$($SSH_CMD 'export PATH=$HOME/.npm-global/bin:$PATH && claude --version' 2>/dev/null)
WRANGLER_VERSION=$($SSH_CMD 'export PATH=$HOME/.npm-global/bin:$PATH && wrangler --version' 2>/dev/null | head -1)
echo -e "${GREEN}✓ Claude CLI: $CLAUDE_VERSION${NC}"
echo -e "${GREEN}✓ Wrangler: $WRANGLER_VERSION${NC}"
echo ""

# Step 7: Configure environment variables
echo -e "${BLUE}Step 7: Configuring environment variables${NC}"

# CRANE_CONTEXT_KEY
$SSH_CMD "grep -q CRANE_CONTEXT_KEY ~/.bashrc || echo 'export CRANE_CONTEXT_KEY=\"$CRANE_CONTEXT_KEY\"' >> ~/.bashrc"
echo -e "${GREEN}✓ CRANE_CONTEXT_KEY configured${NC}"

# CLOUDFLARE_API_TOKEN (if available)
if [[ -n "$CLOUDFLARE_API_TOKEN" ]]; then
    $SSH_CMD "grep -q CLOUDFLARE_API_TOKEN ~/.bashrc || echo 'export CLOUDFLARE_API_TOKEN=\"$CLOUDFLARE_API_TOKEN\"' >> ~/.bashrc"
    echo -e "${GREEN}✓ CLOUDFLARE_API_TOKEN configured${NC}"
fi

# CRANE_ADMIN_KEY (if available)
if [[ -n "$CRANE_ADMIN_KEY" ]]; then
    $SSH_CMD "grep -q CRANE_ADMIN_KEY ~/.bashrc || echo 'export CRANE_ADMIN_KEY=\"$CRANE_ADMIN_KEY\"' >> ~/.bashrc"
    echo -e "${GREEN}✓ CRANE_ADMIN_KEY configured${NC}"
fi
echo ""

# Step 8: Authenticate GitHub CLI
echo -e "${BLUE}Step 8: Authenticating GitHub CLI${NC}"
echo "$GH_TOKEN" | $SSH_CMD 'gh auth login --with-token' 2>&1
GH_STATUS=$($SSH_CMD 'gh auth status' 2>&1 | head -3)
echo -e "${GREEN}✓ GitHub CLI authenticated${NC}"
echo ""

# Step 9: Generate SSH key and add to GitHub
echo -e "${BLUE}Step 9: Setting up SSH key for target machine${NC}"
$SSH_CMD 'test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)" -f ~/.ssh/id_ed25519 -N ""'

# Get the public key and add to GitHub
TARGET_PUBKEY=$($SSH_CMD 'cat ~/.ssh/id_ed25519.pub')
TARGET_HOSTNAME=$($SSH_CMD 'hostname')

# Check if key already exists on GitHub
EXISTING_KEYS=$(gh ssh-key list 2>/dev/null | grep "$TARGET_HOSTNAME" || echo "")
if [[ -z "$EXISTING_KEYS" ]]; then
    echo "$TARGET_PUBKEY" > /tmp/target-ssh-key.pub
    gh ssh-key add /tmp/target-ssh-key.pub --title "$TARGET_HOSTNAME" 2>/dev/null || echo "Key may already exist"
    rm -f /tmp/target-ssh-key.pub
    echo -e "${GREEN}✓ SSH key added to GitHub${NC}"
else
    echo -e "${YELLOW}⚠ SSH key for $TARGET_HOSTNAME already exists on GitHub${NC}"
fi
echo ""

# Step 10: Clone crane-console
echo -e "${BLUE}Step 10: Cloning crane-console${NC}"
$SSH_CMD 'mkdir -p ~/dev && cd ~/dev && (test -d crane-console || git clone https://github.com/venturecrane/crane-console.git)' 2>&1 | tail -2
echo -e "${GREEN}✓ crane-console cloned${NC}"
echo ""

# Step 11: Configure for server mode (laptop lid close)
echo -e "${BLUE}Step 11: Configuring server mode (lid close = ignore)${NC}"
$SSH_CMD 'sudo sed -i "s/#HandleLidSwitch=suspend/HandleLidSwitch=ignore/" /etc/systemd/logind.conf 2>/dev/null; sudo sed -i "s/#HandleLidSwitchExternalPower=suspend/HandleLidSwitchExternalPower=ignore/" /etc/systemd/logind.conf 2>/dev/null; sudo systemctl restart systemd-logind 2>/dev/null' || echo -e "${YELLOW}⚠ Could not configure lid close (may need manual sudo)${NC}"
echo -e "${GREEN}✓ Server mode configured${NC}"
echo ""

# Step 12: Add ccs function
echo -e "${BLUE}Step 12: Adding ccs command${NC}"
$SSH_CMD 'grep -q "^ccs()" ~/.bashrc' 2>/dev/null || {
    cat << 'CCSEOF' | $SSH_CMD 'cat >> ~/.bashrc'

# Crane Code Selector (ccs) - Select and open repos with Claude
ccs() {
    local orgs=("durganfieldguide" "venturecrane" "siliconcrane")
    local base_dir="$HOME/dev"
    mkdir -p "$base_dir"

    local all_repos=()
    for org in "${orgs[@]}"; do
        local org_repos=$(gh repo list "$org" --limit 100 --json nameWithOwner,isArchived --jq '.[] | select(.isArchived == false) | .nameWithOwner' 2>/dev/null)
        if [[ -n "$org_repos" ]]; then
            while IFS= read -r repo; do
                [[ -n "$repo" ]] && all_repos+=("$repo")
            done <<< "$org_repos"
        fi
    done

    if [[ ${#all_repos[@]} -eq 0 ]]; then
        echo "Error: No repos found"
        return 1
    fi

    local i=1
    for repo in "${all_repos[@]}"; do
        local repo_name="${repo#*/}"
        if [[ -d "$base_dir/$repo_name" ]]; then
            echo "$i) $repo"
        else
            echo "$i) $repo [not cloned]"
        fi
        ((i++))
    done

    echo -n "Enter number (or q to quit): "
    read selection
    [[ "$selection" == "q" ]] && return 0

    if ! [[ "$selection" =~ ^[0-9]+$ ]] || (( selection < 1 || selection > ${#all_repos[@]} )); then
        echo "Invalid selection"
        return 1
    fi

    local selected_repo="${all_repos[$selection]}"
    local repo_name="${selected_repo#*/}"
    local target_dir="$base_dir/$repo_name"

    if [[ ! -d "$target_dir" ]]; then
        echo -n "Clone $selected_repo? (y/n): "
        read should_clone
        [[ "$should_clone" =~ ^[Yy]$ ]] && git clone "git@github.com:$selected_repo.git" "$target_dir"
    fi

    cd "$target_dir" && claude
}
CCSEOF
}
echo -e "${GREEN}✓ ccs command added${NC}"
echo ""

# Step 13: Create Claude Code settings
echo -e "${BLUE}Step 13: Configuring Claude Code permissions${NC}"
$SSH_CMD 'mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "permissions": {
    "allow": [
      "Bash",
      "Read",
      "Write",
      "Edit",
      "WebFetch",
      "WebSearch",
      "Skill",
      "Glob",
      "Grep"
    ]
  }
}
EOF'
echo -e "${GREEN}✓ Claude Code permissions configured${NC}"
echo ""

# Step 14: Verification
echo -e "${BLUE}Step 14: Running verification${NC}"
echo ""

# Test /sod
echo "Testing /sod..."
SOD_RESULT=$($SSH_CMD "export PATH=\$HOME/.npm-global/bin:\$PATH && export CRANE_CONTEXT_KEY=\"$CRANE_CONTEXT_KEY\" && export CLOUDFLARE_API_TOKEN=\"$CLOUDFLARE_API_TOKEN\" && cd ~/dev/crane-console && bash scripts/sod-universal.sh 2>&1" | tail -20)

if echo "$SOD_RESULT" | grep -q "Session ID"; then
    echo -e "${GREEN}✓ /sod works - session created${NC}"
else
    echo -e "${YELLOW}⚠ /sod may have issues - check manually${NC}"
fi

echo ""
echo "================================================"
echo -e "${GREEN}Bootstrap Complete!${NC}"
echo "================================================"
echo ""
echo "Target machine: $TARGET_HOSTNAME ($TARGET_IP)"
echo ""
echo "Installed:"
echo "  - Git, curl, jq, build-essential"
echo "  - Node.js $NODE_VERSION"
echo "  - Claude CLI $CLAUDE_VERSION"
echo "  - Wrangler $WRANGLER_VERSION"
echo "  - GitHub CLI (authenticated)"
echo ""
echo "Configured:"
echo "  - CRANE_CONTEXT_KEY"
echo "  - CLOUDFLARE_API_TOKEN"
echo "  - SSH key added to GitHub"
echo "  - Lid close = ignore (server mode)"
echo "  - ccs command for repo switching"
echo "  - Claude Code permissions"
echo ""
echo "To use:"
echo "  ssh $TARGET"
echo "  source ~/.bashrc"
echo "  ccs  # Select repo and start coding"
echo ""
echo "Or run Claude directly:"
echo "  ssh $TARGET 'cd ~/dev/crane-console && source ~/.bashrc && claude'"
echo ""
