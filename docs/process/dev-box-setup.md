# Dev Box Setup

**Last Updated:** 2026-02-02
**Status:** Production Ready

---

## Overview

Bootstrap a new development machine with **Claude Code** and **Gemini CLI** - all with consistent `/sos` and `/eos` commands. Uses Infisical for secure secrets management via the `crane` launcher - no secrets stored in git.

---

## Prerequisites

Before running the bootstrap script:

1. **Node.js 18+** - Install via package manager or [nodejs.org](https://nodejs.org)
2. **Infisical CLI** - Install from [infisical.com/docs/cli](https://infisical.com/docs/cli/overview)
3. **Infisical Access** - Machine identity or login credentials
4. **GitHub CLI** - `gh auth login` (for MCP integration)
5. **crane CLI** - Installed from crane-console repo

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

| Machine | gitleaks | Global Hook  |
| ------- | -------- | ------------ |
| mac23   | ✓ 8.30.0 | ✓ Configured |
| mbp27   | ✓ 8.18.4 | ✓ Configured |
| think   | ✓ 8.18.4 | ✓ Configured |

### Bypass (Emergency Only)

```bash
# Skip hook for a single commit (use sparingly)
git commit --no-verify -m "message"
```

---

## Quick Start

```bash
# Clone crane-console and install
git clone https://github.com/venturecrane/crane-console.git ~/dev/crane-console
cd ~/dev/crane-console
npm install

# Launch with secrets injected
crane vc   # or crane ke, crane dfg

# Inside the session:
/sos
```

---

## What the Bootstrap Script Does

### CLI Installation

| CLI         | Package                     | Purpose                      |
| ----------- | --------------------------- | ---------------------------- |
| Claude Code | `@anthropic-ai/claude-code` | Anthropic's coding assistant |
| Gemini CLI  | `@google/gemini-cli`        | Google's Gemini assistant    |

### Environment Configuration

The `crane` launcher injects secrets from Infisical at launch time:

- `ANTHROPIC_API_KEY` - Enables Claude Code without browser login
- `GEMINI_API_KEY` - Enables Gemini CLI without browser login
- `CRANE_CONTEXT_KEY` - Enables crane-context API access
- `GH_TOKEN` - GitHub PAT for `gh` CLI and MCP integration

See `docs/infra/secrets-management.md` for full Infisical details.

### Claude Code Config

Sets `hasCompletedOnboarding: true` in `~/.claude.json` to skip login prompt when using API key.

### Repository

Clones `crane-console` to `~/dev/crane-console` (or pulls latest if exists).

---

## MCP Server Setup

The `crane` launcher auto-configures MCP servers. The following are available in agent sessions:

### crane-context MCP

Provides session management, handoffs, and documentation access:

- `crane_sos` / `crane_handoff` - Start of day / handoff management
- `crane_doc` - Fetch instruction modules and venture docs
- `crane_notes` / `crane_note` - Operational notes
- `crane_schedule` / `crane_ventures` - Schedule and venture info

### Apple Notes MCP

Provides read/write access to Apple Notes for operational logging:

- `list_notes` / `read_note` / `create_note` / `update_note`
- Used for Captain-facing summaries and persistent notes

### Configuration

MCP servers are configured in `.claude/settings.json` at the repo level. The `crane` launcher passes required environment variables (`CRANE_CONTEXT_KEY`, `GH_TOKEN`, etc.) to each server.

---

## /sos and /eos by CLI

| CLI         | /sos Location                     | /eos Location |
| ----------- | --------------------------------- | ------------- |
| Claude Code | Repo skill (`.claude/commands/`)  | Repo skill    |
| Gemini CLI  | Repo config (`.gemini/commands/`) | Repo config   |

Both CLIs use repo-level config that auto-syncs with `git pull`.

---

## Post-Setup Verification

```bash
# Verify CLIs installed
claude --version
gemini --version

# Launch with secrets and verify
crane vc

# Inside the session:
/sos
# Should complete successfully with session context
/exit
```

---

## Troubleshooting

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

---

## Adding New Dev Boxes

For each new machine:

1. Install Node.js 18+
2. Install Infisical CLI and `crane`
3. Clone crane-console
4. Run `crane vc` and `/sos` to verify

No manual secret copying required - Infisical handles secure distribution via the `crane` launcher.

---

## Security Notes

- **No secrets in git** - All credentials managed via Infisical and injected at launch
- **Key rotation** - Update Infisical secrets; restart active crane sessions
- **Audit trail** - Infisical logs all access to secrets
- **Revocation** - Rotate API keys in respective consoles, update Infisical

---

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

| Machine | Status    | Verified   |
| ------- | --------- | ---------- |
| mac23   | Installed | 2026-02-02 |
| mbp27   | Installed | 2026-02-02 |
| think   | Installed | 2026-02-02 |

---

## Related Documentation

- **CLI Context Integration:** How all CLIs integrate with crane-context
- **EOD/SOD Process:** Session handoff workflow
- **Team Workflow:** Development process and conventions
