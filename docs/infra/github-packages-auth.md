# GitHub Packages Auth

How ventures authenticate to `npm.pkg.github.com` to install `@venturecrane/*` packages.

## Why a registry (not tarball URLs)

`@venturecrane/crane-test-harness` and any future shared `@venturecrane/*` packages are published to the GitHub Packages npm registry. Consumers install via semver (`"@venturecrane/crane-test-harness": "^0.1.0"`), not pinned release tarball URLs.

This is the durable factory-scale shape:

- **Dependabot** sees registry packages and proposes version bumps across the fleet.
- **Semver + dist-tags** — `latest` for stable, `rc` for pre-release. One venture can opt in to `@rc` while others stay on `latest`.
- **Lockfile integrity** — registry tarballs are immutable once published; re-uploading a release asset cannot silently break downstream lockfiles.
- **`npm audit`** and `npm outdated` cover the supply chain.
- **Abstraction** — registry changes (self-host, move to public npm) require one `.npmrc` edit per consumer, not `package.json` URL rewrites.

The only cost is authentication, and every piece of auth infrastructure this pattern needs already exists in the fleet (Infisical, `crane` launcher env injection, Actions' `GITHUB_TOKEN`).

## Auth model

| Consumer              | Token source                      | How it arrives                                               |
| --------------------- | --------------------------------- | ------------------------------------------------------------ |
| Local dev (any agent) | Infisical `/vc` `NODE_AUTH_TOKEN` | Injected by `crane` launcher into agent shell env            |
| GitHub Actions        | `${{ secrets.GITHUB_TOKEN }}`     | Provided by Actions; needs `packages: read` permission block |
| Fleet machines        | Infisical `/vc` `NODE_AUTH_TOKEN` | Same as local dev via `crane` launcher + Machine Identity    |

`NODE_AUTH_TOKEN` is listed in `config/ventures.json` `sharedSecrets.keys`, so `scripts/sync-shared-secrets.sh --fix` propagates the `/vc` value to every venture's Infisical path.

## Token: classic PAT, `read:packages` only

Fine-grained PATs have persistent compatibility gaps with `npm.pkg.github.com`. Classic PAT with the single `read:packages` scope is the battle-tested, correctly-documented path.

**Settings:**

- Name: `enterprise-packages-read-YYYY` (year of creation)
- Expiration: 366 days (1 year maximum meaningful value)
- Scopes: **only** `read:packages` — no `repo`, `workflow`, `user`, `read:org`, or anything else.
- Owned by the SMDurgan account (sole venturecrane org owner).

**Blast radius if leaked:** read access to `@venturecrane/*` packages. These are internal libs every venture already consumes. Not secrets, not credentials, not write access. Rotate annually anyway.

## Consumer setup

Every venture that installs `@venturecrane/*` packages needs an `.npmrc` at repo root:

```
@venturecrane:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`templates/venture/.npmrc` is this exact file. New ventures get it automatically.

CI workflows (`verify.yml`, `deploy.yml`, `security.yml`) need `actions/setup-node` configured for the registry:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'
    registry-url: 'https://npm.pkg.github.com'
    scope: '@venturecrane'

- run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

No secret management in CI — `GITHUB_TOKEN` is provided by Actions. The workflow just needs `packages: read` in the job `permissions:` block if the default is restrictive.

## Rotation

Annual. See `docs/infra/secrets-rotation-runbook.md` for the procedure.

Short version: regenerate PAT on GitHub with the same settings, `infisical secrets set "NODE_AUTH_TOKEN=$(pbpaste | tr -d '[:space:]')" --path /vc --env prod >/dev/null 2>&1 && echo set`, then `bash scripts/sync-shared-secrets.sh --fix` to propagate. No code changes, no PR.

## Troubleshooting

**`401 Unauthorized` on `npm install`:**

1. Verify token is present in agent env: `echo ${NODE_AUTH_TOKEN:+present}` (prints `present` or nothing; never prints value).
2. Verify token length: `echo -n "$NODE_AUTH_TOKEN" | wc -c` — expect 40 for a classic PAT.
3. Verify token works: `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $NODE_AUTH_TOKEN" https://npm.pkg.github.com/@venturecrane%2Fcrane-test-harness` — expect `200`.
4. Token may be expired. Check github.com/settings/tokens; regenerate per rotation runbook.
5. Token may be missing from Infisical. `infisical secrets get NODE_AUTH_TOKEN --path /vc --env prod --plain | wc -c` (length-only check). If missing, see rotation runbook for restoration.

**Launcher not injecting `NODE_AUTH_TOKEN`:**

The launcher (`packages/crane-mcp/src/cli/launch-lib.ts`) hardcodes env var allowlists for Gemini and Codex MCP servers. Claude Code inherits `process.env` directly. If a new agent is added, its allowlist must include `NODE_AUTH_TOKEN` — the hardcoded lists are slated for consolidation with `config/ventures.json` `sharedSecrets.keys` (see GitHub issue on crane-console).

## Upgrade trigger

Move from classic PAT to a GitHub App with a token broker when **any** of these is true:

- A second operator joins the org (classic PAT remains tied to SMDurgan; rotation becomes a coordination problem).
- Compliance requirement introduces audit/revocation trails this token cannot satisfy (SOC 2, etc.).
- Fine-grained PAT support for `npm.pkg.github.com` stabilizes across both local and Actions and is documented as first-class.

Until one of those is true, classic PAT with minimal scope is the right-sized choice.

## History

- 2026-04-07 — ss-console adopts `@venturecrane/crane-test-harness` via registry. First consumer.
- 2026-04-08 — sc, dfg, ke, dc adopt via GitHub Releases tarball URL instead. Drift introduced.
- 2026-04-20 — Token loss + enterprise audit. Registry pattern standardized. Classic PAT chosen; added to Infisical `/vc`; launcher allowlists extended; `.npmrc` template updated; this doc written. Per-venture migration PRs to follow.
