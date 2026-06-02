---
title: 'Token Rotation Runbook'
sidebar:
  order: 5
---

# Token Rotation Runbook

This is the exact rotation playbook for shared tokens and auth surfaces that can break multiple ventures. Use it with [Token Registry](token-registry.md). The rule is simple: new value first, verification second, old value deletion last.

## Universal Sequence

1. Find the credential in [Token Registry](token-registry.md).
2. Confirm the canonical store and every downstream copy.
3. Create the replacement before touching the current value.
4. Write the replacement into the canonical store without echoing the value.
5. Propagate every downstream copy or worker secret.
6. Verify from a real consumer.
7. Revoke the old value only after verification passes.
8. Update the registry and the cadence table in [Secrets Rotation Runbook](secrets-rotation-runbook.md).

## Safety Rules

- Never paste a raw token into chat, shell history, or a checked-in file.
- Prefer clipboard-to-subshell commands such as `$(pbpaste | tr -d '[:space:]')`.
- Verify length or HTTP status, not the token body itself.
- Restart or relaunch any long-lived session that snapshots env at launch time.
- If a secret name exists in multiple planes, rotate each plane explicitly.

## Quick Lookup

| Credential               | Canonical store                              | Write path                                                   | Verify with                              | Revoke old when                                 |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------- |
| `GH_TOKEN` shared PAT    | Infisical `prod:/vc`                         | `infisical secrets set`, then `sync-shared-secrets.sh --fix` | fresh `crane` session + API status check | new sessions and synced paths work              |
| `NODE_AUTH_TOKEN`        | Infisical `prod:/vc`                         | `infisical secrets set`, then `sync-shared-secrets.sh --fix` | `npm install` or registry HTTP 200       | package installs work                           |
| `GH_TOKEN` worker secret | `workers/crane-context` Wrangler secret      | `wrangler secret put GH_TOKEN`                               | worker logs show reconciliation succeeds | staging and prod worker secret updated          |
| `GITHUB_CLIENT_SECRET`   | `workers/crane-mcp-remote` Wrangler secret   | `wrangler secret put GITHUB_CLIENT_SECRET`                   | fresh claude.ai reconnect succeeds       | fresh OAuth flow works                          |
| `CLOUDFLARE_API_TOKEN`   | Infisical `prod:/vc` + GitHub Actions secret | `infisical secrets set`, then `gh secret set`                | deploy or token verify endpoint          | both Infisical and Actions copies updated       |
| `nous hermes`            | Customer provisioning path                   | customer onboarding flow                                     | fresh onboarding succeeds                | supported customer installs re-baked or retired |

## `GH_TOKEN` - Infisical shared PAT

**Purpose:** Shared GitHub auth for `crane`-launched sessions and several fleet scripts.  
**Canonical store:** Infisical `prod:/vc`, key `GH_TOKEN`  
**Current role name at incident review:** `crane-agent-token`

### Rotation steps

1. Generate a new GitHub PAT in the Captain account before touching the old one.
   - Scope: `repo`, `workflow`
   - Expiration: explicit, not no-expiration
   - Name: role-based with a date suffix, for example `crane-agent-token-2026-05`
2. Copy the new token to the clipboard.
3. Write it to the canonical store without echoing:

```bash
infisical secrets set "GH_TOKEN=$(pbpaste | tr -d '[:space:]')" --path /vc --env prod >/dev/null 2>&1 && echo set
```

4. Verify length only:

```bash
infisical secrets get GH_TOKEN --path /vc --env prod --plain | wc -c
```

Classic PATs are typically `41` including the newline. The important check is non-zero and plausibly token-sized.

5. Propagate the shared secret to every venture path:

```bash
cd ~/dev/crane-console
bash scripts/sync-shared-secrets.sh --fix
```

6. Verify from a real consumer:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $(infisical secrets get GH_TOKEN --path /vc --env prod --plain | tr -d '\n')" \
  https://api.github.com/user
