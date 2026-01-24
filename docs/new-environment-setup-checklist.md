# New Environment Setup Checklist

**Purpose:** Set up a new development environment (Mac, Ubuntu, or other) for vc/dfg/sc console projects.

**Time Estimate:** 30-60 minutes for clean setup

---

## Prerequisites

- [ ] Machine has terminal access
- [ ] Internet connection available
- [ ] Admin/sudo access (if needed)

---

## 1. Core Tools Installation

### Git
```bash
# Ubuntu
sudo apt update && sudo apt install -y git

# Mac (if not installed)
xcode-select --install
```

Verify: `git --version`

### Node.js & npm
```bash
# Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Mac (using Homebrew)
brew install node@20
```

Verify: `node --version && npm --version`

### GitHub CLI
```bash
# Ubuntu
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install -y gh

# Mac
brew install gh
```

Verify: `gh --version`

Authenticate: `gh auth login` (follow prompts, use HTTPS)

### jq (JSON processor)
```bash
# Ubuntu
sudo apt install -y jq

# Mac
brew install jq
```

Verify: `jq --version`

---

## 2. Cloudflare Wrangler

### Install Wrangler
```bash
npm install -g wrangler@latest
```

Verify: `wrangler --version` (should be 4.x)

### Authenticate Wrangler

**Option 1: OAuth (Recommended for interactive)**
```bash
wrangler login
```

**Option 2: API Token (Required for headless/Ubuntu)**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create or edit token with permissions:
   - Workers Scripts: Edit
   - Workers KV Storage: Edit
   - Workers R2 Storage: Edit
   - D1: Read + Write
3. Export token:
```bash
export CLOUDFLARE_API_TOKEN="your-token-here"

# Add to ~/.bashrc or ~/.zshrc
echo 'export CLOUDFLARE_API_TOKEN="your-token-here"' >> ~/.bashrc
```

Verify: `wrangler whoami`

---

## 3. Environment Variables

### Required Variables

Add these to `~/.bashrc` (Ubuntu) or `~/.zshrc` (Mac):

```bash
# Crane Context API Key (get from team lead or secure storage)
export CRANE_CONTEXT_KEY="your-64-char-key-here"

# Crane Admin Key (for uploading docs to crane-context)
export CRANE_ADMIN_KEY="your-64-char-admin-key-here"

# Cloudflare API Token (from step 2 above)
export CLOUDFLARE_API_TOKEN="your-token-here"

# Claude CLI detection (auto-set by Claude Code)
# export CLAUDE_CLI_VERSION="x.x.x"  # No action needed
```

### Apply Changes
```bash
source ~/.bashrc  # Ubuntu
source ~/.zshrc   # Mac
```

### Verify
```bash
echo "CRANE_CONTEXT_KEY length: ${#CRANE_CONTEXT_KEY}"  # Should be 64
echo "CRANE_ADMIN_KEY length: ${#CRANE_ADMIN_KEY}"  # Should be 64
echo "CLOUDFLARE_API_TOKEN length: ${#CLOUDFLARE_API_TOKEN}"  # Should be ~40
```

---

## 4. Repository Setup

### Create Development Directory
```bash
mkdir -p ~/dev
cd ~/dev
```

### Clone Repositories
```bash
# Clone all three console repos
gh repo clone venturecrane/crane-console
gh repo clone durganfieldguide/dfg-console
gh repo clone siliconcrane/sc-console

# Verify
ls -la ~/dev/
```

### Install Dependencies (if needed)
```bash
cd ~/dev/crane-console
# Only if project has package.json at root level
# npm install
```

---

## 5. Claude Code CLI Permissions

### User-Level Settings (CRITICAL)

Create `~/.claude/settings.json` to eliminate permission prompts:

```bash
cat > ~/.claude/settings.json <<'EOF'
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
EOF
```

**Why this matters:** Without this, Claude Code will prompt for approval on every command, interrupting flow.

### Verify Project Settings

Each repo should already have `.claude/settings.json` with permissions. Check:

