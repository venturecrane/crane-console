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

## Secrets Management (quick reference)

- `crane vc` / `crane ke` to launch with secrets
- Always verify secret VALUES, not just key existence
- Vault: `infisical secrets --path /vc/vault --env prod`
- Full instructions: `crane_doc('global', 'secrets.md')`

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

Fetch with: `crane_doc('global', '<module>')`

## MEMORY.md Governance

Domain instructions live in the modules above. MEMORY.md is for
cross-cutting learnings only (CSS gotchas, decommissioned items,
debugging discoveries). Before adding domain-specific content to
MEMORY.md, check if it belongs in a module and flag for update.

## Related Documentation

- `docs/infra/secrets-management.md` - Infisical secrets usage
- `docs/infra/machine-inventory.md` - Dev machine inventory
- `docs/design/charter.md` - Design system governance (read before any `area:design` issue)
