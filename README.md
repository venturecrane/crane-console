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

Bootstrap a new development machine with Claude Code and all required credentials. The full disaster-recovery walkthrough is in [`docs/company/disaster-recovery.md`](docs/company/disaster-recovery.md); the summary below is the happy path.

### Prerequisites

- Node.js 22+
- Access to the Infisical project (`venture-crane`, path `/vc`)

### Setup

```bash
# Run the bootstrap script (installs Homebrew, Infisical CLI, Claude Code, etc.)
curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/bootstrap-machine.sh | bash

# Activate and authenticate
source ~/.bashrc  # or ~/.zshrc
infisical login   # browser OAuth, token stored in macOS Keychain
claude login      # browser OAuth
gh auth login     # browser OAuth

# Start a session
cd ~/dev/crane-console && crane vc
/sos
```

The bootstrap script:

- Installs Homebrew, Node, Tailscale, Infisical CLI, `gh`, `jq`
- Installs Claude Code CLI
- Clones this repository to `~/dev/crane-console`
- Writes `.infisical.json` so the launcher knows which project + path to use

All secrets are fetched from Infisical at session-launch time by the `crane` launcher — there is no static credential to copy into the new machine.

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
