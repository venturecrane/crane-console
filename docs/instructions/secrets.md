# Secrets Management

## Quick Reference

```bash
# Launch agents with secrets injected
crane vc                                    # Venture Crane
crane ke                                    # Kid Expenses

# Run non-agent commands with secrets injected
infisical run --path /ke -- npm run dev     # Kid Expenses
infisical run --path /sc -- npm run dev     # Silicon Crane
infisical run --path /dfg -- npm run dev    # Durgan Field Guide
```

**Adding secrets:**

```bash
infisical secrets set NEW_KEY="value" --path /vc --env dev
```

**Reading secrets:**

```bash
infisical secrets --path /vc --env dev
```

**Vault (storage-only secrets):** Some secrets are stored but not injected into agent environments. These live at `/vault` sub-paths (e.g., `/vc/vault`). Check the vault before concluding a secret doesn't exist:

```bash
infisical secrets --path /vc/vault --env prod
```

## GitHub App (venturecrane-github)

- App ID: 2619905. Renamed from "crane-relay" on 2026-02-13.
- Used by crane-classifier (and any future workers) for unattended GitHub API auth.
- PEM key generated 2026-02-13. Stored in Infisical `/vc` as `GH_PRIVATE_KEY_PEM`.
- Installation IDs: venturecrane=104223482, durganfieldguide=103277966, siliconcrane=104223351, kidexpenses=106532992.
- Canonical secrets at `/vc`: `GH_PRIVATE_KEY_PEM`, `GH_WEBHOOK_SECRET`.

## Gotchas

- **Verify VALUES, not keys.** Agents have stored descriptions as values before (e.g., `GH_WEBHOOK_SECRET_CLASSIFIER` had a note instead of the actual secret). Always verify the VALUE is the actual secret.
- **Token equivalences:** `RELAY_TOKEN` and `RELAY_SHARED_SECRET` = `CRANE_ADMIN_KEY` (same value).
- Never hardcode secrets or ask users to paste them. Use Infisical injection.
- **Never echo or display secret values in CLI sessions.** CLI transcripts persist
  indefinitely in ~/.claude/ and are sent to the API provider. To provision secrets
  to workers, pipe from Infisical:
  `infisical export --format=json --path /{venture} --env prod | npx wrangler secret bulk`
  To verify a secret works, test the integration (make an API call), not the value.
  Never pass secret values as inline shell arguments.

## Full Documentation

See `docs/infra/secrets-management.md` for complete Infisical setup, rotation policies, and architecture.
