# Ubuntu Server Setup for Claude Code CLI

This guide explains how to set up the same shell commands (like `ccs`) and slash commands (like `/sod` and `/eod`) on an Ubuntu server.

## Prerequisites

Install required tools:

```bash
# Update package list
sudo apt update

# Install jq (for JSON parsing)
sudo apt install -y jq curl git

# Install GitHub CLI
# See: https://github.com/cli/cli/blob/trunk/docs/install_linux.md
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install -y gh

# Authenticate GitHub CLI
gh auth login

# Install Claude Code CLI
# Follow instructions at: https://github.com/anthropics/claude-code
```

## 1. Set Up Environment Variables

Add this to your `~/.bashrc` (or `~/.zshrc` if using zsh):

```bash
# Crane Context API Key
export CRANE_CONTEXT_KEY="your-key-here"
```

After adding, reload your shell:

```bash
source ~/.bashrc
```

## 2. Set Up the `ccs` Command

Add this function to your `~/.bashrc`:

```bash
ccs() {
    local orgs=("durganfieldguide" "venturecrane" "siliconcrane")
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
```

After adding, reload:

```bash
source ~/.bashrc
```

## 3. Set Up Claude Code Slash Commands

Clone this repo to your server if not already done:

```bash
cd ~/dev  # or ~/projects
git clone git@github.com:venturecrane/crane-console.git
cd crane-console
```

The slash commands (`/sod` and `/eod`) are already configured in this repository at:

- `.claude/commands/sod.md` - Start of day
- `.claude/commands/eod.md` - End of day
- `.claude/commands/update.md` - Update session context
- `.claude/commands/heartbeat.md` - Keep session alive

These will automatically work when you run `claude` from within the `crane-console` directory.

## 4. Usage

### Start a Claude Code session in any repo:

```bash
ccs
```

This will:

1. Show you a list of all repos from your orgs
2. Let you select one
3. Clone it if needed
4. Open Claude Code CLI in that directory

### Within Claude Code, use slash commands:

```bash
/sod    # Start of day - load context and see work queue
/eod    # End of day - create handoff for next session
/update # Update session context
/heartbeat # Keep session alive during long tasks
```

## 5. Verify Setup

Test the setup:

```bash
# Verify env var is set
echo $CRANE_CONTEXT_KEY

# Verify gh CLI works
gh auth status

# Verify jq works
echo '{"test": "value"}' | jq '.test'

# Test ccs command
ccs
```

## Accessing from Terminus (Phone/iPad)

The setup works the same way when accessing via SSH from Terminus:

1. SSH into your Ubuntu server
2. Run `ccs` to select a repo
3. Use slash commands within Claude Code

The terminal-based interface works identically regardless of whether you're accessing directly or via SSH.

## Troubleshooting

**"CRANE_CONTEXT_KEY not set"**

- Add the export line to `~/.bashrc` and run `source ~/.bashrc`

**"gh command not found"**

- Install GitHub CLI using the commands above

**"jq command not found"**

- Run `sudo apt install -y jq`

**SSH session times out**

- Add to `~/.ssh/config` on your client (Terminus):
  ```
  Host your-server
      ServerAliveInterval 60
      ServerAliveCountMax 3
  ```

**Claude Code not found**

- Install Claude Code CLI: https://github.com/anthropics/claude-code
