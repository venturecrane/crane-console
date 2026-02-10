# AGENTS.md

Instructions for AI agents in this repository.

**Important:** This repo does NOT use slash commands. Do not attempt `/sod`, `/eod`, or any `/` commands — they will fail. Use the MCP tools below instead.

## Automatic Session Start

When you begin a session, immediately call these MCP tools in order before doing anything else:

1. Call the `crane_preflight` MCP tool (no arguments needed)
2. Call the `crane_sod` MCP tool with argument `venture: "vc"`

These replace the `/sod` slash command used by other agents. You must call them at the start of every session.

## MCP Tools Reference

| Tool              | When to Use                     | Arguments                                                                           |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `crane_preflight` | Session start                   | none                                                                                |
| `crane_sod`       | Session start (after preflight) | `venture: "vc"`                                                                     |
| `crane_status`    | Check work queue                | none                                                                                |
| `crane_plan`      | Read weekly plan                | none                                                                                |
| `crane_context`   | Verify current venture/repo     | none                                                                                |
| `crane_ventures`  | List all ventures               | none                                                                                |
| `crane_handoff`   | End of session                  | `summary`, `status` ("in_progress" or "blocked" or "done"), optional `issue_number` |

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
