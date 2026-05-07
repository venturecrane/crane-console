# AGENTS.md

Instructions for AI agents (Codex CLI) working in this repository.

## Repository

venturecrane/crane-console - shared infrastructure for all Venture Crane ventures.

## Automatic Session Start

When you begin a session, immediately do these in order before any work:

1. Call `crane_preflight` (no arguments) - validates environment.
2. Call `crane_sos` with `venture: "vc"` - initializes session, shows P0 issues, cadence briefing, active sessions.
3. Read `CLAUDE.md` at the repo root - canonical Instruction Modules table (coding standards, guardrails, secrets, tooling, PR workflow, etc.).
4. Read `docs/instructions/coding-standards.md` before editing any TypeScript or JavaScript.

Do not start any work until preflight + sos succeed and CLAUDE.md is loaded. If preflight fails, show the error and stop.

## Coding Standards

All code edits MUST follow `docs/instructions/coding-standards.md` - the portable Venture Crane coding standard. Key directives that apply on every change:

- Parse external inputs with Zod; never `as` cast at trust boundaries.
- No floating Promises; explicitly `await` or attach a `.catch`.
- No module-level state in Cloudflare Workers (per-isolate state leaks across requests).
- File/function ceilings: 500 lines/file, 75 lines/function, complexity 15, depth 4, params 5.
- No default exports outside framework-required positions (Astro pages, Next.js App Router files, Workers entry).
- See `docs/instructions/coding-standards.md` for the full 12 directives with good/bad examples and per-stack notes.

Mechanical enforcement: `npm run lint` runs the rule set defined in `eslint.config.js`. Several ventures (vc-web, ss-console) inline the rule set; the shared package `@venturecrane/eslint-config` is also published. Either path, lint and CI fail on violations.

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

CLAUDE.md (loaded at session start per step 3 above) contains the full Instruction Modules table and reference material covering environment variables, QA grades, secrets management, git authority, and per-domain runbooks. Fetch any module on demand via `crane_doc('global', '<module>')`.
