# Venture Crane — Executive Summary

## Mission

Build and operate a disciplined product factory that validates business ideas quickly, kills failures fast, and scales winners profitably.

## What Venture Crane Is

Venture Crane is the **operating system** for SMDurgan, LLC's product portfolio. It provides:

1. **Shared infrastructure** — APIs, workers, databases, and tooling that all ventures consume
2. **Development methodology** — The Business Validation Machine framework for venture lifecycle management
3. **Multi-agent orchestration** — Tooling for Claude Code agents to collaborate across ventures and machines

Venture Crane is NOT a product itself, not a services company, and not a holding company. It is the factory that builds and operates the products.

## Key Components

| Component     | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| crane-relay   | GitHub integration API for multi-agent workflows            |
| crane-context | Session management, handoffs, doc caching (D1-backed)       |
| crane-command | Command center web dashboard                                |
| crane-mcp     | MCP server for Claude Code integration                      |
| crane CLI     | Launcher that injects Infisical secrets into agent sessions |

## Tech Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** D1 (SQLite) for sessions, handoffs, checkpoints, doc cache
- **Config:** `config/ventures.json` — single source of truth for venture registry
- **Secrets:** Infisical at path `/vc`

## Repository

`venturecrane/crane-console` — monorepo containing all VC infrastructure:

- `workers/crane-context/` — Context worker (D1 API)
- `workers/crane-relay/` — GitHub relay worker
- `packages/crane-mcp/` — MCP server package
- `scripts/` — Operational scripts (upload, cache, bootstrap)
- `docs/` — All documentation (process, infra, enterprise, planning)
- `config/` — Shared configuration

## Current Focus

Process standardization, documentation self-healing, and reliable enterprise context distribution across the fleet.
