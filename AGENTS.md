# AGENTS.md

Instructions for AI agents without native slash commands (Codex CLI, etc.).
Agents with slash command support (Claude Code, Gemini CLI) should use their own instruction files.

## Session Workflow

This repo uses crane MCP tools for session management. Call them directly instead of slash commands.

### Start of Session

Call these MCP tools in order:

1. `crane_preflight` — validates environment (CRANE_CONTEXT_KEY, gh auth, git repo)
2. `crane_sod` with `venture: "vc"` — creates session, shows P0 issues, weekly plan, last handoff

### During Session

- `crane_status` — full GitHub issue breakdown (P0, ready, in-progress, blocked, triage)
- `crane_plan` — read weekly plan from docs/planning/WEEKLY_PLAN.md
- `crane_context` — current venture, repo, branch, session validation
- `crane_ventures` — list all ventures with repos and install status

### End of Session

- `crane_handoff` with `summary`, `status` ("in_progress" | "blocked" | "done"), and optional `issue_number`

## Repository

venturecrane/crane-console — shared infrastructure for all Venture Crane ventures.

## Build Commands

```bash
cd packages/crane-mcp
npm install && npm run build    # Build MCP server
npm link                        # Make crane-mcp available globally
npm test                        # Run tests
```

## Secrets

Secrets are injected via Infisical (already in your environment if launched via `crane`).
Never hardcode secrets. Use `infisical secrets --path /vc --env dev` to read them.
