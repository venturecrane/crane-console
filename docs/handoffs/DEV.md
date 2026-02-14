# Dev Handoff

**Last Updated:** 2026-02-14
**Session:** m16 (Claude Opus 4.6)

## Summary

Implemented the D1 prod-to-staging data mirror script (#150). Built a two-phase export/import bash script that mirrors production data into staging databases for both crane-context and crane-classifier workers. Applied missing migrations to the staging crane-context DB (machines, notes tables). Verified idempotent operation across multiple runs.

## Accomplished

- **D1 mirror script shipped** (`3bde710`) — `scripts/mirror-prod-to-staging.sh` mirrors prod D1 data into staging. Two-phase design (export all, then import all), per-statement fallback for rows exceeding D1's 100KB SQL limit, row-count verification after each table import. Closes #150
- **Staging DB migrations applied** — crane-context staging was missing migrations 0009-0011 (machines, notes, drop_note_categories). Applied manually during mirror verification
- **crane-context mirrored** — 362/363 rows across 9 tables (1 VCMS note skipped due to D1 SQLITE_TOOBIG limit on raw SQL export)
- **crane-classifier mirrored** — 202/202 classify_runs rows, clean pass

## In Progress

- **Unstaged changes** — `scripts/cpimg.sh` deletion, `scripts/setup-tmux.sh` edits, and `docs/design/` files are in the working tree but not committed (separate work)

## Blocked

None

## Next Session

- Issue #151 — CI/CD deploy pipeline with staging gate
- Consider D1 REST API approach for the 1 oversized VCMS note that can't mirror via SQL export (parameter binding bypasses TOOBIG limit)
- Founder decisions on PRD unresolved issues — UI-2 (brand kit) blocks VC website development
- Run `/design-brief` against the VC PRD to generate design brief for the website

---

## Quick Reference

| Command                    | When to Use             |
| -------------------------- | ----------------------- |
| `/sod`                     | Start of session        |
| `/handoff <issue>`         | PR ready for QA         |
| `/question <issue> <text>` | Need PM clarification   |
| `/merge <issue>`           | After `status:verified` |
| `/eod`                     | End of session          |

### Fleet Commands

```bash
bash scripts/fleet-health.sh           # Check all machines
bash scripts/machine-health.sh         # Check local machine
bash scripts/deploy-to-fleet.sh ORG REPO  # Deploy repo to fleet
bash scripts/bootstrap-infisical-ua.sh # Set up UA creds (new machine)
```
