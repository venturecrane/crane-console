# Dev Handoff

**Last Updated:** 2026-02-14
**Session:** m16 (Claude Opus 4.6)

## Summary

Completed ADR 026 Phase 3 — Infisical production environment split. All venture secrets copied to `prod` environment, CLI default changed from `dev` to `prod`, documentation updated. Conducted enterprise readiness audit and logged privacy/ToS issues across all four venture repos.

## Accomplished

- **Infisical prod environment split** (`1367259`) — Copied secrets to prod for `/vc` (10), `/smd` (1). `/ke` (8), `/sc` (1), `/dfg` (7) were already done. `/dc` intentionally empty. Multiline PEM key verified round-trip. ADR 026 marked Phase 1–3 complete.
- **CLI default changed** — `launch-lib.ts` default env `dev` → `prod`, test updated to assert `prod`, 151 tests passing
- **Enterprise readiness audit** — Reviewed all venture executive summaries, open issues, and security posture. Identified KE #112 (JWT validation) as highest-priority security gap.
- **Privacy/ToS issues logged** across all ventures:
  - [ke-console#123](https://github.com/venturecrane/ke-console/issues/123) (P0)
  - [dfg-console#260](https://github.com/venturecrane/dfg-console/issues/260) (P0)
  - [sc-console#43](https://github.com/venturecrane/sc-console/issues/43) (P1)
  - [dc-console#58](https://github.com/venturecrane/dc-console/issues/58) (P1)
  - VC already had crane-console#193 (P1)
- **VC website issues created** — #158–#193 (design + dev issues from design brief), created in earlier session today

## In Progress

- **Unstaged changes** — `scripts/cpimg.sh` deletion, `scripts/setup-tmux.sh` edits still in working tree (pre-existing, separate work)

## Blocked

None

## Next Session

- **KE security fixes** — #112 (JWT issuer/audience validation) and #113 (CSPRNG invite codes) are P0 blockers before any external beta users
- **VC website build-out** — 8 P0 issues (#174–#180, #185) for Phase 0 foundation (repo init, content schemas, design tokens, layout, navigation, article pages, build log pages, CI pipeline)
- **Founder decisions needed** — DA-01 (#158, accent color), DA-02 (#159, Shiki contrast), tagline (#173), DNS migration timing (#171)
- **Weekly plan is stale** — dated 2026-02-02, should be refreshed to reflect vc-web as active priority

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
