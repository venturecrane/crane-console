# Crane Console

**Venture Crane infrastructure console** - Factory tooling for product development at SMDurgan LLC.

## Overview

Crane Console is the central repository for all Venture Crane infrastructure components. It provides the automation, tooling, and workflows that support product development for Durgan Field Guide (DFG), Silicon Crane (SC), and future products.

## Architecture

This repository follows a **monorepo pattern** with Cloudflare Workers:

```
crane-console/
├── workers/
│   ├── crane-context/        # Session, handoff, and MCP tool management
│   ├── crane-watch/          # GitHub and Vercel webhook gateway
│   └── crane-mcp-remote/     # MCP-over-HTTP remote server (OAuth, Durable Objects)
├── packages/
│   ├── crane-contracts/      # Shared validation contracts, agent identity types
│   ├── crane-mcp/            # Local MCP server for dev workflow
│   └── crane-test-harness/   # In-process HTTP test harness for Workers + D1
├── tools/
│   └── hermes/               # Fleet agent (systemd units, fleet_update skill)
├── site/                     # Astro-based documentation site
├── docs/                     # Documentation
└── .github/                  # Templates and workflows
```

## Workers

### crane-context

Structured session and handoff management for multi-agent workflows. Provides SOD/EOD tracking, heartbeat-based liveness, typed handoff storage, notes, deploy heartbeats, fleet health, notifications, and MCP tool endpoints.

**Endpoints:** `/sos`, `/eos`, `/update`, `/heartbeat`, `/active`, `/handoffs`, `/notes`, `/docs`, `/mcp`, and more.

### crane-watch

GitHub and Vercel webhook gateway. Receives GitHub App webhooks for CI/CD event forwarding and deploy heartbeat observation; receives Vercel webhooks for deployment failure notifications.

**Endpoints:** `/health`, `/webhooks/github`, `/webhooks/vercel`

### crane-mcp-remote

Serves the MCP protocol over Streamable HTTP for remote clients (claude.ai, Claude Code via `--transport http`). Authenticates via GitHub OAuth using the venturecrane-github App. Backed by Durable Objects for per-session MCP state.

## Packages

| Package              | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| `crane-contracts`    | Shared validation contracts, agent identity patterns, and types |
| `crane-mcp`          | Local MCP server for the Venture Crane dev workflow             |
| `crane-test-harness` | In-process HTTP test harness for Cloudflare Workers + D1        |

## New Dev Box Setup

Bootstrap a new development machine with Claude Code and all required credentials.

### Prerequisites

- Node.js 22+
- Bitwarden CLI (`npm install -g @bitwarden/cli`)
- Access to the organization Bitwarden vault

### Setup

```bash
# Login to Bitwarden (first time only)
bw login

# Unlock vault and run bootstrap
export BW_SESSION=$(bw unlock --raw)
curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/bootstrap-machine.sh | bash

# Activate and start
source ~/.bashrc  # or ~/.zshrc
cd ~/dev/crane-console && claude
/sos
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

- Node.js 22+
- Wrangler CLI (`npm install -g wrangler`)
- GitHub CLI (`gh`) for authentication

### Local Development

```bash
# Run a worker locally (replace <worker> with crane-context, crane-watch, or crane-mcp-remote)
cd workers/<worker>
npm install && wrangler dev
```

### Deployment

```bash
# Deploy a worker (replace <worker> as above)
cd workers/<worker> && wrangler deploy
```

## Contributing

See individual worker directories for specific contribution guidelines.

## License

Proprietary - SMDurgan LLC
