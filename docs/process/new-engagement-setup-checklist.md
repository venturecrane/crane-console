# SS Engagement Setup Checklist

**Purpose:** One-time prerequisites for SS client/engagement wiring, plus the per-engagement runbook driven by `/new-engagement` and `scripts/setup-new-engagement.sh`.

## One-Time Prerequisites (Captain action, manual)

These must be in place before any `/new-client` or `/new-engagement` invocation will work end-to-end. Items 1-3 are GitHub side; 4 is Infisical; 5 is Cloudflare worker secrets.

### 1. `smdservices-clients` GitHub organization

- Create at https://github.com/organizations/new
- Owner: smdurgan-llc personal account (matches the `venturecrane-github` App ownership pattern — keeps audit logs separate from `venturecrane/` portfolio repos)
- All client engagement repos live here as `smdservices-clients/<client>-<engagement>` (private)

### 2. `smdservices-platform` GitHub App

A separate App from `venturecrane-github` (App ID 2619905). Rationale: privacy non-negotiable. A compromised PEM should not span venture infrastructure AND client code.

- Create at https://github.com/settings/apps/new
  - Owner: smdurgan-llc personal account
  - Name: `smdservices-platform`
  - Permissions (minimum):
    - Contents: Read & write
    - Metadata: Read
    - Pull requests: Read & write
    - Issues: Read & write
  - Webhook: not required for v1
- Install on `smdservices-clients` org only
- Note the installation ID
- Generate a PEM key, store in Infisical at `/ss/SMDSERVICES_PLATFORM_PEM`
- Store the App ID in Infisical at `/ss/SMDSERVICES_PLATFORM_APP_ID`

### 3. `smdservices-clients/engagement-template` repo

This is the template `gh repo create --template` copies for every engagement.

Create with:

- Minimal contents:
  - `.claude/` (empty directory committed via `.gitkeep`)
  - `.infisical.json` (placeholder — overwritten by `setup-new-engagement.sh`)
  - `.gitignore` (Node + macOS standards)
  - `README.md` (one-line description)
- Mark "Template repository" in repo settings
- **Branch protection on `main`**:
  - Require PR before merging
  - Require linear history
  - Restrict who can push (Captain only)
- **CODEOWNERS** at `.github/CODEOWNERS`:
  ```
  *  @SMDurgan
  ```

> **Known limitation (out of scope for v1):** drift-sync to existing engagement repos is not implemented. Engagements created before a template change won't auto-pick-up new template content; they'd need a manual update PR. Acceptable given low template-churn expectation.

### 4. Infisical management token

The crane-context worker needs a token to create folders and proxy secret reads on behalf of the launcher. **Scope it tightly** — this is the highest-privilege token in the SS pipeline.

- Generate at https://app.infisical.com/ → Project Settings → Access Control → Service Tokens
- Project: SMDurgan ventures (workspace `2da2895e-aba2-4faf-a65a-b86e1a7aa2cb`)
- Environment: `prod`
- **Scope: `/ss/clients/*` only** — NOT project-wide. Child folders inherit access.
- Permissions: Read + Write for secrets and folders within scope
- **Rotation: quarterly.** Add a calendar reminder. Existing engagements continue working through rotation since the token is held server-side, not embedded in repos.

Set it as a worker secret on `crane-context`:

```bash
cd workers/crane-context
wrangler secret put INFISICAL_MANAGEMENT_TOKEN              # staging
wrangler secret put INFISICAL_MANAGEMENT_TOKEN --env production
```

### 5. Verify the worker is wired

```bash
curl -fsS -X POST "https://crane-context-staging.automation-ab6.workers.dev/admin/provision-engagement" \
  -H "X-Admin-Key: $CRANE_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"client_slug":"smoke-test"}'
```

Expected: `{"success":true,"infisical_path":"/ss/clients/smoke-test"}`. Re-run to confirm idempotency (existing folder → still 200). After confirming, delete the test folder via the Infisical UI.

## Per-Engagement Runbook

For each new engagement after prereqs are in place:

### Adding a client (first time, or new client)

```bash
crane ss            # Launch SS agent
/new-client acme "Acme Co"
```

The `/new-client` skill: validates the slug, appends a client entry to `config/ventures.json`, calls `/admin/provision-engagement` to create `/ss/clients/acme/`, creates `~/dev/ss/acme/`, commits + pushes ventures.json, redeploys crane-context.

### Adding an engagement

```bash
crane ss            # Inside SS context (so CRANE_ADMIN_KEY is in env)
/new-engagement acme website "Acme Co Website"
```

The `/new-engagement` skill runs `scripts/setup-new-engagement.sh` which: provisions Infisical first, creates the GitHub repo from `engagement-template`, mutates `ventures.json` (with rollback trap), clones to `~/dev/ss/acme/website/`, drops scaffold files including a scope-locked `.claude/settings.json`, rebuilds crane-mcp, redeploys crane-context.

### Launching an engagement

```bash
crane ss/acme/website
```

The launcher parses the `/`-containing arg, resolves via `ENGAGEMENT_REGISTRY` (built from `config/ventures.json` at module init), 2-stage fetches secrets (SS-level for `CRANE_ADMIN_KEY` → engagement secrets via `/admin/engagement-secrets` proxy), asserts `additionalDirectories` scope, and spawns Claude Code with `CRANE_CLIENT_SLUG` + `CRANE_ENGAGEMENT_SLUG` env vars set.

## Operational Notes

### Rotation

- **Quarterly:** rotate `INFISICAL_MANAGEMENT_TOKEN` (calendar reminder). Re-issue the worker secret with the new token; nothing else needs to change.
- **As needed:** rotate the `smdservices-platform` GitHub App PEM if compromised. Re-store at Infisical `/ss/SMDSERVICES_PLATFORM_PEM`.

### Cross-client isolation

Filesystem layout `~/dev/ss/<client>/<engagement>/` plus `additionalDirectories` lock plus per-engagement Infisical path together prevent cross-client data leaks at the launcher tier. The launcher asserts `additionalDirectories` is exactly the engagement path (or an absolute-form equivalent) on every engagement launch — broader scope fails loudly rather than silently letting an agent read sibling engagements via `cat ../`.

### Cross-client lessons

Generalizable lessons learned during engagement work (e.g., "Astro+Clerk works for SMB marketing sites") belong in SS-venture-level memory at `~/.claude/projects/.../ss-console/memory/`, not in engagement memory. Memory governance and Captain review remain the controls — no special skill machinery for client-identifier scrubbing in v1.

### Out of scope (v1)

- Lifecycle states / archive flow (Captain explicit deferral)
- D1 tables for clients/engagements (ventures.json is the registry)
- SOW/kickoff/handoff/status-report scaffolding (process, not wiring)
- Engagement-template drift-sync to existing repos
- Excessive-provisioning-call alerting

## Reference Files

| File                                                                | Purpose                                          |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| `config/ventures.json`                                              | Single source of truth (clients[].engagements[]) |
| `packages/crane-mcp/src/cli/launch-lib.ts`                          | Launcher path parsing + ENGAGEMENT_REGISTRY      |
| `workers/crane-context/src/endpoints/admin-provision-engagement.ts` | Infisical folder + secrets proxy                 |
| `scripts/setup-new-engagement.sh`                                   | Engagement wiring script                         |
| `.claude/commands/new-client.md`                                    | /new-client skill                                |
| `.claude/commands/new-engagement.md`                                | /new-engagement skill                            |
