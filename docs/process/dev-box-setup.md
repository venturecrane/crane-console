# Dev Box Setup

**Last Updated:** 2026-01-27
**Status:** Production Ready

---

## Overview

Bootstrap a new development machine with Claude Code CLI and all required credentials. Uses Bitwarden for secure secrets distribution - no secrets stored in git.

---

## Prerequisites

Before running the bootstrap script:

1. **Node.js 18+** - Install via package manager or [nodejs.org](https://nodejs.org)
2. **Bitwarden CLI** - `npm install -g @bitwarden/cli`
3. **Bitwarden Account** - Access to the organization vault

---

## Quick Start

```bash
# Login to Bitwarden (first time only)
bw login

# Unlock vault and run bootstrap
export BW_SESSION=$(bw unlock --raw)
curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/setup-dev-box.sh | bash

# Activate environment and start
source ~/.bashrc  # or ~/.zshrc on macOS
cd ~/dev/crane-console && claude
/sod
```

---

## What the Bootstrap Script Does

1. **Verifies prerequisites** - Node 18+, Bitwarden CLI, unlocked vault
2. **Installs Claude Code** - `npm install -g @anthropic-ai/claude-code`
3. **Fetches secrets from Bitwarden:**
   - `ANTHROPIC_API_KEY` - Enables Claude Code without browser login
   - `CRANE_CONTEXT_KEY` - Enables access to crane-context API
4. **Configures shell** - Adds exports to `~/.bashrc` or `~/.zshrc`
5. **Clones repository** - `~/dev/crane-console`

---

## Required Bitwarden Items

The bootstrap script expects these items in Bitwarden:

| Item Name | Purpose |
|-----------|---------|
| **Anthropic API Key** | API key for Claude Code authentication (no browser login needed) |
| **Crane Context Key** | Key for crane-context worker API (optional, has fallback) |

---

## Post-Setup Verification

After setup completes:

```bash
# Verify Claude Code works
claude --version

# Verify API key is set
echo $ANTHROPIC_API_KEY | head -c 20

# Verify context key is set
echo $CRANE_CONTEXT_KEY | head -c 20

# Start a session
cd ~/dev/crane-console && claude
/sod
```

---

## Troubleshooting

### "Bitwarden vault locked" Error

```bash
export BW_SESSION=$(bw unlock --raw)
```

### "Node.js 18+ required" Error

Install Node.js 18 or later:
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS (with Homebrew)
brew install node@18
```

### "Bitwarden CLI required" Error

```bash
npm install -g @bitwarden/cli
bw login
```

### Claude Code Still Asks for Browser Login

Check that `ANTHROPIC_API_KEY` is exported:
```bash
source ~/.bashrc  # or ~/.zshrc
echo $ANTHROPIC_API_KEY
```

---

## Adding New Dev Boxes

For each new machine, the setup flow is:

1. Install Node.js 18+
2. Run the bootstrap script (handles everything else)
3. Start working with `/sod`

No manual secret copying required - Bitwarden handles secure distribution.

---

## Security Notes

- **No secrets in git** - All credentials fetched from Bitwarden at setup time
- **Key rotation** - Update Bitwarden items; re-run bootstrap on affected machines
- **Audit trail** - Bitwarden logs access to credential items
- **Revocation** - Rotate API key in Anthropic Console, update Bitwarden

---

## Related Documentation

- **CLI Context Integration:** How Claude Code integrates with crane-context
- **EOD/SOD Process:** Session handoff workflow
- **Team Workflow:** Development process and conventions