```

Expect `200`.

7. Start a fresh `crane vc` session and confirm preflight reports GitHub auth.
8. Restart any still-running agent sessions that were launched before the rotation.
9. Revoke the old PAT in GitHub only after steps 3 through 8 pass.

### Do not do this

- Do not run naked `gh auth status` inside a `crane`-launched session.
- Do not revoke the old PAT before `sync-shared-secrets.sh --fix` completes.
- Do not assume the `workers/crane-context` secret of the same name was updated.

### Follow-up cleanup

After the new shared PAT is stable, delete the dormant `crane-command-center` PAT in GitHub UI if it still exists.

## `NODE_AUTH_TOKEN` - GitHub Packages PAT

**Purpose:** Pull private `@venturecrane/*` packages from `npm.pkg.github.com`.  
**Canonical store:** Infisical `prod:/vc`, key `NODE_AUTH_TOKEN`  
**Current role name at incident review:** `enterprise-packages-read-2026`

### Rotation steps

1. Generate a new classic PAT with **only** `read:packages`.
2. Copy it to the clipboard.
3. Write it to Infisical:

```bash
infisical secrets set "NODE_AUTH_TOKEN=$(pbpaste | tr -d '[:space:]')" --path /vc --env prod >/dev/null 2>&1 && echo set
```

4. Verify length only:

```bash
infisical secrets get NODE_AUTH_TOKEN --path /vc --env prod --plain | wc -c
```

5. Propagate it to all venture paths:

```bash
cd ~/dev/crane-console
bash scripts/sync-shared-secrets.sh --fix
```

6. Verify the registry returns `200`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $(infisical secrets get NODE_AUTH_TOKEN --path /vc --env prod --plain | tr -d '\n')" \
  https://npm.pkg.github.com/@venturecrane%2Fcrane-test-harness
```

7. Revoke the old PAT only after installs succeed again.

See also [GitHub Packages Auth](github-packages-auth.md).

## `GH_TOKEN` - `crane-context` worker secret

**Purpose:** Scheduled deploy-heartbeats reconciliation against GitHub Actions.  
**Canonical store:** Wrangler secret `GH_TOKEN` in `workers/crane-context`

This is a separate credential plane from the shared Infisical `GH_TOKEN`.

### Rotation steps

1. Generate a replacement PAT with read-only access sufficient for GitHub Actions run reads across the `venturecrane` org.
2. Update staging:

```bash
cd ~/dev/crane-console/workers/crane-context
wrangler secret put GH_TOKEN
```

3. Update production:

```bash
cd ~/dev/crane-console/workers/crane-context
wrangler secret put GH_TOKEN --env production
```

Wrangler prompts for the secret value. Paste the new token when prompted.

4. Verify in logs after the next scheduled run or manual observation:
   - No `GH_TOKEN not set` warning
   - No GitHub `401` responses from reconciliation
   - Normal `reconcile: walking ... heartbeats` output
5. Revoke the old PAT only after both staging and production are updated and verification passes.

## `crane-mcp-remote` GitHub OAuth app

**Purpose:** GitHub access for claude.ai and Claude Desktop through `workers/crane-mcp-remote`.  
**Canonical store:** Wrangler secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`  
**User grants:** `OAUTH_KV`  
**Repo-documented app name:** `venturecrane-github` (ID `2619905`)

This surface is **not** affected by shared `GH_TOKEN` rotation.

### Rotation steps

1. In GitHub App or OAuth App settings, create a replacement client secret for the existing app.
2. Update staging:

```bash
cd ~/dev/crane-console/workers/crane-mcp-remote
wrangler secret put GITHUB_CLIENT_SECRET
```

3. Update production:

```bash
cd ~/dev/crane-console/workers/crane-mcp-remote
wrangler secret put GITHUB_CLIENT_SECRET --env production
```

4. Verify the rest of the app metadata while you are in the console:
   - app name
   - app id
   - registration location: Captain account vs `venturecrane` org
   - allowed repos or org scope
5. Confirm a fresh connect flow works in claude.ai or Claude Desktop.
6. Revoke the old client secret only after the fresh connect flow passes.
7. Update [Token Registry](token-registry.md) with the confirmed registration location.

## `CLOUDFLARE_API_TOKEN` - shared deploy token

**Purpose:** Worker and Pages deploys, plus selected bootstrap flows.  
**Canonical stores:** Infisical `prod:/vc` `CLOUDFLARE_API_TOKEN` and GitHub Actions secret `CLOUDFLARE_API_TOKEN` on `venturecrane/crane-console`

### Rotation steps

1. Generate the replacement token in Cloudflare before touching the current one.
2. Write the new value to Infisical:

```bash
infisical secrets set "CLOUDFLARE_API_TOKEN=$(pbpaste | tr -d '[:space:]')" --path /vc --env prod >/dev/null 2>&1 && echo set
```

3. Propagate the shared secret:

```bash
cd ~/dev/crane-console
bash scripts/sync-shared-secrets.sh --fix
```

4. Update the GitHub Actions secret in this repo:

```bash
cd ~/dev/crane-console
gh secret set CLOUDFLARE_API_TOKEN --body "$(pbpaste | tr -d '[:space:]')"
```

5. Verify the token with Cloudflare:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $(infisical secrets get CLOUDFLARE_API_TOKEN --path /vc --env prod --plain | tr -d '\n')" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

Expect `200`.

6. Verify a real deploy path before revoking the old token.
7. Revoke the old Cloudflare token last.

## `nous hermes` - customer provisioning PAT

**Purpose:** Lets customer-hosted Hermes machines clone `NousResearch/hermes-agent` during provisioning.  
**Canonical store:** Customer onboarding flow outside the `crane` launcher path

### Rotation policy

- Do not keep this PAT on no-expiration forever.
- Rotate it at the next customer onboarding or explicit maintenance window.
- Create the replacement before changing the provisioning path.
- Re-bake the new token into the onboarding flow before deleting the old one.
- Do not revoke the old PAT until every supported customer install that still depends on it has been updated or retired.

This token is a hygiene tracker item, not a good candidate for a surprise mid-day revoke.

## Retire Without Replace

### `crane-command-center`

This token is a dormant predecessor, not an active dependency.

- Confirm the replacement `GH_TOKEN` path is live.
- Confirm no current repo or runbook still references `crane-command-center`.
- Delete it in GitHub UI.

## Related Documentation

- [Token Registry](token-registry.md)
- [Secrets Rotation Runbook](secrets-rotation-runbook.md)
- [Secrets Management](secrets-management.md)
- [GitHub Packages Auth](github-packages-auth.md)
