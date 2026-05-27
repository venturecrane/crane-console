---
title: 'Token Registry'
sidebar:
  order: 4
---

# Token Registry

This is the fast lookup page for shared tokens and auth surfaces that can break multiple ventures, fleet machines, or hosted tooling when they expire or rotate. If the question is "what does this token do, what depends on it, and what breaks if I revoke it?", start here.

This registry covers shared, cross-venture credentials. It is not the full per-product app-secret inventory. For venture-specific secrets, see [Secrets Management](secrets-management.md).

## Operating Rules

- Create the replacement before revoking the current credential.
- Never paste raw token values into a transcript or shell history.
- Update the canonical store first, then every downstream copy, then verify, then revoke the old value.
- If the same env var name exists in multiple planes, treat each copy as a separate credential until this registry says otherwise.
- Update this file whenever a token rotates, expires, is retired, or gains a new consumer.

## Shared Token Registry

| Credential                                  | Type                                              | Canonical store                                                                                             | Observed status at 2026-05-20 review                                                                                                                 | Primary role                                                                       | Primary consumers                                                                            | Rotation                                                                                                         |
| ------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GH_TOKEN`                                  | GitHub PAT (`repo`, `workflow`)                   | Infisical `prod:/vc` `GH_TOKEN`, then synced to every venture path                                          | Rotated on 2026-05-20. Replacement PAT is live in Infisical, synced across venture paths, passed GitHub API verification, and expires on 2026-08-18. | GitHub auth for `crane`-launched sessions and shared fleet tooling                 | `packages/crane-mcp`, `scripts/setup-claude-desktop-mcp.sh`, notifications and fleet scripts | [GH_TOKEN - Infisical shared PAT](token-rotation-runbook.md#gh_token-infisical-shared-pat)                       |
| `NODE_AUTH_TOKEN`                           | GitHub classic PAT (`read:packages`)              | Infisical `prod:/vc` `NODE_AUTH_TOKEN`, then synced to every venture path                                   | Backing PAT `enterprise-packages-read-2026` active, expires 2026-07-19                                                                               | Pull private `@venturecrane/*` npm packages                                        | `npm install`, launcher-injected agent env, fleet machines                                   | [NODE_AUTH_TOKEN - GitHub Packages PAT](token-rotation-runbook.md#node_auth_token-github-packages-pat)           |
| `GH_TOKEN`                                  | GitHub fine-grained PAT, read-only                | `workers/crane-context` Wrangler secret `GH_TOKEN`                                                          | Status not part of the 2026-05-20 PAT audit. Source confirms it exists as a separate worker secret.                                                  | Scheduled deploy-heartbeats reconciliation against GitHub Actions                  | `workers/crane-context/src/deploy-heartbeats-reconcile.ts`                                   | [GH_TOKEN - crane-context worker secret](token-rotation-runbook.md#gh_token-crane-context-worker-secret)         |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | GitHub OAuth App client pair                      | `workers/crane-mcp-remote` Wrangler secrets. User grants live in `OAUTH_KV`.                                | App name in repo docs: `venturecrane-github` (ID `2619905`). Registration location still needs manual confirmation.                                  | claude.ai and Claude Desktop GitHub access through `crane-mcp-remote`              | `workers/crane-mcp-remote/src/github-handler.ts`, `github-api.ts`, `github-tools.ts`         | [crane-mcp-remote GitHub OAuth app](token-rotation-runbook.md#crane-mcp-remote-github-oauth-app)                 |
| `CLOUDFLARE_API_TOKEN`                      | Cloudflare API token                              | Infisical `prod:/vc` `CLOUDFLARE_API_TOKEN`; separate GitHub Actions secret on `venturecrane/crane-console` | Not re-audited here. Known to power deploy paths that were previously confused with GitHub PATs.                                                     | Worker and Pages deploys, selected bootstrap flows                                 | `deploy*.yml`, `d1-backup.yml`, launcher env, bootstrap scripts                              | [CLOUDFLARE_API_TOKEN - shared deploy token](token-rotation-runbook.md#cloudflare_api_token-shared-deploy-token) |
| `GITHUB_TOKEN`                              | GitHub Actions ephemeral token                    | GitHub Actions runtime, repo-scoped and auto-issued                                                         | GitHub-managed. Not Captain-rotated.                                                                                                                 | CI reads package registry, repo automation, workflow actions                       | `.github/workflows/*`                                                                        | No manual rotation. Treat as a separate auth surface from `GH_TOKEN`.                                            |
| Local `gh` keyring auth                     | Per-machine keychain credential                   | Captain or operator machine keychain                                                                        | Not centrally tracked. Still used by some bootstrap scripts and local fallback flows.                                                                | `gh` CLI on control machines outside `crane` session injection                     | `scripts/bootstrap-new-mac.sh`, `scripts/bootstrap-new-box.sh`, ad hoc operator CLI use      | Re-auth per machine with `gh auth login`.                                                                        |
| `nous hermes`                               | GitHub PAT (`repo`), no expiration at review time | Customer provisioning flow, not launcher-injected                                                           | Active with no expiration during the incident review                                                                                                 | Lets per-customer Hermes machines clone `NousResearch/hermes-agent` during install | Customer onboarding flow outside this repo                                                   | [nous hermes - customer provisioning PAT](token-rotation-runbook.md#nous-hermes-customer-provisioning-pat)       |

## Consumer Detail

### `GH_TOKEN` - Infisical shared PAT

This is the shared GitHub PAT that matters when a `crane` session suddenly cannot create PRs, read issues, or use GitHub-backed tooling.

- Session injection: `packages/crane-mcp/src/cli/launch-lib.ts`
- CLI auth detection and GitHub wrappers: `packages/crane-mcp/src/lib/github.ts`
- Session health reporting: `packages/crane-mcp/src/tools/preflight.ts`, `packages/crane-mcp/src/tools/sos.ts`
- Desktop MCP config generation: `scripts/setup-claude-desktop-mcp.sh`
- Notifications backfill and related tooling: `packages/crane-mcp/src/scripts/notifications-backfill.ts`, `scripts/notifications/README.md`
- Fleet and provisioning scripts: `scripts/fleet-branch-protection.sh`, `scripts/provision-hermes-fleet-update.sh`

Important nuance: `scripts/bootstrap-new-mac.sh` and `scripts/bootstrap-new-box.sh` currently source the control machine's local `gh auth token` and forward that to the target machine. They are still part of the GitHub auth story, but they do not fetch `GH_TOKEN` from Infisical directly.

### `GH_TOKEN` name collision

There are two different credentials named `GH_TOKEN` in this repo:

1. The shared PAT in Infisical, injected into `crane` sessions and shared venture env.
2. The separate Wrangler secret on `workers/crane-context`, used only for scheduled deploy-heartbeats reconciliation.

Rotating one does **not** rotate the other. Treat them as separate rows, separate runbooks, and separate blast radii.

### `crane-mcp-remote` GitHub OAuth surface

The claude.ai surface does **not** use the shared PAT above.

- OAuth handler: `workers/crane-mcp-remote/src/github-handler.ts`
- GitHub REST client: `workers/crane-mcp-remote/src/github-api.ts`
- Tool registration: `workers/crane-mcp-remote/src/github-tools.ts`
- OAuth storage: `OAUTH_KV` in `workers/crane-mcp-remote/wrangler.toml`
- Allowlist gate: `ALLOWED_GITHUB_USERS = "SMDurgan"`

The repo documents the app as `venturecrane-github` (ID `2619905`). The OAuth flow lives in the worker at `/authorize` → GitHub → `/callback` (per `src/github-handler.ts:21,50`); GitHub redirects back to whatever URL the worker presents as `redirect_uri` (computed as `new URL('/callback', c.req.url).href`, line 37). Because the worker exposes per-venture MCP endpoints under `/mcp/{vc,ss,ke,dfg,dc}` plus the legacy `/mcp`, the callback URL itself is path-agnostic — it always lands on `/callback`. **Captain still needs to record the literal "Authorization callback URL" string from the GitHub OAuth App settings page here**, and confirm whether that field accepts multiple URLs (for staging + prod) or a single fixed value. See `docs/runbooks/claude-ai-project-setup.md` Phase 0b for the verification procedure.

## Known Hazards

### Naked `gh auth status` in a `crane` session

When an injected `GH_TOKEN` is invalid, `gh auth status` can print the configured token value. That creates a transcript leak even if the value is already dead.

Use one of these instead:

- To inspect machine keyring auth: `env -u GH_TOKEN gh auth status >/dev/null`
- To verify the shared PAT after rotation: follow the [GH_TOKEN runbook](token-rotation-runbook.md#gh_token-infisical-shared-pat)
- To verify a fresh agent session: relaunch `crane` and rely on preflight

## Dormant and Delete Candidates

| Credential             | Status at 2026-05-20 review                       | Why it is safe to remove                                                                                                             | Action                                                                 |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `crane-command-center` | Expired 2026-04-14, last used around January 2026 | No source references in `crane-console` or `ss-console`. `crane-command.pages.dev` deploys use `CLOUDFLARE_API_TOKEN`, not this PAT. | Delete in GitHub UI after the replacement `GH_TOKEN` path is verified. |

Legacy `GITHUB_MCP_PAT` references were removed from the canonical docs in this repo. The remote GitHub surface uses the OAuth app above, not a standalone PAT.

## Monitoring Recommendation

The registry is only useful if review becomes routine. Recommended path:

1. Add a weekly cadence item for `token-registry-review`.
2. Extend `scripts/system-readiness-audit.sh` or a dedicated audit to flag:
   - PATs expiring within 14 days
   - Registry rows with `unknown` or `TBD`
   - Dormant tokens that are still not deleted
3. Put calendar reminders 14 days before every Captain-owned PAT expiration date.

## Related Documentation

- [Secrets Management](secrets-management.md)
- [Token Rotation Runbook](token-rotation-runbook.md)
- [Secrets Rotation Runbook](secrets-rotation-runbook.md)
- [GitHub Packages Auth](github-packages-auth.md)