```bash
cat ~/dev/crane-console/.claude/settings.json
cat ~/dev/dfg-console/.claude/settings.json
cat ~/dev/sc-console/.claude/settings.json
```

Should all show `permissions.allow` with tool list.

### Remove Local Overrides (if any)

```bash
rm -f ~/dev/crane-console/.claude/settings.local.json
rm -f ~/dev/dfg-console/.claude/settings.local.json
rm -f ~/dev/sc-console/.claude/settings.local.json
```

---

## 6. Bash Configuration

### Add Repository Switching Function

Add to `~/.bashrc` (Ubuntu) or `~/.zshrc` (Mac):

```bash
# Console Switching (ccs) function
ccs() {
  local all_repos=(
    "$HOME/dev/crane-console"
    "$HOME/dev/dfg-console"
    "$HOME/dev/sc-console"
  )

  echo "Available repositories:"
  for i in "${!all_repos[@]}"; do
    echo "$((i + 1)). ${all_repos[i]}"
  done

  read -p "Select repository (1-${#all_repos[@]}): " selection

  if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#all_repos[@]}" ]; then
    local selected_repo="${all_repos[$((selection - 1))]}"
    cd "$selected_repo" || return 1
    echo "Switched to: $selected_repo"
  else
    echo "Invalid selection"
    return 1
  fi
}
```

### Apply Changes
```bash
source ~/.bashrc  # Ubuntu
source ~/.zshrc   # Mac
```

### Test
```bash
ccs
# Select option 1, 2, or 3
pwd  # Verify you're in the right repo
```

---

## 7. Validation Tests

### Test 1: Session Management
```bash
cd ~/dev/crane-console
bash scripts/sod-universal.sh
```

**Expected Output:**
- Session created with ID
- Documentation cached (10 docs)
- GitHub issues displayed
- No errors

### Test 2: Worker Deployment (Example: crane-context)
```bash
cd ~/dev/crane-console/workers/crane-context
npx wrangler deploy
```

**Expected Output:**
- Build succeeds
- Deployment completes
- Worker URL displayed

### Test 3: D1 Database Access
```bash
cd ~/dev/crane-console/workers/crane-context
npx wrangler d1 execute crane-context --remote --command "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1"
```

**Expected Output:**
- Connection succeeds
- Query returns table name
- No authorization errors

### Test 4: R2 Bucket Access
```bash
npx wrangler r2 bucket list
```

**Expected Output:**
- List of buckets displayed
- No authorization errors

### Test 5: Git Operations
```bash
cd ~/dev/crane-console
git status
git log --oneline -5
```

**Expected Output:**
- Status shows clean or known changes
- Recent commits displayed
- No errors

### Test 6: Permission-Free Operations
```bash
cd ~/dev/crane-console

# All of these should run WITHOUT permission prompts:
git status
npm list --depth=0
curl -I https://crane-context.automation-ab6.workers.dev/health
cat README.md | head -5
```

**Expected:** No "Allow?" prompts appear

---

## 8. Optional: Claude Code CLI Installation

If Claude Code CLI isn't already installed:

**Mac:**
```bash
brew install claude-code
```

**Ubuntu:**
```bash
# Follow instructions at https://code.claude.com/docs/en/installation
```

Verify: `claude --version`

---

## 9. Post-Setup Verification

Run this comprehensive check:

