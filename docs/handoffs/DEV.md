# Dev Team Handoff

**Last Updated:** 2026-02-13
**Repository:** venturecrane/crane-console

---

## Current State

### In Progress
- **#149** - Staging/production environment strategy — PR #152 open, ready to merge

### Ready to Pick Up
- **#155** - Set GH_PRIVATE_KEY_PEM and GH_WEBHOOK_SECRET on staging workers (needs Captain — GitHub App settings at https://github.com/settings/apps/crane-relay as smdurgan-llc)
- **#150** - D1 prod-to-staging data mirror script (Session 2 of #149)
- **#151** - CI/CD deploy pipeline with staging gate (Session 3 of #149)
- **#81** - Automate venture/org registration for new projects

### Blocked
- **#155** blocked on Captain accessing GitHub App settings page

---

## Session Summary (2026-02-13)

### Accomplished

1. **Implemented staging environment for all 3 Cloudflare Workers** (#149, PR #152)
   - Restructured `wrangler.toml` files: bare `wrangler deploy` = staging (safe default), `--env production` = production
   - Created staging D1 databases: `crane-context-db-staging`, `crane-classifier-db-staging`, `dfg-relay-staging`
   - Created staging R2 bucket: `dfg-relay-evidence-staging`
   - Deleted unused `crane-context-db-local` (hit 10 DB/account limit)
   - Ran all migrations against staging DBs (7 for context, 1 for classifier, 3 for relay)
   - Deployed all 3 staging workers — all healthy
   - Fixed wrangler `[vars]` not inheriting into `[env.production]` — redeclared vars in production env blocks

2. **Set staging secrets**
   - Generated new staging-unique keys (CONTEXT_RELAY_KEY, CLASSIFIER_API_KEY, RELAY_TOKEN, RELAY_SHARED_SECRET)
   - Set shared GEMINI_API_KEY on classifier and relay staging workers
   - Deferred GH_PRIVATE_KEY_PEM + GH_WEBHOOK_SECRET (#155 — PEM not on disk)

3. **Configured Infisical `/vc/staging` path** with staging URLs and keys

4. **Fixed crane-relay D1 ID** — wrangler.toml had stale `7150d46d`, correct ID is `fb2c5649`

5. **Added `deploy:staging` and `deploy:prod` npm scripts** to all 3 workers

6. **Verified everything intact** — all 6 health checks passing (3 prod + 3 staging), dry-run prod deploys target correct bindings, staging DB tables all present

7. **Created follow-up issues**: #150, #151, #155

### Left Off

PR #152 ready to merge. Staging environment fully operational except for 2 GitHub App secrets on staging workers.

### Needs Attention

- **#155**: Captain needs to download PEM + webhook secret from https://github.com/settings/apps/crane-relay (smdurgan-llc account) and run wrangler commands in the issue description

---

## Session Summary (2026-02-05 - Late Evening)

### Accomplished

1. **Fixed keychain detection bug in SSH auth** (`ssh-auth.ts`)
   - `isKeychainLocked()` was checking keychain metadata (always accessible) instead of the credential value
   - Fixed to use `-w` flag — now correctly detects when the OAuth token is unreadable
   - `unlockKeychain()` now targets login keychain explicitly and verifies credential is readable after unlock
   - Result: SSH sessions now prompt for keychain password and launch Claude on **Max plan** (was falling back to API billing)

2. **Deployed keychain fix to entire fleet** (mac23, mbp27, mini, think)

3. **Verified end-to-end**: SSH → mac23 → `crane vc` → keychain unlock prompt → Claude launches on Claude Max

4. **Fixed backspace key in SSH sessions** — added `stty erase '^?'` to mac23 `~/.zshrc` for SSH connections

5. **Explored Chrome extension for Claude Code**
   - Extension already installed on mac23
   - Requires `claude --chrome` or `/chrome` to activate
   - Could not get browser tools loaded mid-session — needs to be active at launch

6. **Test suite**: 101 tests passing (26 ssh-auth tests)

### Left Off

SSH auth is fully working with Max plan auth. Chrome extension needs testing with `claude --chrome` launch flag.

### Needs Attention

- **Chrome extension integration**: Test launching with `crane vc` + `--chrome` flag, or add Chrome support to the crane launcher
- **Codex MCP compatibility** remains unresolved (from prior session)

---

## Next Session Guidance

1. **Merge PR #152** and set the 2 missing staging secrets (#155)
2. **Session 2 (#150)**: Build the D1 prod-to-staging data mirror script
3. **Session 3 (#151)**: Build CI/CD deploy pipeline with staging gate
4. **KE beta readiness**: Weekly plan priority is Kid Expenses — switch to ke-console when staging infra is complete

---

## Quick Reference

| Command | When to Use |
|---------|-------------|
| `/sod` | Start of session |
| `/handoff <issue>` | PR ready for QA |
| `/question <issue> <text>` | Need PM clarification |
| `/merge <issue>` | After `status:verified` |
| `/eod` | End of session |

### Staging vs Production Deploy

```bash
# Staging (safe default)
cd workers/crane-context && npm run deploy        # or: wrangler deploy
cd workers/crane-classifier && npm run deploy
cd workers/crane-relay && npm run deploy

# Production (explicit)
cd workers/crane-context && npm run deploy:prod   # or: wrangler deploy --env production
cd workers/crane-classifier && npm run deploy:prod
cd workers/crane-relay && npm run deploy:prod
```

### Fleet Commands

```bash
bash scripts/fleet-health.sh           # Check all machines
bash scripts/machine-health.sh         # Check local machine
bash scripts/deploy-to-fleet.sh ORG REPO  # Deploy repo to fleet
bash scripts/bootstrap-infisical-ua.sh # Set up UA creds (new machine)
```

### Infisical Quick Reference

```bash
infisical run --path /vc -- claude          # VC secrets (production)
infisical run --path /vc/staging -- claude   # VC secrets (staging)
infisical secrets --path /vc --env dev      # List secrets
infisical secrets set KEY="val" --path /vc  # Add secret
```

---

## Resources

- **crane-mcp:** `crane-console/packages/crane-mcp/`
- **Issue #130:** https://github.com/venturecrane/crane-console/issues/130
- **MCP docs:** https://github.com/modelcontextprotocol/typescript-sdk
