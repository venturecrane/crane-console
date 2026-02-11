#!/bin/bash
#
# Xubuntu Dev Environment Setup
# Adapted from Ubuntu server setup for desktop environment
#

set -e

echo "## Xubuntu Dev Environment Setup"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Update system
echo -e "${BLUE}Step 1: Updating system${NC}"
echo ""
sudo apt update
sudo apt upgrade -y
echo -e "${GREEN}✓ System updated${NC}"
echo ""

# Step 2: Install core dependencies
echo -e "${BLUE}Step 2: Installing core dependencies${NC}"
echo ""
sudo apt install -y \
    jq \
    curl \
    git \
    build-essential \
    ca-certificates \
    gnupg
echo -e "${GREEN}✓ Core dependencies installed${NC}"
echo ""

# Step 3: Install GitHub CLI
echo -e "${BLUE}Step 3: Installing GitHub CLI${NC}"
echo ""
if command -v gh &> /dev/null; then
    echo "GitHub CLI already installed"
else
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    sudo apt update
    sudo apt install -y gh
fi
echo -e "${GREEN}✓ GitHub CLI installed${NC}"
echo ""

# Step 4: Install Node.js (via nvm for version management)
echo -e "${BLUE}Step 4: Installing Node.js${NC}"
echo ""
if command -v node &> /dev/null; then
    echo "Node.js already installed: $(node --version)"
else
    echo "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    echo "Installing Node.js v22..."
    nvm install 22
    nvm use 22
    nvm alias default 22
fi
echo -e "${GREEN}✓ Node.js installed${NC}"
echo ""

# Step 5: Configure npm global directory
echo -e "${BLUE}Step 5: Configuring npm${NC}"
echo ""
mkdir -p "$HOME/.npm-global"
npm config set prefix "$HOME/.npm-global"

# Add to PATH if not already there
if ! grep -q ".npm-global/bin" "$HOME/.bashrc"; then
    echo "" >> "$HOME/.bashrc"
    echo "# npm global binaries" >> "$HOME/.bashrc"
    echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$HOME/.bashrc"
fi
export PATH="$HOME/.npm-global/bin:$PATH"
echo -e "${GREEN}✓ npm configured${NC}"
echo ""

# Step 6: Install Claude Code CLI
echo -e "${BLUE}Step 6: Installing Claude Code CLI${NC}"
echo ""
if command -v claude &> /dev/null; then
    echo "Claude Code CLI already installed"
else
    npm install -g @anthropic-ai/claude-code
fi
echo -e "${GREEN}✓ Claude Code CLI installed${NC}"
echo ""

# Step 7: Install Wrangler
echo -e "${BLUE}Step 7: Installing Wrangler CLI${NC}"
echo ""
if command -v wrangler &> /dev/null; then
    echo "Wrangler already installed"
else
    npm install -g wrangler
fi
echo -e "${GREEN}✓ Wrangler CLI installed${NC}"
echo ""

# Step 8: Set up Crane Context API key
echo -e "${BLUE}Step 8: Setting up Crane Context API key${NC}"
echo ""
if grep -q "CRANE_CONTEXT_KEY" "$HOME/.bashrc"; then
    echo -e "${YELLOW}CRANE_CONTEXT_KEY already in .bashrc${NC}"
else
    echo ""
    echo "We need to set up your CRANE_CONTEXT_KEY."
    echo -n "Enter your Crane Context API key: "
    read CRANE_KEY

    echo "" >> "$HOME/.bashrc"
    echo "# Crane Context API Key" >> "$HOME/.bashrc"
    echo "export CRANE_CONTEXT_KEY=\"$CRANE_KEY\"" >> "$HOME/.bashrc"

    echo -e "${GREEN}✓ Added CRANE_CONTEXT_KEY to .bashrc${NC}"
fi
echo ""

