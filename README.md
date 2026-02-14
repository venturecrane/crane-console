# Crane Console

**Venture Crane infrastructure console** - Factory tooling for product development at SMDurgan LLC.

## Overview

Crane Console is the central repository for all Venture Crane infrastructure components. It provides the automation, tooling, and workflows that support product development for Durgan Field Guide (DFG), Silicon Crane (SC), and future products.

## Architecture

This repository follows a **monorepo pattern** with Cloudflare Workers:

```
crane-console/
├── workers/
│   ├── crane-classifier/ # GitHub webhook receiver (auto-grades issues)
│   └── crane-context/    # Session & handoff management (SOD/EOD)
├── docs/                 # Documentation
└── .github/              # Templates and workflows
```

## Workers

### crane-classifier

Receives GitHub App webhooks on `issues.opened`, auto-grades with Gemini, and applies `qa:*` labels. Single-purpose, clean design.

**Endpoints:** `/health`, `/webhooks/github`, `/regrade`

### crane-context

Structured session and handoff management for multi-agent workflows. Provides SOD/EOD tracking, heartbeat-based liveness, and typed handoff storage.

**Endpoints:** `/sod`, `/eod`, `/update`, `/heartbeat`, `/active`, `/handoffs`

## New Dev Box Setup

Bootstrap a new development machine with Claude Code and all required credentials.

### Prerequisites

- Node.js 18+
- Bitwarden CLI (`npm install -g @bitwarden/cli`)
- Access to the organization Bitwarden vault

### Setup

```bash
# Login to Bitwarden (first time only)
bw login

# Unlock vault and run bootstrap
export BW_SESSION=$(bw unlock --raw)
curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/setup-dev-box.sh | bash

# Activate and start
source ~/.bashrc  # or ~/.zshrc
cd ~/dev/crane-console && claude
/sod
```

The bootstrap script:

- Installs Claude Code CLI
- Fetches `ANTHROPIC_API_KEY` from Bitwarden (no browser login needed)
- Fetches `CRANE_CONTEXT_KEY` from Bitwarden
- Clones this repository to `~/dev/crane-console`

### Required Bitwarden Items

- **Anthropic API Key** - API key for Claude Code authentication
- **Crane Context Key** (optional) - Key for crane-context worker API

## Development

### Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- GitHub CLI (`gh`) for authentication

### Local Development

```bash
# Run crane-context locally
cd workers/crane-context
npm install && wrangler dev

# Run crane-classifier locally
cd workers/crane-classifier
npm install && wrangler dev
```

### Deployment

```bash
# Deploy crane-context
cd workers/crane-context && wrangler deploy

# Deploy crane-classifier
cd workers/crane-classifier && wrangler deploy
```

## Contributing

See individual worker directories for specific contribution guidelines.

## License

Proprietary - SMDurgan LLC
