# ADR 026: Staging/Production Environment Strategy

**Status:** Accepted (Phase 1–4 complete 2026-02-14)
**Date:** 2026-02-11
**Decision Makers:** Captain

---

## Context

All Crane infrastructure currently deploys to a single production environment:

- 2 Cloudflare Workers (crane-context, crane-classifier) deploy directly to prod
- 2 D1 databases are production-only (preview DBs exist but only for local `wrangler dev`)
- Infisical has a single "dev" environment with no prod counterpart
- Deployments are manual `wrangler deploy` from developer machines
- CI verifies code quality but does not gate or automate deployments

This works for early-stage development but creates risk as ventures mature:

- No way to validate a deployment before it hits production
- Breaking changes affect live agent sessions immediately
- D1 migrations run against production with no prior validation
- No rollback path beyond reverting code and redeploying

---

## Decision

Introduce a two-environment strategy (staging + production) using Cloudflare's native environment support, phased to avoid premature operational overhead.

### Phase 1: Cloudflare Environment Split

Add `[env.production]` blocks to each worker's `wrangler.toml`. The default (no env flag) becomes staging; `--env production` targets prod.

**Per worker, this creates:**

- Separate worker URL for staging (e.g., `crane-context-staging.automation-ab6.workers.dev`)
- Separate D1 database binding per environment
- Same codebase, same migration files, different targets

**Example wrangler.toml structure:**

```toml
name = "crane-context"
compatibility_date = "2024-01-01"

# Default = staging
[[d1_databases]]
binding = "DB"
database_name = "crane-context-db-staging"
database_id = "<staging-db-id>"

[env.production]
[[env.production.d1_databases]]
binding = "DB"
database_name = "crane-context-db-prod"
database_id = "<existing-prod-db-id>"
```

### Phase 2: Automated Deploy Pipeline

Add GitHub Actions deployment workflow:

1. **Merge to main** → auto-deploy all changed workers to staging
2. **Staging validation** → automated smoke tests (HTTP health checks, basic API calls)
3. **Manual promotion** → `workflow_dispatch` or git tag triggers production deploy

```
PR → CI verify → merge → deploy staging → validate → manual promote to prod
```

### Phase 3: Infisical Production Environment

Staging secrets path (`/vc/staging`) was created during Phase 1 with distinct infrastructure keys (CRANE_CONTEXT_KEY, CRANE_ADMIN_KEY) and shared external service secrets (GEMINI_API_KEY, GH_PRIVATE_KEY_PEM, GH_WEBHOOK_SECRET).

A full Infisical `prod` environment has been created as the source of truth for production secrets. All venture paths (`/vc`, `/ke`, `/sc`, `/dfg`, `/smd`) have been populated with production values. The `crane` CLI default environment changed from `dev` to `prod` (`CRANE_ENV` override still available). The `dev` environment is preserved for future staging/development use.

---

## Consequences

### Benefits

- Breaking changes caught in staging before reaching production
- D1 migrations validated against staging databases first
- Deployment history via GitHub Actions (audit trail, rollback via re-run)
- Foundation for future blue-green or canary deploys

### Costs

- 2 additional D1 databases (staging) — free tier covers this
- 2 additional worker deployments — free tier covers this
- Staging data management — need seed data or periodic sync for meaningful testing
- Slightly more complex deploy commands (`--env production` vs default)

### Challenges

**Staging data representativeness:** Empty staging databases don't exercise session/handoff flows meaningfully. Options: (a) seed scripts that populate representative data, (b) periodic snapshot from prod (scrubbed), (c) accept that staging validates deployment mechanics, not data correctness.

**Agent URL configuration:** Resolved in Phase 4. The `CRANE_ENV` toggle now controls both the worker URL agents connect to and the Infisical secrets path used at launch. See Phase 4 below.

**Migration ordering:** D1 migrations are append-only and numbered sequentially. Staging gets migrations first. If a migration breaks staging, it must be fixed before production can receive subsequent migrations. This is a feature, not a bug.

**Solo operator overhead:** Two environments add cognitive load. Mitigated by automating the staging deploy (no manual step) and keeping production promotion as a simple manual trigger.

---

## Alternatives Considered

**Branch-based preview deployments:** Cloudflare supports per-branch deploys for Pages but not natively for Workers. Could use `wrangler deploy --name crane-context-pr-123` but this creates worker sprawl and doesn't cover D1 bindings cleanly. Rejected as over-engineered for current scale.

**Feature flags instead of environments:** Toggle behavior in production rather than deploying to separate environments. Doesn't address the core risk (bad deploys hitting prod) and adds code complexity. Rejected.

**Do nothing:** Continue deploying directly to production with manual verification. Acceptable short-term but accumulates risk as the codebase grows and more ventures depend on shared infrastructure. Rejected as a long-term strategy.

---

## Implementation Scope

### Phase 1 (Environment Split)

- Create 2 staging D1 databases (crane-context-db-staging, crane-classifier-db-staging)
- Update 2 `wrangler.toml` files with `[env.production]` blocks
- Run existing migrations against staging databases
- Update `npm run deploy` scripts to default to staging
- Add `npm run deploy:prod` scripts for production
- Create Infisical `/vc/staging` path with distinct infrastructure keys
- Set secrets on staging workers
- Update deployment docs
- **Completed:** 2026-02-14

### Phase 2 (CI/CD Pipeline)

- Add `deploy.yml` GitHub Actions workflow
- Staging auto-deploy on merge to main
- Production deploy via manual workflow dispatch
- Add basic smoke tests (health endpoint, version check)
- **Completed:** 2026-02-14

### Phase 3 (Infisical Production Environment)

- Created `prod` environment in Infisical with all venture paths
- Copied secrets: `/vc` (10), `/ke` (8), `/sc` (1), `/dfg` (7), `/smd` (1), `/dc` (empty — intentional)
- Changed `crane` CLI default from `dev` to `prod` (via `CRANE_ENV` fallback)
- `/vc/staging` subfolder remains in `dev` only (serves Cloudflare staging workers)
- **Completed:** 2026-02-14

### Phase 4 (CRANE_ENV Agent Toggle)

- Added `packages/crane-mcp/src/lib/config.ts` as central config module
- `CRANE_ENV=dev` makes agents connect to staging worker (`crane-context-staging`)
- `CRANE_ENV=dev` makes the launcher fetch secrets from `dev:/vc/staging` (vc only)
- Non-vc ventures warn and fall back to production secrets when `CRANE_ENV=dev`
- `CraneApi` constructor accepts `apiBase` parameter (no more hardcoded URLs)
- Preflight tool shows environment name (`staging` / `production`)
- Launcher propagates normalized `CRANE_ENV` to agent child process
- Staging secrets (`dev:/vc/staging`) populated with agent-required keys (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, OPENAI_API_KEY)
- **Completed:** 2026-02-14
