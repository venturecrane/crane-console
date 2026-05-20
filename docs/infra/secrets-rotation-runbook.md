# Secrets Rotation Runbook

Scheduled rotation review for shared credentials. Use this as the cadence table, then follow [Token Rotation Runbook](token-rotation-runbook.md) for the actual step-by-step procedure.

## Principles

- **Rotate on schedule**, not on incident. Incident-driven rotation is too late.
- **Never echo values into agent sessions.** See `docs/infra/secrets-management.md` - CLI transcripts persist and are sent to the API provider.
- **Move secrets via `pbpaste` + output-suppressed pipe** into Infisical. Both halves: source (`pbpaste`) and sink (`>/dev/null 2>&1 && echo set`).
- **Length-only verification.** After setting, check `infisical secrets get KEY --path … --plain | wc -c`; never inspect values directly.
- **Propagate after setting.** `bash scripts/sync-shared-secrets.sh --fix` copies shared keys from `/vc` to every venture path.
- **Multiple planes mean multiple rotations.** The shared `GH_TOKEN` in Infisical and the worker `GH_TOKEN` in `workers/crane-context` are different credentials.

## Canonical References

- [Token Registry](token-registry.md)
- [Token Rotation Runbook](token-rotation-runbook.md)
- [Secrets Management](secrets-management.md)

## Schedule

| Credential                                          | Cadence                                                                 | Last rotated | Next due        | Owner   | Procedure                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------- | ------------ | --------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `GH_TOKEN` (Infisical shared PAT)                   | Before PAT expiration and during any auth incident                      | 2026-05-20   | 2026-08-18      | Captain | [GH_TOKEN - Infisical shared PAT](token-rotation-runbook.md#gh_token-infisical-shared-pat)                       |
| `NODE_AUTH_TOKEN`                                   | 1 year                                                                  | 2026-04-20   | 2027-04-20      | Captain | [NODE_AUTH_TOKEN - GitHub Packages PAT](token-rotation-runbook.md#node_auth_token-github-packages-pat)           |
| `GH_TOKEN` (`workers/crane-context`)                | 90 days or before PAT expiration                                        | Unknown      | Unknown         | Captain | [GH_TOKEN - crane-context worker secret](token-rotation-runbook.md#gh_token-crane-context-worker-secret)         |
| `GITHUB_CLIENT_SECRET` (`workers/crane-mcp-remote`) | 180 days or after suspected exposure                                    | Unknown      | Unknown         | Captain | [crane-mcp-remote GitHub OAuth app](token-rotation-runbook.md#crane-mcp-remote-github-oauth-app)                 |
| `CLOUDFLARE_API_TOKEN`                              | 60 days                                                                 | Unknown      | Unknown         | Captain | [CLOUDFLARE_API_TOKEN - shared deploy token](token-rotation-runbook.md#cloudflare_api_token-shared-deploy-token) |
| `nous hermes`                                       | Next customer onboarding window, then explicit expiration going forward | Unknown      | Next onboarding | Captain | [nous hermes - customer provisioning PAT](token-rotation-runbook.md#nous-hermes-customer-provisioning-pat)       |

Unknown rows are debt, not placeholders forever. Update them on the next live rotation or audit.

## How to keep this table honest

1. Update the row immediately after each rotation.
2. When a token expires unexpectedly, update both this table and [Token Registry](token-registry.md) in the same PR.
3. If a credential gains a new consumer, update the registry before the consumer ships.
4. If a token is deleted permanently, remove it from the schedule and move it to the registry's delete-candidate history if the cleanup is worth remembering.
