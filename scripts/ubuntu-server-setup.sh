#!/bin/bash
#
# Ubuntu Server Setup Script for Claude Code CLI
# Run this on your Ubuntu server to set up ccs command and slash commands
#

set -e

echo "## Ubuntu Server Setup for Claude Code CLI"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Install dependencies
echo -e "${BLUE}Step 1: Installing dependencies${NC}"
echo ""

echo "Updating package list..."
sudo apt update

echo "Installing jq, curl, git..."
sudo apt install -y jq curl git

echo -e "${GREEN}✓ Basic dependencies installed${NC}"
echo ""

# Step 2: Install GitHub CLI
echo -e "${BLUE}Step 2: Installing GitHub CLI${NC}"
echo ""

if command -v gh &> /dev/null; then
    echo "GitHub CLI already installed"
else
    echo "Installing GitHub CLI..."
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    sudo apt update
    sudo apt install -y gh
fi

echo -e "${GREEN}✓ GitHub CLI installed${NC}"
echo ""

# Step 3: Check GitHub authentication
echo -e "${BLUE}Step 3: GitHub Authentication${NC}"
echo ""

if gh auth status &> /dev/null; then
    echo -e "${GREEN}✓ Already authenticated with GitHub${NC}"
else
    echo -e "${YELLOW}You need to authenticate with GitHub${NC}"
    echo "After this script, run: gh auth login"
fi
echo ""

# Step 4: Set up environment variables
echo -e "${BLUE}Step 4: Setting up environment variables${NC}"
echo ""

BASHRC="$HOME/.bashrc"

# Check if CRANE_CONTEXT_KEY is already in .bashrc
if grep -q "CRANE_CONTEXT_KEY" "$BASHRC"; then
    echo -e "${YELLOW}CRANE_CONTEXT_KEY already in .bashrc${NC}"
else
    echo ""
    echo "We need to set up your CRANE_CONTEXT_KEY."
    echo -n "Enter your Crane Context API key: "
    read CRANE_KEY

    echo "" >> "$BASHRC"
    echo "# Crane Context API Key" >> "$BASHRC"
    echo "export CRANE_CONTEXT_KEY=\"$CRANE_KEY\"" >> "$BASHRC"

    echo -e "${GREEN}✓ Added CRANE_CONTEXT_KEY to .bashrc${NC}"
fi
echo ""

# Step 5: Add ccs function
echo -e "${BLUE}Step 5: Adding ccs command${NC}"
echo ""

if grep -q "^ccs()" "$BASHRC"; then
    echo -e "${YELLOW}ccs function already in .bashrc${NC}"
else
    cat >> "$BASHRC" << 'EOF'

# Crane Code Selector (ccs) - Select and open repos with Claude
ccs() {
    local orgs=("venturecrane")
    local base_dir

    # Use ~/dev if it exists, otherwise ~/projects
    if [[ -d "$HOME/dev" ]]; then
        base_dir="$HOME/dev"
    else
        base_dir="$HOME/projects"
    fi

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

# Step 6: Reload .bashrc
echo -e "${BLUE}Step 6: Reloading shell configuration${NC}"
echo ""

source "$BASHRC"
echo -e "${GREEN}✓ Configuration reloaded${NC}"
echo ""

# Summary
echo "================================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. If not authenticated with GitHub, run:"
echo "   ${BLUE}gh auth login${NC}"
echo ""
echo "2. Ensure Claude Code CLI is installed"
echo "   Visit: https://github.com/anthropics/claude-code"
echo ""
echo "3. Clone the crane-console repo:"
echo "   ${BLUE}cd ~/dev  # or ~/projects${NC}"
echo "   ${BLUE}git clone git@github.com:venturecrane/crane-console.git${NC}"
echo ""
echo "4. Test the setup:"
echo "   ${BLUE}ccs${NC}"
echo ""
echo "5. Once in Claude Code, use slash commands:"
echo "   ${BLUE}/sod${NC} - Start of day"
echo "   ${BLUE}/eod${NC} - End of day"
echo ""
