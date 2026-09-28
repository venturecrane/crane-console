---
sidebar:
  order: 0
---

# Venture Crane

**Tagline:** AI-native venture studio infrastructure

## What It Is

Venture Crane is the operating system for {{company:name}}'s product portfolio. It provides session management, context persistence, secrets distribution, fleet orchestration, and agent tooling so that AI-powered development agents can work effectively across multiple ventures and machines.

## The Problem It Solves

Solo-founder multi-agent development creates unique challenges: agents lose context between sessions, work overlaps across machines, secrets management is fragile, and there's no institutional memory. Without centralized infrastructure, every session starts from scratch.

## Key Components

| Component         | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| **crane-context** | Session management, handoffs, doc caching, VCMS notes (D1 API)             |
| **crane-watch**   | GitHub webhook receiver - auto-classifies issues with QA grades via Gemini |
| **crane-mcp**     | MCP server - bridges Claude Code to the Context API                        |
| **crane CLI**     | Launcher that injects Infisical secrets into agent sessions                |
| **crane-command** | Enterprise documentation site (this site)                                  |

## Tech Stack

Cloudflare Workers (TypeScript, Hono), D1 (SQLite), MCP

## Development Model

All roles run through Claude Code CLI. Dev agents handle implementation and PRs. PM-function work (requirements, QA, issue triage) is handled by agents with appropriate skills and prompts. The human founder (Captain) provides routing, approvals, and kill decisions. GitHub is the single source of truth.

## Fleet

5 macOS/Linux machines connected via Tailscale mesh, orchestrated from mac23. See Infrastructure > Machine Inventory for details.

## Revenue Model

| Stream                        | Type        | Status |
| ----------------------------- | ----------- | ------ |
| Internal platform             | Cost center | Active |
| Shared infrastructure savings | Amortized   | Active |

## Current Stage

**Operating.** Venture Crane is live infrastructure, not a product in development. It evolves continuously to support the portfolio but does not have a "launch" - it launched when the first agent ran `/sos`.

## Operator Model

### Captain's Domain

- Session routing decisions (which venture, which machine, which agent type)
- Kill/go decisions on infrastructure changes that affect all ventures
- PR approval for core components (crane-context API, MCP server, CLI launcher)
- Escalation triage when the fleet degrades

### Agent Execution

- Implementation and PRs for all crane components
- Fleet health monitoring via cadence skills
- CI/CD pipeline maintenance
- Documentation sync via doc-sync pipeline
- Notification triage and issue classification (crane-watch)

### The System

The franchise prototype is the crane toolchain itself. A new Captain stepping into Venture Crane picks up a running enterprise: session lifecycle, context persistence, secrets management, fleet orchestration, and agent tooling are all documented and running. The Captain directs; agents execute; infrastructure persists across machines and sessions.

## Constraints

- **Never break `/sos`.** If agents can't initialize sessions, all ventures stop.
- **Never store secrets in VCMS or D1.** All secrets go through Infisical.
- **Backwards compatibility matters.** Multiple machines and agents depend on the APIs.

## Recent Activity

<!-- docs-refresh:activity-shipped -->

- #1218 fleet guardrail distribution + fix dead GitHub token injection _(2026-08-19)_
- #1221 /auto-build establishes the reachability contract before it plans _(2026-08-20)_
- #1168 /wired reachability contract, enterprise scope _(2026-07-29)_
- #1198 /debug — run a bug to ground instead of guessing _(2026-08-12)_
- #1165 'either' injection gate — captain approval is sovereign (#1164) _(2026-07-27)_
<!-- /docs-refresh:activity-shipped -->
