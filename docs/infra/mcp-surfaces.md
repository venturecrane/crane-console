# MCP Surfaces

## Overview

Venture Crane runs **three** distinct MCP (Model Context Protocol) surfaces, each scoped to a different consumer and a different set of capabilities. They are intentionally separate; their tool sets do not overlap by accident.

| Surface          | Where                                        | Transport               | Tools                         | Consumer                               | Authentication              |
| ---------------- | -------------------------------------------- | ----------------------- | ----------------------------- | -------------------------------------- | --------------------------- |
| **Hosted**       | `workers/crane-context` (`/mcp` endpoint)    | Streamable HTTP         | 5 session-lifecycle tools     | Claude Code on-machine, Claude Desktop | Static `X-Relay-Key` header |
| **Local stdio**  | `packages/crane-mcp` (npm package)           | stdio subprocess        | ~24 operational tools         | Claude Code on-machine                 | None (local subprocess)     |
| **Remote OAuth** | `workers/crane-mcp-remote` (`/mcp` endpoint) | Streamable HTTP + OAuth | Crane briefing + GitHub tools | claude.ai, Claude Desktop              | GitHub OAuth                |

## Why three surfaces

The architectural cut is **filesystem dependency**, not feature scope.

- **Hosted MCP** serves clients that may run on any machine. Its tools must work without local filesystem access. Session state lives in D1 in the worker, and the worker is the source of truth.
- **Local stdio MCP** serves the on-machine Claude Code subprocess. Its tools manipulate the agent's local files: memory at `~/.claude/projects/<project>/memory/`, fleet JSONL at `~/.claude/projects/*/<UUID>.jsonl`, SSH known_hosts for fleet dispatch, etc. These cannot run hosted because the data lives only on the agent's machine.
- **Remote OAuth MCP** serves cloud sessions (claude.ai, Claude Desktop) that need authenticated access without a static relay key. It's a separate surface because OAuth onboarding is fundamentally different from the static-key model used by Claude Code on-machine.

This boundary is not a backlog item. Memory tools, for example, can never be hosted because the memory files are on the agent's local disk; a hosted endpoint serving multiple machines has no way to read or write them.

## Hosted MCP — the canonical 5

Defined in `workers/crane-context/src/mcp.ts` as the exported `HOSTED_MCP_TOOLS` constant. Any change to this set must update:

1. The `HOSTED_MCP_TOOLS` constant (source of truth)
2. The `TOOL_DEFINITIONS` array (declarations + schemas)
3. The `handleToolsCall` switch (implementation)
4. This document
5. `.github/workflows/parity-mcp-tools-list.yml` (parity assertion)
6. The CI lint at `packages/crane-mcp/src/scripts/check-tool-list-parity.ts`

The drift lint runs in `npm run verify` and blocks the pre-push hook if any of those go out of sync.

| Tool                  | Purpose                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `crane_sos`           | Start of Session — resume or create a session, returns session context + last handoff + docs |
| `crane_eos`           | End of Session — emit handoff and close the session                                          |
| `crane_handoff`       | Append a handoff document mid-session or at EOS                                              |
| `crane_get_doc`       | Fetch a single document from the worker's docs store (`global` or per-venture scope)         |
| `crane_list_sessions` | Query active and recent sessions for a venture/repo                                          |

## Local stdio MCP — operational depth

Defined in `packages/crane-mcp/src/index.ts`. Includes everything that requires local FS access or a long-lived subprocess. Examples (non-exhaustive):

- `crane_memory` (recall, list, save, deprecate) — reads/writes memory files
- `crane_memory_invoked` / `crane_memory_usage` / `crane_memory_audit` — telemetry, audit, deprecation curation
- `crane_skill_invoked` / `crane_skill_usage` / `crane_skill_audit` — skill telemetry/audit
- `crane_schedule` — cadence engine state
- `crane_fleet_dispatch` / `crane_fleet_status` — fleet SSH operations
- `crane_notes` / `crane_note` — VCMS read/write
- `crane_notifications` / `crane_notification_update` — CI/CD alert queue
- `crane_deploy_heartbeat` — deploy pipeline state

Two tools (`crane_sos` and `crane_handoff`) appear in both hosted and local. They are wire-compatible: the local stdio implementation calls the hosted REST endpoints under the hood, so behavior is identical regardless of which surface invoked them.

## Remote OAuth MCP — claude.ai surface

Defined in `workers/crane-mcp-remote`. Wraps a different toolset specifically curated for cloud sessions: Crane briefing, doc fetch, schedule view, plus a set of GitHub tools (`github_*`) that the OAuth flow enables. Configuration lives in `docs/infra/crane-context-mcp-spec.md`.

## Common confusion points

- **"Why isn't `crane_memory` in the hosted MCP?"** — Memory tools manipulate files at `~/.claude/projects/.../memory/MEMORY.md`. A hosted endpoint serving multiple machines cannot read or write per-machine files. Memory operations belong in local stdio.
- **"Why are there two MCP surfaces on Cloudflare Workers?"** — `crane-context` is the static-key relay used by Claude Code on-machine and Claude Desktop. `crane-mcp-remote` is the OAuth relay used by claude.ai. Different auth flows, different tool sets, different operational concerns.
- **"What about parity?"** — Parity is asserted _within_ the hosted surface (the same 5 tools must appear identically across `claude-code`, `codex`, `gemini` user-agent simulations). Parity _between_ hosted and local is not a goal because they intentionally differ.

## Aspirational expansions

If a future need requires a memory operation from a cloud-only runtime (e.g., claude.ai surfacing memories), the right answer is **not** to add `crane_memory` to hosted MCP. The right answer is a server-side memory cache layer that the worker can serve, with a reconciliation protocol against the local source-of-truth files. This is a real feature build, not a one-line addition. Out of scope for the current pipeline; revisit when the need is concrete.

## References

- Source of truth: `workers/crane-context/src/mcp.ts` (`HOSTED_MCP_TOOLS` constant)
- Local stdio registry: `packages/crane-mcp/src/index.ts`
- Remote OAuth: `workers/crane-mcp-remote/src/index.ts`
- Original spec: `docs/infra/crane-context-mcp-spec.md`
- Parity workflow: `.github/workflows/parity-mcp-tools-list.yml`
- Drift lint: `packages/crane-mcp/src/scripts/check-tool-list-parity.ts`
