# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Repository

venturecrane/crane-console

## Slash Commands

This repo has Claude Code slash commands for workflow automation. Run these from the CLI.

| Command                     | When to Use                 | What It Does                                         |
| --------------------------- | --------------------------- | ---------------------------------------------------- |
| `/sod`                      | Start of session            | Reads handoff, shows ready work, orients you         |
| `/handoff <issue#>`         | PR ready for QA             | Posts handoff comment, updates labels to `status:qa` |
| `/question <issue#> <text>` | Blocked on requirements     | Posts question, adds `needs:pm` label                |
| `/merge <issue#>`           | After `status:verified`     | Merges PR, closes issue, updates to `status:done`    |
| `/eod`                      | End of session              | Prompts for summary, updates handoff file            |
| `/new-venture`              | Setting up a new venture    | Walks through checklist and runs setup script        |
| `/prd-review`               | PRD needs structured review | 6-agent, 3-round PRD review with synthesis           |

### Workflow Triggers

```
Start session     → /sod
Hit a blocker     → /question 123 What should X do when Y?
PR ready          → /handoff 123
QA passed         → /merge 123  (only after status:verified)
End session       → /eod
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

## Enterprise Knowledge Store

The agent dialog is the hub of the enterprise. All enterprise knowledge
flows through CLI conversations and is stored in D1, accessible from any
machine (including Blink Shell on phone).

**MCP tools:**

- `crane_note` — Store knowledge (create or update)
- `crane_notes` — Search/retrieve knowledge

**Trigger phrases** (use `crane_note` when the Captain says these):

- "log:" / "captain's log:" → category: `log`
- "remember:" / "save:" → category: `reference`
- "save contact:" → category: `contact`
- "note:" / "idea:" → category: `idea`
- "governance:" → category: `governance`

**Retrieval** (use `crane_notes` when the Captain asks):

- "what's our..." / "what was..." → search by query
- "show recent log entries" → filter by category
- "KE contacts" → filter by venture + category

**Never auto-save.** Only store notes when the Captain explicitly uses a
trigger phrase or asks to save something. If in doubt, ask before saving.

**Never store in notes:**

- Code, terminal output, implementation details (ephemeral)
- Session handoffs (→ `/eod`)
- Architecture decisions (→ `docs/adr/`)
- Process docs (→ `docs/process/`)
- Actual secrets/API keys (→ Infisical)

### Apple Notes (personal only)

Apple Notes MCP is available on macOS machines for personal content only
(family, recipes, hobbies). All enterprise content goes through
`crane_note` / `crane_notes`.

### Enterprise Context (Executive Summaries)

Each venture has an executive summary in git, synced to D1 for cross-venture
agent access. These are the canonical source of enterprise context.

**Source of truth:** `docs/enterprise/ventures/`

- `smd-enterprise-summary.md` — portfolio overview (scope: global)
- `vc-executive-summary.md` — shared infrastructure (scope: vc)
- `ke-executive-summary.md` — co-parent expense tracking (scope: ke)
- `sc-executive-summary.md` — validation-as-a-service (scope: sc)
- `dfg-executive-summary.md` — auction intelligence (scope: dfg)
- `dc-executive-summary.md` — early-stage venture (scope: dc)

**Distribution:** Git → `upload-doc-to-context-worker.sh` → D1 → `/sod` API → agents

Agents receive enterprise summaries automatically via the existing `/sod` flow.
To update a summary, edit the markdown file and push to main. The GitHub Actions
workflow syncs changes to D1 automatically.

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
