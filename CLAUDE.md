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

## Apple Notes

Claude Code has MCP access to Apple Notes on macOS machines (mac23, mba).
The MCP server (`mcp-apple-notes` via npx) provides full CRUD via JXA:
`list_notes`, `search_notes`, `read_note`, `create_note`, `update_note`,
`delete_note`, `move_note`, `list_folders`.

To write to a specific folder (e.g., Captain's Log): call `list_folders`
to get the folder ID, then `create_note` + `move_note`.

**Reading:** Read from Notes when the Captain asks for reference data,
strategic context, or wants to review existing notes.

**Writing:** Create or update notes ONLY when the Captain explicitly says
"save this to Notes", "create a note", or similar direct instruction.

**Never:**

- Auto-create notes during /sod or /eod
- Generate session summaries or handoff notes in Apple Notes
- Dump code, terminal output, specs, or conversation transcripts into Notes
- Create, move, or delete notes without explicit instruction
- Create new folders without explicit instruction

**The boundary:** If content relates to a codebase, implementation, or
development process, it goes in git. Apple Notes is for strategic thinking,
reference data, and ideas captured away from the desk.

### Goes in git (NOT Apple Notes)

- Session handoffs → `docs/handoffs/DEV.md`
- Architecture decisions → `docs/adr/`
- Weekly plans → `docs/planning/WEEKLY_PLAN.md`
- Process docs → `docs/process/`
- Technical specs, research → `docs/`
- Sprint planning, task context → GitHub Issues
- Code snippets, debugging output → nowhere (ephemeral)

### Goes in Apple Notes (NOT git)

- Founder strategic thinking → SMDurgan, LLC / Captain's Log
- Reference data (account numbers, contacts, configs) → Accounts / Business Info
- Ideas captured on phone → Notes (default folder)
- Venture positioning, brand voice, messaging → SMDurgan, LLC / {venture}
- Cross-venture strategic decisions → SMDurgan, LLC / Captain's Log
- Business contacts, vendors, partners → SMDurgan, LLC / Contacts
- Entity docs (tax, legal, LLC) → SMDurgan, LLC / Governance
- Personal content (recipes, hobbies, family) → personal folders

### Enterprise Context (Executive Summaries)

Each venture has a fact-verified executive summary in Apple Notes under its
venture folder within SMDurgan, LLC. These are the canonical source of
enterprise context for cross-venture consumption.

- `SMDurgan, LLC / "SMDurgan, LLC — Enterprise Summary"` — portfolio overview
- `Venture Crane / "VC — Executive Summary"` — shared infrastructure
- `Kid Expenses / "KE — Executive Summary"` — co-parent expense tracking
- `Silicon Crane / "SC — Executive Summary"` — validation-as-a-service
- `Durgan Field Guide / "DFG — Executive Summary"` — auction intelligence

To read enterprise context, use the Apple Notes MCP tools to fetch these notes.

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
