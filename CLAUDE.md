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

### Git Authority

Branch class determines which git operations are pre-authorized. Capture `SESSION_START_SHA = $(git rev-parse HEAD)` at session start.

- **Protected** (`main`, `release/*`) — always escalate force-push, reset, merge-into.
- **Owned feature** — `git log "origin/$BRANCH" --not "$SESSION_START_SHA"` returns empty (no commits arrived from remote since session start). Pre-authorized: `git push --force-with-lease`, local `git reset --hard origin/<branch>`, `git merge origin/main` into branch, `git rebase origin/main`.
- **Shared feature** — the test above returned non-empty (another session pushed since you started). Ask once before force-pushing.

Hard-blocks regardless of class: bare `--force` (always use `--with-lease`), force-push to `main`, `reset --hard` against uncommitted changes, `branch -D` against unmerged work, rewriting published commits on protected branches.

Common false-pauses (these are NORMAL git — do not pause): `git merge origin/main` on a feature branch (opposite direction of merging-into-main), `git pull --rebase origin main`, `gh pr merge --admin` (server-side merge, not a force-push).

Full reference: `crane_doc('global', 'git-guardrails.md')`

## Environment Variables

Injected by `crane` launcher: `CRANE_ENV`, `CRANE_VENTURE_CODE`, `CRANE_VENTURE_NAME`, `CRANE_REPO`, `CRANE_CONTEXT_KEY`, `GH_TOKEN`. Infrastructure: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (when present). Secrets frozen at launch. Details: `crane_doc('global', 'secrets.md')`

MCP tool families: `crane_memory` / `crane_memory_invoked` / `crane_memory_audit` — enterprise memory layer (save, recall, audit lessons/anti-patterns). See `crane_doc('global', 'memory/governance.md')`.

## Instruction Modules

Detailed domain instructions stored as on-demand documents.
Fetch the relevant module when working in that domain.

| Module                    | Key Rule (always applies)                                                                                                                         | Fetch for details                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `operating-ethos.md`      | Mission first. Execute. Ask if unclear, otherwise move out. No corporate theater.                                                                 | Captain's standing order, ethos vs. guardrails distinction                |
| `secrets.md`              | Use `crane_secret_check` for presence, `infisical run -- <cmd>` for use; never `infisical secrets` (leaks values). Hook-enforced.                 | Infisical, vault, API keys, GitHub App, hook architecture                 |
| `content-policy.md`       | Never auto-save to VCMS; agents ARE the voice                                                                                                     | VCMS tags, storage rules, editorial, style                                |
| `team-workflow.md`        | All changes through PRs; never push to main                                                                                                       | Full workflow, QA grades, escalation triggers                             |
| `fleet-ops.md`            | Bootstrap phases IN ORDER: Tailscale -> CLI -> bootstrap -> optimize -> mesh                                                                      | SSH, machines, Tailscale, macOS                                           |
| `creating-issues.md`      | Backlog = GitHub Issues (`gh issue create`), never VCMS notes                                                                                     | Templates, labels, target repos                                           |
| `pr-workflow.md`          | Push branch, `gh pr create`, assign QA grade - never skip the PR                                                                                  | Branch naming, commit format, PR template, post-merge QA                  |
| `guardrails.md`           | Never deprecate features, drop schema, or change auth without Captain directive                                                                   | Protected actions, escalation format, feature manifests                   |
| `git-guardrails.md`       | Force-push pre-authorized only on owned feature branches (mechanical test); always escalate on protected; ask once on shared                      | Branch classes, mechanical test, pre-authorized ops, hard-blocks          |
| `memory/governance.md`    | Every memory has full frontmatter; captain_approved gates SOS injection; auto-audit promotes/deprecates; stale >180d or zero-cited in 90d retires | `crane_doc('global', 'memory/governance.md')` (or read local directly)    |
| `wireframe-guidelines.md` | Wireframe committed and linked before status:ready (UI stories)                                                                                   | Wireframe generation, file conventions, quality bar                       |
| `design-system.md`        | Load design spec before wireframe/UI work: `crane_doc('{code}', 'design-spec.md')`                                                                | Design tokens, component patterns, venture specs                          |
| `claude-design.md`        | claude.ai/design is org-scoped and default-off for Enterprise; no API/MCP yet; link subdirectories, not monorepos                                 | Per-venture link paths, handoff-to-Claude-Code flow, setup runbook        |
| `tooling.md`              | Reach for the right plugin at the right moment; Context7 before third-party APIs, Semgrep before ship on auth/webhook changes                     | Plugin catalog, triggers, anti-patterns, fleet parity                     |
| `skills/governance.md`    | Every SKILL.md has full frontmatter (name, description, version, scope, owner, status); new/changed skills pass `/skill-review`                   | Schema, scopes, lifecycle, review gate, audit, deprecation                |
| `coding-standards.md`     | Parse external inputs (never cast); no floating Promises; no module-level state in Workers; 500/75/15 file/function/complexity ceilings           | Portable TypeScript directives, agent-context arithmetic, per-stack notes |

Fetch with: `crane_doc('global', '<module>')` (or read local `docs/skills/governance.md` directly for the skill governance module)

## Architecture Reference

For integration principles, MEMORY.md governance, and related documentation:
`crane_doc('global', 'team-workflow.md')`
