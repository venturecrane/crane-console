# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Repository

venturecrane/crane-console


## Slash Commands

This repo has Claude Code slash commands for workflow automation. Run these from the CLI.

| Command | When to Use | What It Does |
|---------|-------------|--------------|
| `/sod` | Start of session | Reads handoff, shows ready work, orients you |
| `/handoff <issue#>` | PR ready for QA | Posts handoff comment, updates labels to `status:qa` |
| `/question <issue#> <text>` | Blocked on requirements | Posts question, adds `needs:pm` label |
| `/merge <issue#>` | After `status:verified` | Merges PR, closes issue, updates to `status:done` |
| `/eod` | End of session | Prompts for summary, updates handoff file |

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

| Label | Meaning | Verification |
|-------|---------|--------------|
| `qa-grade:0` | CI-only | Automated - no human review needed |
| `qa-grade:1` | API/data | Scriptable checks |
| `qa-grade:2` | Functional | Requires app interaction |
| `qa-grade:3` | Visual/UX | Requires human judgment |
| `qa-grade:4` | Security | Requires specialist review |

## Secrets Management

Use **Infisical** to inject secrets into your environment. Never hardcode secrets or ask users to paste them.

```bash
# Run commands with secrets injected
infisical run --path /vc -- claude          # Venture Crane
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

## Related Documentation

- `docs/infra/secrets-management.md` - Infisical secrets usage
- `docs/infra/machine-inventory.md` - Dev machine inventory

