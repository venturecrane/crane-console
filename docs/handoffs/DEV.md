# Dev Handoff

**Last Updated:** 2026-02-14
**Session:** m16 (Claude Opus 4.6)

## Summary

Implemented CRANE_ENV toggle (ADR 026 Phase 4) so agents can target staging workers and staging secrets via `CRANE_ENV=dev`. Created a central config module, refactored CraneApi to accept apiBase, updated all 10 MCP tool consumers, added 14 new config tests (173 total passing), and updated documentation.

## Accomplished

- **CRANE_ENV toggle** — `a03ca22`. New `config.ts` module centralizes environment-aware config, replacing 3 hardcoded production URLs. `CRANE_ENV=dev` routes agents to `crane-context-staging` worker and fetches secrets from `dev:/vc/staging`. Non-vc ventures warn and fall back to production.
- **CraneApi refactor** — Constructor now accepts `apiBase` parameter. All 10 tool files updated to pass `getApiBase()`.
- **Infisical staging secrets** — Added CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, OPENAI_API_KEY to `dev:/vc/staging` so agent sessions have a complete environment.
- **Preflight environment display** — Shows "Connected (staging)" or "Connected (production)" in output.
- **Test coverage** — 14 new config tests, updated crane-api, launch, and preflight test suites. 173 tests all passing.
- **Documentation** — Updated ADR 026 (Phase 4 section), secrets-management.md (staging secrets table, CRANE_ENV usage).

## In Progress

- **Unstaged changes** — `scripts/cpimg.sh` deletion, `scripts/setup-tmux.sh` edits still in working tree (pre-existing).

## Blocked

- None

## Next Session

- **Smoke test staging end-to-end** — Run `CRANE_ENV=dev crane vc` and verify preflight shows staging, sod connects to staging worker.
- **Execute revised vc-web sprint plan** — Reprioritize GitHub issues, add missing issues, begin Phase 1 build.
- **Clean up unstaged scripts changes** — Decide whether to commit or discard cpimg.sh deletion and setup-tmux.sh edits.

---

## Quick Reference

| Command                    | When to Use             |
| -------------------------- | ----------------------- |
| `/sod`                     | Start of session        |
| `/critique [N]`            | Sanity-check a plan     |
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
