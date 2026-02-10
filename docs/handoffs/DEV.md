# Dev Handoff

**Last Updated:** 2026-02-10
**Session:** mac23 (Claude Opus 4.5)

## Summary

Implemented centralized venture registry (#81). All venture configuration now lives in a single JSON file - adding a new venture requires one config edit plus deploy instead of updating multiple hardcoded lists across TypeScript and Bash files.

## Accomplished

- **Implemented centralized venture registry (#81)**
  - Created `config/ventures.json` as single source of truth for all 6 ventures
  - Updated `workers/crane-context/src/constants.ts` to import from JSON
  - Updated `isValidVenture()` to use centralized VENTURES array
  - Updated bash scripts (`ccs.sh`, `ubuntu-bashrc`, `bootstrap-new-box.sh`) to fetch from API with cache/fallback
  - Created `docs/process/add-new-venture.md` documenting the process
- **Committed:** `ad0fd5a` feat: centralized venture registry (#81)
- **Deployed crane-context** - `/ventures` endpoint returns all 6 ventures from JSON config
- **Closed issue #81**

## In Progress

None

## Blocked

None

## Next Session

- Test adding a new venture end-to-end using the documented process
- Consider wrangler update (3.114.17 → 4.64.0) flagged during deploy

---

## Quick Reference

| Command | When to Use |
|---------|-------------|
| `/sod` | Start of session |
| `/handoff <issue>` | PR ready for QA |
| `/question <issue> <text>` | Need PM clarification |
| `/merge <issue>` | After `status:verified` |
| `/eod` | End of session |

### Fleet Commands

```bash
bash scripts/fleet-health.sh           # Check all machines
bash scripts/machine-health.sh         # Check local machine
bash scripts/deploy-to-fleet.sh ORG REPO  # Deploy repo to fleet
bash scripts/bootstrap-infisical-ua.sh # Set up UA creds (new machine)
```
