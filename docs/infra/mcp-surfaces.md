# MCP Surfaces

## Overview

Venture Crane runs **one** MCP (Model Context Protocol) surface.

| Surface         | Where                              | Transport        | Tools                | Consumer                        | Authentication          |
| --------------- | ---------------------------------- | ---------------- | -------------------- | ------------------------------- | ----------------------- |
| **Local stdio** | `packages/crane-mcp` (npm package) | stdio subprocess | 30 operational tools | Claude Code, Gemini, Codex CLIs | None (local subprocess) |

Every CLI agent gets the same server. The launcher writes a stdio entry — `command: 'crane-mcp'` —
for each runtime it configures (`packages/crane-mcp/src/cli/launch-lib/mcp-setup-agents.ts`). There
is no HTTP MCP transport in the enterprise.

The server reaches shared state by calling the `crane-context` worker's **REST** endpoints
(`/sos`, `/eos`, `/sessions/prior`, `/ventures`, `/notifications`, `/work-day`, `/skills`,
`/docs/…`). `crane-context` is a REST worker; it does not speak MCP.

## Why one surface

The tools need local filesystem access. Memory lives at `~/.claude/projects/<project>/memory/`,
fleet transcripts at `~/.claude/projects/*/<UUID>.jsonl`, SSH known_hosts for fleet dispatch. A
hosted endpoint serving many machines cannot read or write per-machine files, so hosting the tool
surface was never possible for the operations that matter.

Cloud clients are served differently now. **claude.ai Remote Control** spawns a live Claude Code
session on a real machine and drives it from the web or mobile app, which gives a cloud client the
full local tool surface instead of a reduced hosted copy of it. See
`docs/runbooks/claude-ai-remote-control.md`.

## What was retired, and why

Two cloud-facing surfaces were removed on 2026-07-29. Both were built before Remote Control existed,
and both measured at zero real usage over the preceding 30 days.

| Retired surface  | Was                                                | Evidence at removal                                                                           |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Remote OAuth** | `workers/crane-mcp-remote`, GitHub OAuth, 23 tools | 28 requests / 30d, **0 subrequests**, **0 Durable Object invocations** — no session ever ran. |
| **Hosted**       | `crane-context` `POST /mcp`, static key, 5 tools   | No CLI agent called it; all runtimes use the local stdio binary. Only traffic was a CI probe. |

Meanwhile every session in `crane-context-db-prod` since 2026-04-01 carries `client='crane-mcp'` —
the local stdio server. That was already the only surface doing work.

Removal PR: `chore(mcp): retire the cloud MCP surfaces`. Historical design records are kept:
`docs/infra/crane-context-mcp-spec.md` carries a superseded banner rather than being deleted.

## If a cloud runtime needs crane state

Reach for Remote Control first — it is the supported path and needs no new infrastructure.

Do **not** re-add a hosted tool endpoint to `crane-context`. If a genuine need appears that Remote
Control cannot serve, the honest design is a server-side cache layer with a reconciliation protocol
against the local source-of-truth files. That is a real feature build, not a route registration.
Revisit when the need is concrete, not before.

## References

- Local stdio registry: `packages/crane-mcp/src/index.ts`
- Launcher MCP setup: `packages/crane-mcp/src/cli/launch-lib/mcp-setup-agents.ts`
- Remote Control: `docs/runbooks/claude-ai-remote-control.md`
- Server architecture: `docs/process/mcp-server-architecture.md`
- Superseded hosted-endpoint spec: `docs/infra/crane-context-mcp-spec.md`
