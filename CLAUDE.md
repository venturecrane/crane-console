# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Repository

venturecrane/crane-console

## Slash Commands

This repo has Claude Code slash commands for workflow automation. Run these from the CLI.

| Command                     | When to Use                 | What It Does                                          |
| --------------------------- | --------------------------- | ----------------------------------------------------- |
| `/sod`                      | Start of session            | Reads handoff, shows ready work, orients you          |
| `/handoff <issue#>`         | PR ready for QA             | Posts handoff comment, updates labels to `status:qa`  |
| `/question <issue#> <text>` | Blocked on requirements     | Posts question, adds `needs:pm` label                 |
| `/merge <issue#>`           | After `status:verified`     | Merges PR, closes issue, updates to `status:done`     |
| `/eod`                      | End of session              | Prompts for summary, updates handoff file             |
| `/new-venture`              | Setting up a new venture    | Walks through checklist and runs setup script         |
| `/critique [N]`             | Sanity-check a plan         | N parallel critics + auto-revise (default: 1 agent)   |
| `/prd-review`               | PRD needs structured review | 6-agent, 3-round PRD review with synthesis            |
| `/design-brief`             | Design brief from PRD       | 4-agent design brief with synthesis                   |
| `/build-log "topic"`        | When something ships        | Drafts a genericized build log entry                  |
| `/edit-log <path>`          | Before publishing a log     | Style + genericization review                         |
| `/sprint <issues>`          | Parallel issue execution    | Wave-planned parallel agents with git worktrees       |
| `/portfolio-review`         | Weekly portfolio review     | Collects signals, reviews statuses, publishes updates |

### Workflow Triggers

```
Start session     → /sod
Hit a blocker     → /question 123 What should X do when Y?
PR ready          → /handoff 123
QA passed         → /merge 123  (only after status:verified)
End session       → /eod
Sanity-check plan → /critique      (or /critique 3 for multi-perspective)
PRD complete      → /design-brief  (requires docs/pm/prd.md)
Ship something     → /build-log "what happened"
Review log draft   → /edit-log <path>
Portfolio review   → /portfolio-review (weekly, collects signals + Captain approval)
Sprint execution   → /sprint 42 45 51  (parallel agents, one wave at a time)
```

### QA Grade Labels

When PM creates an issue, they assign a QA grade. This determines verification requirements:

| Label        | Meaning    | Verification                       |
| ------------ | ---------- | ---------------------------------- |
| `qa-grade:0` | CI-only    | Automated - no human review needed |
| `qa-grade:1` | API/data   | Scriptable checks                  |
| `qa-grade:2` | Functional | Requires app interaction           |
| `qa-grade:3` | Visual/UX  | Requires human judgment            |
| `qa-grade:4` | Security   | Requires specialist review         |

## Secrets Management

Use **Infisical** to inject secrets into your environment. Never hardcode secrets or ask users to paste them.

```bash
# Launch agents with secrets injected
crane vc                                    # Venture Crane
crane ke                                    # Kid Expenses

# Run non-agent commands with secrets injected
infisical run --path /ke -- npm run dev     # Kid Expenses
infisical run --path /sc -- npm run dev     # Silicon Crane
infisical run --path /dfg -- npm run dev    # Durgan Field Guide
```

**Adding secrets:**

```bash
infisical secrets set NEW_KEY="value" --path /vc --env dev
```

**Reading secrets:**

```bash
infisical secrets --path /vc --env dev
```

See `docs/infra/secrets-management.md` for full documentation.

## Enterprise Knowledge Store (VCMS)

The Venture Crane Management System stores agent-relevant enterprise context
in D1, accessible from any machine. VCMS is for content that makes agents
smarter - not general note-taking.

**MCP tools:**

- `crane_note` - Store or update enterprise context
- `crane_notes` - Search/retrieve by tag, venture, or text

**What belongs in VCMS:**

Use `crane_note` when the Captain explicitly asks to store agent-relevant
context. Tag appropriately using the vocabulary below.

| Tag                 | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `executive-summary` | Venture overviews, mission, stage, tech stack |
| `prd`               | Product requirements documents                |
| `design`            | Design briefs                                 |
| `strategy`          | Strategic assessments, founder reflections    |
| `methodology`       | Frameworks, processes (e.g., Crane Way)       |
| `market-research`   | Competitors, market analysis                  |
| `bio`               | Founder/team bios                             |
| `marketing`         | Service descriptions, positioning             |
| `governance`        | Legal, tax, compliance                        |

New tags can be added without code changes.

**Never auto-save.** Only store notes when the Captain explicitly asks
to save something. If in doubt, ask before saving.

**Never store in VCMS:**

- Code, terminal output, implementation details (ephemeral)
- Session handoffs (→ `/eod`)
- Architecture decisions (→ `docs/adr/`)
- Process docs (→ `docs/process/`)
- Actual secrets/API keys (→ Infisical)
- Personal content (→ Apple Notes)

### Apple Notes (personal only)

Apple Notes MCP is available on macOS machines for personal content only
(family, recipes, hobbies). All enterprise content goes through
`crane_note` / `crane_notes`.

### Enterprise Context (Executive Summaries)

Executive summaries are stored in VCMS notes tagged `executive-summary`.
Agents receive them automatically via the `/sod` flow.

**Source of truth:** VCMS notes with tag `executive-summary`

- SMD Enterprise Summary (scope: global)
- VC Executive Summary (scope: vc)
- KE Executive Summary (scope: ke)
- SC Executive Summary (scope: sc)
- DFG Executive Summary (scope: dfg)
- DC Executive Summary (scope: dc)

To update a summary, use `crane_note` with action `update` and the note ID.

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

## Related Documentation

- `docs/infra/secrets-management.md` - Infisical secrets usage
- `docs/infra/machine-inventory.md` - Dev machine inventory
- `docs/design/charter.md` - Design system governance (read before any `area:design` issue)