```bash
#!/bin/bash
echo "=== Environment Verification ==="
echo ""

echo "✓ Git: $(git --version)"
echo "✓ Node: $(node --version)"
echo "✓ npm: $(npm --version)"
echo "✓ gh: $(gh --version | head -1)"
echo "✓ jq: $(jq --version)"
echo "✓ wrangler: $(wrangler --version)"
echo ""

echo "=== Environment Variables ==="
[ -n "$CRANE_CONTEXT_KEY" ] && echo "✓ CRANE_CONTEXT_KEY: Set (${#CRANE_CONTEXT_KEY} chars)" || echo "✗ CRANE_CONTEXT_KEY: NOT SET"
[ -n "$CRANE_ADMIN_KEY" ] && echo "✓ CRANE_ADMIN_KEY: Set (${#CRANE_ADMIN_KEY} chars)" || echo "✗ CRANE_ADMIN_KEY: NOT SET"
[ -n "$CLOUDFLARE_API_TOKEN" ] && echo "✓ CLOUDFLARE_API_TOKEN: Set (${#CLOUDFLARE_API_TOKEN} chars)" || echo "✗ CLOUDFLARE_API_TOKEN: NOT SET"
echo ""

echo "=== Repositories ==="
[ -d ~/dev/crane-console ] && echo "✓ crane-console" || echo "✗ crane-console: NOT CLONED"
[ -d ~/dev/dfg-console ] && echo "✓ dfg-console" || echo "✗ dfg-console: NOT CLONED"
[ -d ~/dev/sc-console ] && echo "✓ sc-console" || echo "✗ sc-console: NOT CLONED"
echo ""

echo "=== Claude Code Permissions ==="
[ -f ~/.claude/settings.json ] && echo "✓ User-level settings exist" || echo "✗ User-level settings: MISSING"
[ -f ~/dev/crane-console/.claude/settings.json ] && echo "✓ crane-console settings exist" || echo "✗ crane-console settings: MISSING"
echo ""

echo "=== Bash Functions ==="
type ccs &>/dev/null && echo "✓ ccs function available" || echo "✗ ccs function: NOT DEFINED"
echo ""

echo "=== Tests ==="
echo -n "Testing wrangler auth... "
wrangler whoami &>/dev/null && echo "✓" || echo "✗"
echo -n "Testing gh auth... "
gh auth status &>/dev/null && echo "✓" || echo "✗"
echo ""

echo "Setup verification complete!"
```

Save as `~/verify-setup.sh`, run: `bash ~/verify-setup.sh`

---

## Common Issues & Solutions

### Issue: Permission prompts still appearing

**Cause:** Local settings overriding user settings

**Solution:**
```bash
# Remove local overrides
rm -f ~/dev/*/. claude/settings.local.json

# Verify user settings exist
cat ~/.claude/settings.json
```

### Issue: CRANE_CONTEXT_KEY not working

**Cause:** Key not exported to environment

**Solution:**
```bash
# Check if set
echo $CRANE_CONTEXT_KEY

# Re-add to shell config
echo 'export CRANE_CONTEXT_KEY="your-key"' >> ~/.bashrc
source ~/.bashrc
```

### Issue: Wrangler authentication failing

**Cause:** Token missing D1 or R2 permissions

**Solution:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Edit token
3. Add: D1 Read, D1 Write, Workers R2 Storage
4. Save and re-test

### Issue: ccs function not found

**Cause:** Not sourced or not in shell config

**Solution:**
```bash
# Check if defined
type ccs

# Re-source config
source ~/.bashrc  # or ~/.zshrc

# If still missing, re-add function (see step 6)
```

---

## Quick Reference

### Daily Workflow Commands
```bash
# Switch repositories
ccs

# Start of day
cd ~/dev/crane-console
/sod

# End of day
/eod

# Deploy worker
cd ~/dev/[repo]/workers/[worker-name]
npx wrangler deploy

# Check deployment
npx wrangler tail
```

### Useful Aliases (Optional)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
alias cc='cd ~/dev/crane-console'
alias dcc='cd ~/dev/dfg-console'
alias scc='cd ~/dev/sc-console'
alias gst='git status'
alias glog='git log --oneline -10'
alias wrdev='npx wrangler dev'
alias wrdeploy='npx wrangler deploy'
```

---

## Success Criteria

Your environment is ready when:

- [x] All validation tests pass
- [x] No permission prompts when running commands
- [x] Can switch between repos with `ccs`
- [x] Can deploy workers successfully
- [x] Can access D1 and R2 from command line
- [x] `/sod` loads session context
- [x] Git operations work without prompts

---

## Next Steps After Setup

1. Run `/sod` in crane-console to see current work
2. Check GitHub issues for ready tasks
3. Review last handoff for context
4. Start working on P0 issues

---

**Last Updated:** 2026-01-21
**Validated On:** Mac (macOS), Ubuntu Server 24.04
**Maintainer:** Development Team
