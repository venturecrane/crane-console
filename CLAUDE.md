# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Repository

venturecrane/crane-console

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

## Enterprise Rules

Injected by `crane_sos` at session start. Full reference: `crane_doc('global', 'team-workflow.md')`
Key: All changes through PRs. Never echo secrets. Scope discipline. Never remove features without directive.

## Environment Variables

Injected by `crane` launcher: `CRANE_ENV`, `CRANE_VENTURE_CODE`, `CRANE_VENTURE_NAME`, `CRANE_REPO`, `CRANE_CONTEXT_KEY`, `GH_TOKEN`. Infrastructure: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (when present). Secrets frozen at launch. Details: `crane_doc('global', 'secrets.md')`

## Instruction Modules

Detailed domain instructions stored as on-demand documents.
Fetch the relevant module when working in that domain.

| Module                    | Key Rule (always applies)                                                                                                       | Fetch for details                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `operating-ethos.md`      | Mission first. Execute. Ask if unclear, otherwise move out. No corporate theater.                                               | Captain's standing order, ethos vs. guardrails distinction |
| `secrets.md`              | Verify secret VALUES, not just key existence                                                                                    | Infisical, vault, API keys, GitHub App                     |
| `content-policy.md`       | Never auto-save to VCMS; agents ARE the voice                                                                                   | VCMS tags, storage rules, editorial, style                 |
| `team-workflow.md`        | All changes through PRs; never push to main                                                                                     | Full workflow, QA grades, escalation triggers              |
| `fleet-ops.md`            | Bootstrap phases IN ORDER: Tailscale -> CLI -> bootstrap -> optimize -> mesh                                                    | SSH, machines, Tailscale, macOS                            |
| `creating-issues.md`      | Backlog = GitHub Issues (`gh issue create`), never VCMS notes                                                                   | Templates, labels, target repos                            |
| `pr-workflow.md`          | Push branch, `gh pr create`, assign QA grade - never skip the PR                                                                | Branch naming, commit format, PR template, post-merge QA   |
| `guardrails.md`           | Never deprecate features, drop schema, or change auth without Captain directive                                                 | Protected actions, escalation format, feature manifests    |
| `wireframe-guidelines.md` | Wireframe committed and linked before status:ready (UI stories)                                                                 | Wireframe generation, file conventions, quality bar        |
| `design-system.md`        | Load design spec before wireframe/UI work: `crane_doc('{code}', 'design-spec.md')`                                              | Design tokens, component patterns, venture specs           |
| `tooling.md`              | Reach for the right plugin at the right moment; Context7 before third-party APIs, Semgrep before ship on auth/webhook changes   | Plugin catalog, triggers, anti-patterns, fleet parity      |
| `skills/governance.md`    | Every SKILL.md has full frontmatter (name, description, version, scope, owner, status); new/changed skills pass `/skill-review` | Schema, scopes, lifecycle, review gate, audit, deprecation |

Fetch with: `crane_doc('global', '<module>')` (or read local `docs/skills/governance.md` directly for the skill governance module)

## Architecture Reference

For integration principles, MEMORY.md governance, and related documentation:
`crane_doc('global', 'team-workflow.md')`
