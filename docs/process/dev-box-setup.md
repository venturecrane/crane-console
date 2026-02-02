# Dev Box Setup

**Last Updated:** 2026-02-02
**Status:** Production Ready

---

## Overview

Bootstrap a new development machine with **Claude Code**, **Codex CLI**, and **Gemini CLI** - all with consistent `/sod` and `/eod` commands. Uses Bitwarden for secure secrets distribution - no secrets stored in git.

---

## Prerequisites

Before running the bootstrap script:

1. **Node.js 18+** - Install via package manager or [nodejs.org](https://nodejs.org)
2. **Bitwarden CLI** - `npm install -g @bitwarden/cli`
3. **Bitwarden Account** - Access to the organization vault
4. **GitHub CLI** - `gh auth login` (for MCP integration)

---

## Global Secret Scanning

All dev machines have **enterprise-wide secret scanning** via global git hooks. This applies to ALL repositories, not just crane-console.

### How It Works

A global pre-commit hook runs gitleaks on every commit across all repos:

```
~/.git-hooks/pre-commit  →  gitleaks protect --staged
```

Git is configured to use this global hooks directory:

```bash
git config --global core.hooksPath  # Shows ~/.git-hooks
```

### Setup (New Machines)

```bash
# 1. Install gitleaks
# macOS:
brew install gitleaks

# Ubuntu/Debian:
curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.18.4/gitleaks_8.18.4_linux_x64.tar.gz | sudo tar -xz -C /usr/local/bin gitleaks

# 2. Create global hooks directory
mkdir -p ~/.git-hooks

# 3. Create the hook
cat > ~/.git-hooks/pre-commit << 'EOF'
#!/bin/bash
# Global pre-commit hook - runs gitleaks on all repos

if command -v gitleaks &> /dev/null; then
    gitleaks protect --staged --no-banner
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
        echo "❌ Secrets detected! Commit blocked."
        exit 1
    fi
else
    echo "⚠️  gitleaks not installed - skipping secret scan"
fi
EOF

chmod +x ~/.git-hooks/pre-commit

# 4. Configure git to use global hooks
git config --global core.hooksPath ~/.git-hooks
```

### Machine Status

| Machine | gitleaks | Global Hook |
|---------|----------|-------------|
| machine23 | ✓ 8.30.0 | ✓ Configured |
| smdmbp27 | ✓ 8.18.4 | ✓ Configured |
| smdThink | ✓ 8.18.4 | ✓ Configured |

### Bypass (Emergency Only)

```bash
# Skip hook for a single commit (use sparingly)
git commit --no-verify -m "message"
```

---

## Quick Start

```bash
# Login to Bitwarden (first time only)
bw login

# Unlock vault and run bootstrap
export BW_SESSION=$(bw unlock --raw)
curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/setup-dev-box.sh | bash

# Activate environment
source ~/.bashrc  # or ~/.zshrc on macOS

# Pick your CLI and start
cd ~/dev/crane-console
claude   # or codex, or gemini
/sod
```

---

## What the Bootstrap Script Does

### CLI Installation
| CLI | Package | Purpose |
|-----|---------|---------|
| Claude Code | `@anthropic-ai/claude-code` | Anthropic's coding assistant |
| Codex CLI | `@openai/codex` | OpenAI's coding agent |
| Gemini CLI | `@google/gemini-cli` | Google's Gemini assistant |

### Environment Configuration
- `ANTHROPIC_API_KEY` - Fetched from Bitwarden, enables Claude Code without browser login
- `OPENAI_API_KEY` - Fetched from Bitwarden, enables Codex CLI without browser login
- `GEMINI_API_KEY` - Fetched from Bitwarden, enables Gemini CLI without browser login
- `CRANE_CONTEXT_KEY` - Fetched from Bitwarden, enables crane-context API access
- `GITHUB_MCP_PAT` - Auto-set from `gh auth token`, enables Gemini MCP integration

### Codex Prompts
Creates `/sod` and `/eod` prompts in `~/.codex/prompts/`:
- `sod.md` - Start of Day prompt
- `eod.md` - End of Day prompt

### Claude Code Config
Sets `hasCompletedOnboarding: true` in `~/.claude.json` to skip login prompt when using API key.

### Repository
Clones `crane-console` to `~/dev/crane-console` (or pulls latest if exists).

---

## Required Bitwarden Items

| Item Name | Purpose |
|-----------|---------|
| **Anthropic API Key** | API key for Claude Code (no browser login needed) |
| **OpenAI API Key - Codex** | API key for Codex CLI (no browser login needed) |
| **Gemini API Key - General** | API key for Gemini CLI (no browser login needed) |
| **Crane Context Key** | Key for crane-context worker API |

---

## /sod and /eod by CLI

| CLI | /sod Location | /eod Location |
|-----|---------------|---------------|
| Claude Code | Repo skill (`.claude/commands/`) | Repo skill |
| Codex CLI | `~/.codex/prompts/sod.md` | `~/.codex/prompts/eod.md` |
| Gemini CLI | Repo config (`.gemini/commands/`) | Repo config |

**Key difference:** Claude/Gemini use repo-level config (auto-sync with `git pull`), Codex uses user-level config (created by bootstrap script).

---

## Post-Setup Verification

```bash
# Verify all CLIs installed
claude --version
codex --version
gemini --version

# Verify environment
echo $ANTHROPIC_API_KEY | head -c 20
echo $CRANE_CONTEXT_KEY | head -c 20

# Test each CLI
cd ~/dev/crane-console

# Claude Code
claude
/sod
/exit

# Codex CLI
codex
/sod
/exit

# Gemini CLI
gemini
/sod
# (Ctrl+C to exit)
```

---

## Troubleshooting

### "Bitwarden vault locked" Error

```bash
export BW_SESSION=$(bw unlock --raw)
```

### "Node.js 18+ required" Error

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS (with Homebrew)
brew install node@18
```

### Claude Code Asks for Browser Login

The `hasCompletedOnboarding` flag may not be set:
```bash
jq '.hasCompletedOnboarding = true' ~/.claude.json > /tmp/c.json && mv /tmp/c.json ~/.claude.json
```

### Gemini MCP "Authorization header" Error

Ensure `gh` is authenticated and GITHUB_MCP_PAT is set:
```bash
gh auth login
source ~/.bashrc  # reload to get GITHUB_MCP_PAT
```

### Codex /sod Not Found

Re-run the bootstrap script or manually create:
```bash
mkdir -p ~/.codex/prompts
# Then copy sod.md and eod.md from another machine
```

---

## Adding New Dev Boxes

For each new machine:

1. Install Node.js 18+
2. Run the bootstrap script (handles everything else)
3. Pick your CLI and run `/sod`

No manual secret copying required - Bitwarden handles secure distribution.

---

## Security Notes

- **No secrets in git** - All credentials fetched from Bitwarden at setup time
- **Key rotation** - Update Bitwarden items; re-run bootstrap on affected machines
- **Audit trail** - Bitwarden logs access to credential items
- **Revocation** - Rotate API keys in respective consoles, update Bitwarden

---

## Bitwarden Local API (bw serve)

For scripts that need to access secrets without managing session tokens, set up `bw serve` to run as a background service. This provides a local REST API on port 8087.

### Benefits

- Unlock once per boot, scripts access secrets via localhost API
- No session token management in scripts
- Claude Code scripts can query secrets without re-prompting

### macOS Setup (launchd)

**1. Create the plist file:**

```bash
cat > ~/Library/LaunchAgents/com.bitwarden.serve.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bitwarden.serve</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/bw</string>
        <string>serve</string>
        <string>--port</string>
        <string>8087</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/bw-serve.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/bw-serve-error.log</string>
</dict>
</plist>
EOF
```

**2. Load the service:**

```bash
launchctl load ~/Library/LaunchAgents/com.bitwarden.serve.plist
```

**3. Start manually after unlocking vault:**

```bash
# Unlock vault first
bw unlock

# Start the service
launchctl start com.bitwarden.serve

# Verify it's running
curl -s http://localhost:8087/status
```

### Linux Setup (systemd)

**1. Create the service file:**

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/bw-serve.service << 'EOF'
[Unit]
Description=Bitwarden CLI Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/bw serve --port 8087
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
```

**2. Enable and start:**

```bash
systemctl --user daemon-reload
systemctl --user enable bw-serve

# After unlocking vault:
bw unlock
systemctl --user start bw-serve

# Verify
curl -s http://localhost:8087/status
```

### Using the Local API

**Get an item by name:**

```bash
# Get the session key from unlock
export BW_SESSION=$(bw unlock --raw)

# Query the API
curl -s "http://localhost:8087/object/item/Anthropic%20API%20Key" \
  -H "Authorization: Bearer $BW_SESSION" | jq -r '.data.login.password'
```

**Helper function for shell:**

```bash
# Add to ~/.bashrc or ~/.zshrc
bw_get() {
  local item_name="$1"
  curl -s "http://localhost:8087/object/item/$(echo "$item_name" | jq -sRr @uri)" \
    -H "Authorization: Bearer $BW_SESSION" | jq -r '.data.login.password // .data.notes'
}

# Usage:
# bw_get "Anthropic API Key"
```

### Daily Workflow

1. **Boot machine** - Service starts but vault is locked
2. **Unlock vault** - `bw unlock` and export session
3. **Work normally** - Scripts use localhost API
4. **Lock at EOD** - `bw lock` (optional, auto-locks on sleep/shutdown)

### Troubleshooting

**"Vault is locked" error from API:**
```bash
bw unlock
export BW_SESSION=$(bw unlock --raw)
```

**Service not running:**
```bash
# macOS
launchctl start com.bitwarden.serve

# Linux
systemctl --user start bw-serve
```

**Port already in use:**
```bash
lsof -i :8087
# Kill the existing process or use a different port
```

---

## Agent Browser Setup

Agent-browser is a CLI tool for headless browser automation, used for QA screenshots and visual verification.

### Installation

```bash
# Install globally
npm install -g agent-browser

# Install Playwright chromium browser
npx playwright install chromium
```

### Verification

```bash
# Test with a simple screenshot
agent-browser open https://example.com
agent-browser screenshot /tmp/test.png
ls -la /tmp/test.png
```

### Common Commands

```bash
# Navigate to URL
agent-browser open <url>

# Take screenshot
agent-browser screenshot <path>

# Click element
agent-browser click <selector>

# Type text
agent-browser type <selector> <text>

# Get accessibility snapshot (for AI analysis)
agent-browser snapshot
```

### Troubleshooting

**"Executable doesn't exist" error:**
```bash
npx playwright install chromium
```

**"agent-browser: command not found":**
```bash
# Check npm global bin is in PATH
echo $PATH | tr ':' '\n' | grep npm

# If missing, add to ~/.bashrc or ~/.zshrc:
export PATH="$HOME/.npm-global/bin:$PATH"
```

**Permission denied on npm install -g:**
```bash
# Use sudo (Linux/macOS)
sudo npm install -g agent-browser
```

### Machine Rollout Status

| Machine | Status | Verified |
|---------|--------|----------|
| machine23 | Installed | 2026-02-02 |
| smdmbp27 | Installed | 2026-02-02 |
| smdThink | Installed | 2026-02-02 |

---

## Related Documentation

- **CLI Context Integration:** How all CLIs integrate with crane-context
- **EOD/SOD Process:** Session handoff workflow
- **Team Workflow:** Development process and conventions
