# AGENTS.md

Instructions for AI agents (Codex CLI) working in this repository.

## Repository

venturecrane/crane-console - shared infrastructure for all Venture Crane ventures.

## Automatic Session Start

When you begin a session, immediately call these MCP tools in order before doing anything else:

1. Call `crane_preflight` (no arguments) - validates environment
2. Call `crane_sos` with `venture: "vc"` - initializes session, shows P0 issues, cadence briefing, active sessions

Do not start any work until both calls succeed. If preflight fails, show the error and stop.

## Development Workflow

See CLAUDE.md for commands, hooks, and CI requirements.

Key commands: `npm run verify` (full check), `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`.

## Enterprise Rules

- All changes go through PRs. Never push directly to main.
- Work only on issues assigned to the current venture context.
- If you detect scope drift (working on a different repo than session context), stop and verify with the user.
- All GitHub issues created this session must target the repo shown in session context.
- When encountering errors, fix root causes - not symptoms.

## Codex Environment

Codex strips `KEY`/`SECRET`/`TOKEN` vars from all subprocess environments (shell commands and MCP servers). The `crane` launcher configures `shell_environment_policy.ignore_default_excludes` and MCP `env_vars` to whitelist the vars agents need.

## MCP Tools Reference

All 14 tools are available via the `crane` MCP server. Call them directly - do not use slash commands.

### Session Lifecycle

| Tool              | Purpose                       | Arguments                                                                            |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `crane_preflight` | Validate environment          | none                                                                                 |
| `crane_sos`       | Initialize session            | `venture` (optional): "vc", "ke", "dfg", "sc"                                        |
| `crane_context`   | Get current session context   | none                                                                                 |
| `crane_handoff`   | Create end-of-session handoff | `summary` (required), `status`: "in_progress"/"blocked"/"done", `issue_number` (opt) |

### Work Management

| Tool             | Purpose                     | Arguments |
| ---------------- | --------------------------- | --------- |
| `crane_status`   | Full GitHub issue breakdown | none      |
| `crane_ventures` | List all ventures           | none      |

### Documentation

| Tool              | Purpose                     | Arguments                                                    |
| ----------------- | --------------------------- | ------------------------------------------------------------ |
| `crane_doc`       | Fetch a specific document   | `scope`: "global" or venture code, `doc_name`: document name |
| `crane_doc_audit` | Audit venture documentation | `venture` (opt), `all` (bool), `fix` (bool)                  |

### Knowledge Store (VCMS)

| Tool          | Purpose              | Arguments                                                                           |
| ------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `crane_note`  | Create/update a note | `action`: "create"/"update", `title`, `content`, `tags[]`, `venture`, `id` (update) |
| `crane_notes` | Search/list notes    | `venture`, `tag`, `q` (text search), `limit`                                        |

### Cadence Engine

| Tool             | Purpose                            | Arguments                                                                         |
| ---------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `crane_schedule` | View/complete recurring activities | `action`: "list"/"complete", `scope`, `name`, `result`, `summary`, `completed_by` |

## Writing Style

- Never use em dashes. Use hyphens in prose, pipes in page title separators.
- All content is produced by AI agents. Own that stance - never apologize for it.

## Reference

See CLAUDE.md for environment variables, QA grades, instruction modules, secrets management, and other reference material.