# Step 9: Add ccs function
echo -e "${BLUE}Step 9: Adding ccs command${NC}"
echo ""
if grep -q "^ccs()" "$HOME/.bashrc"; then
    echo -e "${YELLOW}ccs function already in .bashrc${NC}"
else
    cat >> "$HOME/.bashrc" << 'EOF'

# Crane Code Selector (ccs) - Select and open repos with Claude
ccs() {
    local orgs=("venturecrane")
    local base_dir="$HOME/dev"

    mkdir -p "$base_dir"

    # Gather all repos from all orgs
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
        echo "Error: No repos found or API error"
        return 1
    fi

    # Build menu
    local menu_items=()
    local i=1
    for repo in "${all_repos[@]}"; do
        local repo_name="${repo#*/}"
        local local_path="$base_dir/$repo_name"

        if [[ -d "$local_path" ]]; then
            menu_items+=("$i) $repo")
        else
            menu_items+=("$i) $repo [not cloned]")
        fi
        ((i++))
    done

    # Display menu
    echo "Select repo:"
    printf "  %s\n" "${menu_items[@]}"
    echo -n "Enter number (or q to quit): "
    read selection

    if [[ "$selection" == "q" ]]; then
        return 0
    fi

    if ! [[ "$selection" =~ ^[0-9]+$ ]] || (( selection < 1 || selection > ${#all_repos[@]} )); then
        echo "Invalid selection"
        return 1
    fi

    local selected_repo="${all_repos[$selection]}"
    local repo_name="${selected_repo#*/}"
    local target_dir="$base_dir/$repo_name"

    echo "→ $selected_repo"

    # Clone if needed
    if [[ ! -d "$target_dir" ]]; then
        echo -n "Repo not cloned locally. Clone now? (y/n): "
        read should_clone

        if [[ "$should_clone" =~ ^[Yy]$ ]]; then
            echo "Cloning $selected_repo..."
            if git clone "git@github.com:$selected_repo.git" "$target_dir"; then
                echo "Cloned successfully"
            else
                echo "Clone failed"
                return 1
            fi
        else
            echo "Cancelled"
            return 1
        fi
    fi

    # Change directory and launch Claude
    cd "$target_dir" || return 1
    echo "Now in: $(pwd)"
    claude
}
EOF

    echo -e "${GREEN}✓ Added ccs function to .bashrc${NC}"
fi
echo ""

# Step 10: Create SSH key for GitHub
echo -e "${BLUE}Step 10: Setting up SSH key for GitHub${NC}"
echo ""
if [[ -f "$HOME/.ssh/id_ed25519" ]]; then
    echo -e "${YELLOW}SSH key already exists${NC}"
else
    echo "Creating SSH key..."
    ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)" -f "$HOME/.ssh/id_ed25519" -N ""
    eval "$(ssh-agent -s)"
    ssh-add "$HOME/.ssh/id_ed25519"

    echo ""
    echo -e "${YELLOW}Copy this SSH public key to GitHub:${NC}"
    echo ""
    cat "$HOME/.ssh/id_ed25519.pub"
    echo ""
    echo "Visit: https://github.com/settings/keys"
    echo "Click 'New SSH key', paste the key above"
    echo ""
    read -p "Press Enter once you've added the key to GitHub..."
fi
echo -e "${GREEN}✓ SSH key configured${NC}"
echo ""

# Summary
echo "================================================"
echo -e "${GREEN}Dev Environment Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Reload your shell:"
echo "   ${BLUE}source ~/.bashrc${NC}"
echo ""
echo "2. Authenticate with GitHub:"
echo "   ${BLUE}gh auth login${NC}"
echo ""
echo "3. Authenticate with Cloudflare:"
echo "   ${BLUE}wrangler login${NC}"
echo ""
echo "4. Test the setup:"
echo "   ${BLUE}ccs${NC}"
echo ""
echo "5. Clone crane-console and start developing:"
echo "   ${BLUE}ccs${NC} → Select venturecrane/crane-console"
echo "   ${BLUE}/sod${NC} → Start your day in Claude"
echo ""
