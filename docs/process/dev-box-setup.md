# Dev Box Setup

**Last Updated:** 2026-01-27
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

## Related Documentation

- **CLI Context Integration:** How all CLIs integrate with crane-context
- **EOD/SOD Process:** Session handoff workflow
- **Team Workflow:** Development process and conventions
