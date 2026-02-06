# Dev Team Handoff

**Last Updated:** 2026-02-05
**Repository:** venturecrane/crane-console

---

## Current State

### In Progress
None

### Ready to Pick Up
- **#81** - Automate venture/org registration for new projects

### Blocked
None

---

## Session Summary (2026-02-05 - Evening)

### Accomplished

1. **Fixed SSH authentication for Infisical + Claude Code**
   - Problem: SSH sessions lock macOS Keychain, breaking both Infisical (login token) and Claude Code (OAuth token)
   - Solution: Two-part fix in the crane launcher — Infisical uses Machine Identity (Universal Auth) instead of keychain; Claude Code prompts keychain unlock

2. **Created `ssh-auth.ts` module** (`packages/crane-mcp/src/cli/ssh-auth.ts`)
   - `isSSHSession()` — detects SSH via env vars
   - `readUACredentials()` — reads `~/.infisical-ua` (KEY=VALUE, chmod 600)
   - `loginWithUniversalAuth()` — gets JWT token via UA login
   - `isKeychainLocked()` / `unlockKeychain()` — macOS keychain handling
   - `prepareSSHAuth()` — orchestrator returning env vars or abort message

3. **Modified `launch.ts`** to integrate SSH auth
   - Calls `prepareSSHAuth()` before launch
   - Passes `INFISICAL_TOKEN` via env (not CLI flag, avoids `ps` leaks)
   - Adds `--projectId` for token-based auth (required since `.infisical.json` isn't read)

4. **Created `bootstrap-infisical-ua.sh`** for one-time-per-machine setup

5. **Set up Infisical Machine Identity**
   - Created `crane-fleet` identity in Infisical web UI
   - Universal Auth method, TTL 2592000 (30 days)
   - Developer access to `venture-crane` project
   - Client ID: `1d0f0679-e199-48c2-b9b0-bbafb5c3c4ff`

6. **Bootstrapped entire fleet** — `~/.infisical-ua` deployed and verified on all 4 machines (mac23, mbp27, mini, think)

7. **Verified end-to-end** — SSH from mbp27 → mac23 → `crane vc` launched Claude with 8 secrets injected via Universal Auth

8. **24 new unit tests** for ssh-auth module, all passing (99 total)

### Left Off

SSH auth fix is fully deployed and tested. All machines bootstrapped.

### Needs Attention

- **Codex MCP compatibility** remains unresolved (from prior session)

---

## Session Summary (2026-02-05)

### Accomplished

1. **Implemented Fleet Maintenance — Prevent Config Drift plan**
   - Root cause: configs that should travel with git were gitignored, requiring manual per-machine setup that drifted

2. **Workstream A: Committed configs to git**
   - Added 7 `mcp__crane__*` permissions to `.claude/settings.json`
   - Removed `.infisical.json` from `.gitignore`, now tracked
   - Committed `.infisical.json` in 4 other venture repos (ke, sc, dfg, smd)

3. **Workstream B: Fixed health checks**
   - Fixed crane-mcp double-count bug in `machine-health.sh` (two blocks could both increment FAILURES)
   - Added Infisical CLI check to `machine-health.sh`
   - Fixed `fleet-health.sh` to exit 2 on WARNs (was silently exiting 0)

4. **Deployed all 5 repos to fleet** (mbp27, mini, think)
   - Fixed GitHub SSH host key issue on mbp27
   - Fixed git pull conflicts from untracked `.infisical.json` on all machines

5. **Cleaned up stale config files**
   - Deleted `.claude/settings.local.json` from all 5 repos on all 4 machines (20 files)

6. **Set missing API keys on mini and think**
   - Added OPENAI_API_KEY, GEMINI_API_KEY to both
   - Added CRANE_ADMIN_KEY to think

7. **Final result: All 4 machines passing health checks (EXIT=0)**

### Left Off

Fleet is clean. All config drift issues resolved. `git pull` now delivers correct configs.

### Needs Attention

- **Codex MCP compatibility:** Codex cannot use crane-mcp (no MCP protocol support). If parity needed, consider creating shell script wrappers that hit crane-context API directly via curl.

---

## Session Summary (2026-02-03 - Evening)

### Accomplished

1. **Designed and implemented crane-mcp** - A complete MCP server to replace the fragile shell-based `ccs` process
   - Problem: Shell scripts were fragile, required sourcing, hardcoded paths, could get deep into wrong repo
   - Solution: MCP server that runs inside Claude, scans ~/dev/ by git remote, API-driven venture list

2. **Created 4 MCP tools:**
   - `crane_sod` - Start of day, validates context, guides to correct repo
   - `crane_ventures` - List ventures with local paths
   - `crane_context` - Get current venture/repo/branch
   - `crane_handoff` - Create session handoff

3. **Technical implementation:**
   - Built with TypeScript + @modelcontextprotocol/sdk
   - Org-based repo matching (not path naming conventions)
   - In-memory caching for session duration
   - Sanitized error messages

4. **Pushed to GitHub:** https://github.com/venturecrane/crane-mcp (private) — *now consolidated into `crane-console/packages/crane-mcp/`*

5. **Created issue #130** with full documentation for continuity

6. **Registered MCP server:** `claude mcp add --scope user crane -- crane-mcp`

---

## Session Summary (2026-02-03 - Earlier)

### Accomplished
- Evaluated secrets management solutions (Doppler vs Infisical)
- Chose Infisical (open source, generous free tier, self-host option)
- Installed Infisical CLI on all 4 dev machines
- Set up folder-based secrets organization in single `venture-crane` project
- Migrated secrets from Bitwarden to Infisical
- Created `docs/infra/machine-inventory.md` and `docs/infra/secrets-management.md`
- Updated CLAUDE.md with Infisical usage section

---

## Next Session Guidance

1. **Fleet is healthy and SSH-capable** — focus on feature work, not infrastructure

2. **If Codex parity needed:**
   - Create shell script wrappers (e.g., `crane-status.sh`) that call crane-context API via curl
   - Fix Codex sandbox env access for `CRANE_CONTEXT_KEY` and `gh` auth

3. **Ready work:** Issue #81 (automate venture/org registration)

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

### Infisical Quick Reference

```bash
infisical run --path /vc -- claude          # VC secrets
infisical run --path /ke -- npm run dev     # KE secrets
infisical secrets --path /vc --env dev      # List secrets
infisical secrets set KEY="val" --path /vc  # Add secret
```

---

## Resources

- **crane-mcp:** `crane-console/packages/crane-mcp/`
- **Issue #130:** https://github.com/venturecrane/crane-console/issues/130
- **MCP docs:** https://github.com/modelcontextprotocol/typescript-sdk
