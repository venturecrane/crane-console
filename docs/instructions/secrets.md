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

**Verifying secrets are set (presence check, no values):**

```
crane_secret_check({ path: '/vc', env: 'dev' })
crane_secret_check({ path: '/vc', env: 'prod', names: ['API_KEY', 'DB_URL'] })
```

Returns key names only — **never secret values**. This is the sanctioned way for agents to answer "is this set?" and replaces the previous `infisical secrets …` pattern, which leaks values into the transcript by default.

**Using secret values in a command:**

```bash
infisical run --env prod --path /vc -- <command-that-reads-env-vars>
```

The child process inherits the secrets as environment variables; the value never enters the agent's context. **Caveat — env-leak risk:** child processes that dump environment on failure (Node `--enable-source-maps` traces, Python `--showlocals`, `env > file` then `cat`) can still leak. Do not run debuggers, env-dumping tools, or `set -x` under `infisical run --`. If the child crashes, treat its output as untrusted and rotate any visible value.

## Hook Enforcement

Three structural layers prevent secret values from reaching the transcript:

1. **Harness deny** — `~/.claude/settings.json` `permissions.deny` blocks `Bash(infisical secrets:*)` and `Bash(infisical export:*)` outright. Fires before any hook.
2. **PreToolUse deny hook** — `~/.claude/hooks/bash-secret-deny.sh` catches wrapped invocations (`bash -c "…"`, `$(infisical secrets …)`, variable indirection) and non-Infisical leak shapes (`cat .env*`, `printenv`, `wrangler secret put NAME <literal>`, `curl -H 'Authorization: Bearer <literal>'`). Fails closed on missing `jq`.
3. **PATH wrapper** — `~/.local/bin/infisical` shadow wrapper enforces the same rules in subshells (fleet machines, scripts) when `CRANE_AGENT=1` is set by the crane launcher. Captain's interactive shell is unaffected.

A PostToolUse detection hook (`~/.claude/hooks/secret-leak-detector.sh`) scans tool output for known secret prefixes (`ghp_`, `xoxb-`, `sk_live_`, Telegram bot token shape, AWS access key, etc.) and writes alerts to `~/.claude/secret-leak-alerts.jsonl` — never the full value, only the pattern name and first 4 chars. This gives the feedback loop: if prevention is working, the alerts file stays empty.

### Loop-breaker on deny

When an agent receives `permissionDecision: deny` from `bash-secret-deny.sh` (or the harness deny), the message includes a redirect to the safe alternative. **Switch to the redirected tool. Do not retry with a workaround** — re-attempting via `bash -c` or `$(…)` is detected and denied. The deny is a cliff, not a wall: there's no "argue past it" path.

### Subagent coverage

This governance file applies to the orchestrating agent. Subagents spawned with restricted scope may not load `secrets.md` and are protected by the hook + harness-deny layers, not by reading this doc. The hook is the defense surface; this doc sets expectations for human review and orchestrator context.

## GitHub App (venturecrane-github)

- App ID: 2619905. Renamed from "crane-relay" on 2026-02-13.
- Used by crane-watch (and any future workers) for unattended GitHub API auth.
- PEM key generated 2026-02-13. Stored in Infisical `/vc` as `GH_PRIVATE_KEY_PEM`.
- Installation IDs: venturecrane=104223482, durganfieldguide=103277966, siliconcrane=104223351, kidexpenses=106532992.
- Canonical secrets at `/vc`: `GH_PRIVATE_KEY_PEM`, `GH_WEBHOOK_SECRET`.

## Vault (storage-only secrets)

Some secrets are stored but not injected into agent environments. These live at `/vault` sub-paths (e.g., `/vc/vault`). Check the vault before concluding a secret doesn't exist:

```
crane_secret_check({ path: '/vc/vault', env: 'prod' })
```

## Gotchas

- **Verify VALUES, not keys.** Agents have stored descriptions as values before (e.g., `GH_WEBHOOK_SECRET_CLASSIFIER` had a note instead of the actual secret). To verify the value is correct, **test the integration** (make an API call, check that the dependent service works), not the value text itself.
- **Token equivalences:** `RELAY_TOKEN` and `RELAY_SHARED_SECRET` = `CRANE_ADMIN_KEY` (same value).
- Never hardcode secrets or ask users to paste them into chat. Use Infisical injection.
- **Bulk export to workers:** when provisioning to wrangler/Vercel/etc., pipe directly without the value ever appearing in stdout to the terminal:
  ```bash
  infisical export --env prod --path /vc --format json | npx wrangler secret bulk
  ```
  The PATH-wrapper only allows `export` when stdout is piped (not a terminal), so the above works while `infisical export … | less` does not.

## Full Documentation

See `docs/infra/secrets-management.md` for complete Infisical setup, rotation policies, and architecture.
