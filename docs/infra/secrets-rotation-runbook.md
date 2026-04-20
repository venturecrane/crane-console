# Secrets Rotation Runbook

Scheduled rotation procedures for shared secrets. Surfaced by `/sos` as a cadence item; review quarterly, execute per the intervals below.

## Principles

- **Rotate on schedule**, not on incident. Incident-driven rotation is too late.
- **Never echo values into agent sessions.** See `docs/infra/secrets-management.md` — CLI transcripts persist and are sent to the API provider.
- **Move secrets via `pbpaste` + output-suppressed pipe** into Infisical. Both halves: source (`pbpaste`) and sink (`>/dev/null 2>&1 && echo set`).
- **Length-only verification.** After setting, check `infisical secrets get KEY --path … --plain | wc -c`; never inspect values directly.
- **Propagate after setting.** `bash scripts/sync-shared-secrets.sh --fix` copies shared keys from `/vc` to every venture path.

## Schedule

| Secret            | Cadence | Last rotated | Next due   | Owner   | Runbook                             |
| ----------------- | ------- | ------------ | ---------- | ------- | ----------------------------------- |
| `NODE_AUTH_TOKEN` | 1 year  | 2026-04-20   | 2027-04-20 | Captain | [NODE_AUTH_TOKEN](#node_auth_token) |

## NODE_AUTH_TOKEN

Classic PAT on SMDurgan account, scope `read:packages` only, used by every venture's `npm install` to fetch `@venturecrane/*` packages from `npm.pkg.github.com`. See `docs/infra/github-packages-auth.md` for design context.

**Rotation procedure:**

1. Create the replacement before revoking the current — eliminates window of breakage.
   - github.com/settings/tokens → **Generate new token (classic)**
   - Name: `enterprise-packages-read-<year>` (reflect the new rotation year)
   - Expiration: 366 days (Custom)
   - Scopes: **only** `read:packages`
   - Description: "Read-only access to @venturecrane/\* packages on npm.pkg.github.com. Stored in Infisical /vc as NODE_AUTH_TOKEN; injected into agent and fleet env by crane launcher. Rotation: see crane-console/docs/infra/secrets-rotation-runbook.md"
   - **Generate token**, copy to clipboard.

2. Push into Infisical with output suppression:

   ```bash
   infisical secrets set "NODE_AUTH_TOKEN=$(pbpaste | tr -d '[:space:]')" --path /vc --env prod >/dev/null 2>&1 && echo set
   ```

3. Verify length only:

   ```bash
   infisical secrets get NODE_AUTH_TOKEN --path /vc --env prod --plain | wc -c
   ```

   Expect `41` (40-char classic PAT + newline).

4. Propagate to every venture's Infisical path:

   ```bash
   cd ~/dev/crane-console && bash scripts/sync-shared-secrets.sh --fix
   ```

5. Verify in a venture:

   ```bash
   cd ~/dev/ss-console && rm -rf node_modules && npm install
   ```

   `@venturecrane/crane-test-harness` should resolve without 401.

6. Revoke the old token on github.com/settings/tokens → delete the previous year's token entry. **Do this last**; deleting before the new token propagates breaks every active session and CI run.

7. Clear clipboard by copying harmless text.

8. Update the **Last rotated** and **Next due** dates in the schedule table above.

**If something goes wrong mid-rotation:**

- Old token still valid until step 6. If new token fails verification at step 3 or 5, regenerate and repeat. The old token keeps production working during the retry window.
- If a value was accidentally echoed into a transcript, treat the token as compromised and return to step 1 with a fresh PAT.

## How to add a new entry

1. Add a row to the schedule table above.
2. Add a `## SECRET_NAME` section with the rotation procedure, following the structure of `NODE_AUTH_TOKEN`.
3. Reference any relevant design doc in `docs/infra/`.
4. Link from the relevant `docs/infra/*-auth.md` doc's "Rotation" section.
