# GEMINI.md

Instructions for Gemini CLI when working in this repository.

## Repository

venturecrane/crane-console - shared infrastructure for all Venture Crane ventures.

## Automatic Session Start

When you begin a session, immediately call these MCP tools in order before doing anything else:

1. Call `crane_preflight` (no arguments) - validates environment
2. Call `crane_sod` with `venture: "vc"` - initializes session, shows P0 issues, weekly plan, active sessions

Do not start any work until both calls succeed. If preflight fails, show the error and stop.

## Development Workflow

### Commands

| Command             | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `npm run verify`    | Full local verification (typecheck + format + lint + test) |
| `npm run format`    | Format all files with Prettier                             |
| `npm run lint`      | Run ESLint on all files                                    |
| `npm run typecheck` | Check TypeScript in all packages and workers               |
| `npm test`          | Run tests (crane-mcp)                                      |

### Pre-commit Hooks

Automatically run on staged files:

- Prettier formatting
- ESLint fixes

### Pre-push Hooks

Full verification runs before push:

- TypeScript compilation check
- Prettier format check
- ESLint check
- Test suite

### CI Must Pass

- Never merge with red CI
- Fix root cause, not symptoms
- Run `npm run verify` locally before pushing

## Environment Variables

When launched via `crane`, the following environment variables are available:

### Identity

| Variable             | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `CRANE_ENV`          | Environment (`prod` or `dev`)                 |
| `CRANE_VENTURE_CODE` | Active venture code (`vc`, `ke`, `dfg`, etc.) |
| `CRANE_VENTURE_NAME` | Human-readable venture name                   |
| `CRANE_REPO`         | Target repository                             |

### Auth

| Variable            | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `CRANE_CONTEXT_KEY` | API key for Crane Context API                                            |
| `GH_TOKEN`          | GitHub PAT - `gh` CLI uses this automatically, no `gh auth login` needed |

### Infrastructure (when present)

| Variable                | Purpose               |
| ----------------------- | --------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API access |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

**Notes:**

- Secrets are frozen at launch time. If a secret rotates mid-session, restart the agent.
- Codex strips `KEY`/`SECRET`/`TOKEN` vars from MCP subprocess environments only - the main agent process is unaffected.
- `gh` CLI uses `GH_TOKEN` automatically - no interactive `gh auth login` needed.

## Secrets Management

- Secrets are injected via Infisical (already in your environment if launched via `crane`)
- Always verify secret VALUES, not just key existence
- Never hardcode secrets
- Vault: `infisical secrets --path /vc/vault --env prod`
- Full instructions: call `crane_doc` with `scope: "global"`, `doc_name: "secrets.md"`

## QA Grade Labels

When PM creates an issue, they assign a QA grade. This determines verification requirements:

| Label        | Meaning    | Verification                       |
| ------------ | ---------- | ---------------------------------- |
| `qa-grade:0` | CI-only    | Automated - no human review needed |
| `qa-grade:1` | API/data   | Scriptable checks                  |
| `qa-grade:2` | Functional | Requires app interaction           |
| `qa-grade:3` | Visual/UX  | Requires human judgment            |
| `qa-grade:4` | Security   | Requires specialist review         |

## Instruction Modules

Detailed domain instructions stored as on-demand documents.
Fetch the relevant module when working in that domain.

| Module              | Key Rule (always applies)                                                    | Fetch for details                          |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `secrets.md`        | Verify secret VALUES, not just key existence                                 | Infisical, vault, API keys, GitHub App     |
| `content-policy.md` | Never auto-save to VCMS; agents ARE the voice                                | VCMS tags, storage rules, editorial, style |
| `fleet-ops.md`      | Bootstrap phases IN ORDER: Tailscale -> CLI -> bootstrap -> optimize -> mesh | SSH, machines, Tailscale, macOS            |

Fetch with: `crane_doc` MCP tool, `scope: "global"`, `doc_name: "<module>"`

## MCP Tools Reference

All 14 tools are available via the `crane` MCP server.

### Session Lifecycle

| Tool              | Purpose                       | Arguments                                                                            |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `crane_preflight` | Validate environment          | none                                                                                 |
| `crane_sod`       | Initialize session            | `venture` (optional): "vc", "ke", "dfg", "sc"                                        |
| `crane_context`   | Get current session context   | none                                                                                 |
| `crane_handoff`   | Create end-of-session handoff | `summary` (required), `status`: "in_progress"/"blocked"/"done", `issue_number` (opt) |

### Work Management

| Tool             | Purpose                     | Arguments |
| ---------------- | --------------------------- | --------- |
| `crane_status`   | Full GitHub issue breakdown | none      |
| `crane_plan`     | Read weekly plan            | none      |
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

## Enterprise Rules

- All changes go through PRs. Never push directly to main.
- Work only on issues assigned to the current venture context.
- If you detect scope drift (working on a different repo than session context), stop and verify with the user.
- All GitHub issues created this session must target the repo shown in session context.
- When encountering errors, fix root causes - not symptoms.

## Conflict Resolution

When git merge conflicts occur:

1. Stop and show the conflicted sections
2. Ask which version to keep
3. Edit the file directly to resolve - remove conflict markers, keep the specified code
4. Do not write scripts to reconstruct files

## Writing Style

- Never use em dashes. Use hyphens in prose, pipes in page title separators.
- All content is produced by AI agents. Own that stance - never apologize for it.

## General Rules

- Ask before taking multi-step destructive actions
- If a simple approach fails twice, stop and ask for guidance
- Do not invent complex workarounds - escalate instead

## Related Documentation

- `docs/infra/secrets-management.md` - Infisical secrets usage
- `docs/infra/machine-inventory.md` - Dev machine inventory
- `docs/design/charter.md` - Design system governance (read before any `area:design` issue)
