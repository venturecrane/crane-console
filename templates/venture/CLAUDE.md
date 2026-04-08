# CLAUDE.md - {Venture Name}

This file provides guidance for Claude Code agents working in this repository.

## About This Repository

{Brief description of the product/venture}

## Session Start

Every session must begin with:

1. Call the `crane_preflight` MCP tool (no arguments)
2. Call the `crane_sos` MCP tool with `venture: "{CODE}"`

This creates a session, loads documentation, and establishes handoff context.

## Enterprise Rules

- **All changes through PRs.** Never push directly to main. Branch, PR, CI, QA, merge.
- **Never echo secret values.** Transcripts persist in ~/.claude/ and are sent to API providers. Pipe from Infisical, never inline.
- **Verify secret VALUES, not just key existence.** Agents have stored descriptions as values before.
- **Never auto-save to VCMS** without explicit Captain approval.
- **Scope discipline.** Discover additional work mid-task - finish current scope, file a new issue.
- **Escalation triggers.** Credential not found in 2 min, same error 3 times, blocked >30 min - stop and escalate.

## Build Commands

```bash
npm install             # Install dependencies
npm run dev             # Local dev server
npm run build           # Production build
npm run test            # Run tests
npm run lint            # Run linter
npm run typecheck       # TypeScript validation
```

## Development Workflow

| Command             | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `npm run verify`    | Full local verification (typecheck + format + lint + test) |
| `npm run format`    | Format all files with Prettier                             |
| `npm run lint`      | Run ESLint on all files                                    |
| `npm run typecheck` | Check TypeScript                                           |
| `npm test`          | Run tests                                                  |

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

## Testing

Tests are organized into two Vitest projects (see `vitest.config.ts`):

| Project   | Location                    | Purpose                                                            |
| --------- | --------------------------- | ------------------------------------------------------------------ |
| `unit`    | `test/*.test.ts`            | Pure-function tests. No DB, no HTTP.                               |
| `harness` | `test/harness/**/*.test.ts` | In-process HTTP + D1 tests via `@venturecrane/crane-test-harness`. |

`npm test` runs both. See `test/harness/README.md` for how to write a
harness test (migrations, worker invoke, etc.). The harness is pre-wired as
a devDependency — no extra install needed.

## Tech Stack

- Framework: {Next.js / React / etc.}
- Hosting: Cloudflare Pages / Workers
- Database: Cloudflare D1
- Language: TypeScript

## Code Patterns

{Document key patterns, conventions, and architectural decisions here}

## Instruction Modules

Detailed domain instructions stored as on-demand documents.
Fetch the relevant module when working in that domain.

| Module              | Key Rule (always applies)                                                    | Fetch for details                             |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `secrets.md`        | Verify secret VALUES, not just key existence                                 | Infisical, vault, API keys, GitHub App        |
| `content-policy.md` | Never auto-save to VCMS; agents ARE the voice                                | VCMS tags, storage rules, editorial, style    |
| `team-workflow.md`  | All changes through PRs; never push to main                                  | Full workflow, QA grades, escalation triggers |
| `fleet-ops.md`      | Bootstrap phases IN ORDER: Tailscale -> CLI -> bootstrap -> optimize -> mesh | SSH, machines, Tailscale, macOS               |

Fetch with: `crane_doc('global', '<module>')`

## Fleet Health

This venture is part of the broader Venture Crane portfolio fleet. Several
operational signals are monitored centrally and surfaced via `/sos`:

- **CI/CD notifications.** Failed workflows on main branch flow into
  `crane_notifications(venture: "{CODE}")`. Auto-resolve happens when a
  subsequent run goes green for the same `match_key` (no manual triage
  required for transient flakes).
- **Deploy heartbeats.** Every tracked workflow on main has a heartbeat
  showing `last_main_commit_at` vs `last_success_at`. If commits stack up
  without a successful deploy beyond the per-venture cold threshold, the
  System Health section in `/sos` raises a P0. Inspect via
  `crane_deploy_heartbeat(venture: "{CODE}")`.
- **Stale signal thresholds.** No main activity 14d → warn. No main
  activity 60d → hard flag (archive or justify). Dependabot PR open >7d →
  warn. >30d → hard flag.
- **Weekly fleet audit.** `bash scripts/fleet-ops-health.sh --ci` runs
  every Monday and writes findings to crane-context's
  `fleet_health_findings` table. Findings auto-resolve when the next
  run no longer detects them.

If you suspect a fleet health signal is wrong (false positive or stale),
do NOT silently ignore — open an issue against `venturecrane/crane-console`
with the exact `crane_deploy_heartbeat` / `crane_notifications` output so
the central monitoring can be tuned.

## Related Documentation

- `docs/api/` - API documentation
- `docs/adr/` - Architecture Decision Records

---

_Update this file as the project evolves. This is the primary context for AI agents._
