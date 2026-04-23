# Hermes Telegram Gateway — Operations Runbook

**Host:** `mini` (smdurgan@, 100.105.134.85) · user systemd service with linger · installed 2026-04-23
**Model:** `anthropic/claude-sonnet-4.6` via OpenRouter (matches m16 config)
**Backup:** `m16` (scottdurgan@). Hermes installed; gateway kept disabled by default so only one box polls the Telegram bot token at a time.

## What this runbook covers

Daily ops (start/stop/status/logs), model switching, failover between mini and m16 for travel, secret rotation, the post-`hermes update` crane_tools patch, and a short troubleshooting section.

## Stack on mini

| Layer                 | State                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hermes Agent          | v1.0.0 in `~/.hermes/hermes-agent/venv/`, symlinked at `/usr/local/bin/hermes`                                                                                                                                                                                                                                                                                           |
| Ollama                | systemd `ollama.service`, `OLLAMA_CONTEXT_LENGTH=4096` drop-in                                                                                                                                                                                                                                                                                                           |
| Models                | `qwen2.5-coder:7b` pulled (4.6 GB) — **experimental only**, see perf note below                                                                                                                                                                                                                                                                                          |
| Gateway service       | `hermes-gateway.service` user unit (`~/.config/systemd/user/`), linger enabled for `smdurgan`                                                                                                                                                                                                                                                                            |
| Config                | `~/.hermes/config.yaml` — provider openrouter, default `anthropic/claude-sonnet-4.6`, toolsets pruned to `[web, terminal, file, todo, memory, cronjob]`                                                                                                                                                                                                                  |
| Secrets               | `~/.hermes/.env` (mode 600) — holds `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, `CRANE_CONTEXT_KEY`, etc. Long-term plan: re-materialize from Infisical via `scripts/hermes-env-sync.sh`.                                                                                                                                                      |
| Crane MCP integration | `~/.hermes/hermes-agent/model_tools.py` patched with `"tools.crane_tools"` entry. **`crane_tools.py` module itself is NOT deployed on mini** — model_tools references it but the import fails silently, so crane tools are not currently exposed to Hermes. See `scripts/hermes-verify-patch.sh` (exits 4 = DEGRADED). Filed as follow-up; see Known follow-ups section. |
| CPU tuning            | governor=performance, `vm.swappiness=10` (persistent via `/etc/sysctl.d/99-hermes-ollama.conf`)                                                                                                                                                                                                                                                                          |

## Performance reality (important context)

Mini is a 2012 i7-3615QM (Ivy Bridge) — **no AVX2**. That limitation is load-bearing:

- **Anthropic via OpenRouter (default):** 5-15s per turn end-to-end. Production-usable for Telegram.
- **Ollama qwen2.5-coder:7b (`hermes model` switch):** ~10+ min per turn just for prompt-eval due to Hermes's 4k+ token base system prompt. **Not production-usable on this hardware**; installed as a capability demo and for future experiments on better hardware.

If you want fast local inference, the path forward is either pruning Hermes's system prompt further (hard — requires engineering) or moving to an AVX2+ host.

## Daily operations

```bash
# Status
ssh mini 'systemctl --user status hermes-gateway --no-pager'
ssh mini 'hermes gateway status'

# Logs (tail)
ssh mini 'journalctl --user -u hermes-gateway -f'

# Logs (last hour)
ssh mini 'journalctl --user -u hermes-gateway --since "1 hour ago"'

# Restart
ssh mini 'systemctl --user restart hermes-gateway'

# Stop / start
ssh mini 'systemctl --user stop hermes-gateway'
ssh mini 'systemctl --user start hermes-gateway'
```

## Starting for the first time (or after any stop)

Before starting mini's gateway, **confirm m16's gateway is stopped** — one Telegram bot token = one active poller.

```bash
# 1. On m16 (or Captain's phone over Blink):
hermes gateway stop
# verify:
hermes gateway status

# 2. Verify nobody else is polling (from any box with TELEGRAM_BOT_TOKEN):
bash scripts/hermes-poller-check.sh
# Expect: pending updates climbing if you send a test DM while paused.

# 3. Start mini:
ssh mini 'systemctl --user start hermes-gateway'
ssh mini 'journalctl --user -u hermes-gateway -f'
# Expect: poll loop output, Telegram API 200s, no 401/402 errors.
```

## Failover between mini and m16 (for travel)

When you're traveling with m16 and mini may be offline or unreachable, swap the active poller:

```bash
# A. Stop the currently-active box
ssh mini 'systemctl --user stop hermes-gateway'
# (OR on m16 to reverse direction: `hermes gateway stop`)

# B. Verify it actually stopped polling
bash scripts/hermes-poller-check.sh
# pending_update_count should start climbing within ~30s (assuming you send a test DM)

# C. Start the other box
# On m16:
hermes gateway start
# OR on mini:
ssh mini 'systemctl --user start hermes-gateway'

# D. Confirm handoff — send a test DM; new box should respond.
```

**Hazard:** starting both simultaneously causes Telegram's `getUpdates` to race between pollers. Captain sees a subset of messages on each box and silent losses. Always stop-then-start, never overlap.

## Switching inference model / provider

Via interactive wizard (recommended):

```bash
ssh mini 'hermes model'
# Pick provider + model from menu.
```

To set manually in `~/.hermes/config.yaml`:

```yaml
model:
  default: anthropic/claude-opus-4.6 # or claude-sonnet-4.6, claude-haiku-*
  provider: openrouter
  base_url: https://openrouter.ai/api/v1
```

Then restart the service to pick up changes:

```bash
ssh mini 'systemctl --user restart hermes-gateway'
```

### Switching to local Ollama (experimental, slow)

```bash
# On mini:
# 1. Set env for Ollama routing
cat >> ~/.hermes/.env <<'EOF'
LLM_MODEL=qwen2.5-coder:7b
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
EOF
# 2. Restart service
systemctl --user restart hermes-gateway
```

Expect 5-15 min per turn on mini. To switch back, remove those three lines and restart.

## Secret rotation (OpenRouter, Telegram, crane-context keys)

```bash
# 1. Update the value in Infisical (path /vc or /vc/vault as appropriate)
# 2. Re-materialize on mini:
ssh mini 'cd ~/dev/crane-console && git pull && bash scripts/hermes-env-sync.sh'
# 3. Restart service
ssh mini 'systemctl --user restart hermes-gateway'
```

Note: `hermes-env-sync.sh` preserves only the keys in its `MAIN_KEYS` / `VAULT_KEYS` / `STATIC` lists. If you've manually added other keys to `~/.hermes/.env`, they get overwritten. For additional vars (e.g., `HERMES_MAX_ITERATIONS`), edit the script.

## After `hermes update` on mini

Hermes update overwrites `model_tools.py`, removing the crane_tools discovery entry. **Always re-run the patch + verify sequence after an update:**

```bash
ssh mini 'bash /home/smdurgan/dev/crane-console/scripts/hermes-verify-patch.sh'
# If exit=2 (PATCH NEEDED), reapply with:
ssh mini 'python3 -c "
from pathlib import Path
f = Path.home() / \".hermes/hermes-agent/model_tools.py\"
t = f.read_text()
old = \"\\\"tools.honcho_tools\\\",\\n    ]\"
new = \"\\\"tools.honcho_tools\\\",\\n        \\\"tools.crane_tools\\\",\\n    ]\"
if old in t and \"tools.crane_tools\" not in t:
    f.write_text(t.replace(old, new, 1)); print(\"patched\")
elif \"tools.crane_tools\" in t: print(\"already patched\")
else: print(\"REGEX DID NOT MATCH — manual fix required\")
"'
# Re-verify:
ssh mini 'bash /home/smdurgan/dev/crane-console/scripts/hermes-verify-patch.sh'
# Expect: OK: crane_tools registered once
ssh mini 'systemctl --user restart hermes-gateway'
```

Alternative (one-shot via launcher): `crane vc --hermes -p "ok"` from mini — runs `setupHermesMcp()` which applies the same patch. Either path works.

## Troubleshooting

### Service refuses to start (Active: failed)

```bash
journalctl --user -u hermes-gateway -n 50
# Look for:
# - "Invalid refresh token" → hermes login <provider>
# - "Insufficient credits" (402) → top up at openrouter.ai/settings/credits
# - "model not found" → hermes config set model.default <valid-id>
# - ConnectionError Telegram → check TELEGRAM_BOT_TOKEN in .env
```

### Captain's DMs not getting responses

Likely one of:

1. Service isn't running → `systemctl --user status hermes-gateway`
2. Two pollers active (mini + m16) → run `scripts/hermes-poller-check.sh`, stop one
3. Credits exhausted → top up OpenRouter
4. Telegram auth issue → check `TELEGRAM_BOT_TOKEN` in `.env`

### Crane tools not appearing in Hermes responses

```bash
ssh mini 'bash ~/dev/crane-console/scripts/hermes-verify-patch.sh'
# Expect exit 0. If exit 2, re-apply per "After hermes update" section above.
```

### Memory exhaustion under load

```bash
ssh mini 'free -h; ps auxf --sort=-%mem | head -10'
# If Ollama runner is running and eating RAM but we're not using Ollama:
ssh mini 'sudo systemctl stop ollama'
# Ollama only needs to run when hermes is configured to use it.
```

## Known follow-ups (filed as separate issues)

- **Source & version-control `crane_tools.py`.** The launcher's `setupHermesMcp()` patches `model_tools.py` to register `tools.crane_tools`, but the module itself is not in the crane-console repo and is missing from mini / mbp27 / mac23. Hermes silently skips the failing import. Need to locate the canonical file (likely on m16 from a manual Mar 2 setup), commit it to the repo under `templates/hermes/tools/crane_tools.py` or similar, and update `setupHermesMcp()` to copy it alongside patching.
- Upgrade Hermes on mini from v1.0.0 → latest (v2026.4.x). Mini as canary, then m16.
- Reap orphaned crane task worktrees in `/home/smdurgan/.crane/tasks/` (4 stale dirs from Feb-Apr).
- Evaluate Telegram webhook routing vs long-polling to eliminate the one-poller-per-token constraint.
- Migrate `TELEGRAM_*` + `ANTHROPIC_API_KEY` to Infisical-driven `hermes-env-sync.sh` flow for proper rotation hygiene. (Currently the values live in mini's `.env` inherited from the Mar 2 fleet deploy.)

## References

- Plan: `.claude/plans/frolicking-mapping-sunbeam.md` (session plan)
- Launcher integration: `packages/crane-mcp/src/cli/launch-lib.ts:1359-1383` (`setupHermesMcp`), `:1603-1623` (hermes env handling)
- Scripts: `scripts/hermes-env-sync.sh`, `scripts/hermes-verify-patch.sh`, `scripts/hermes-poller-check.sh`
- Upstream: https://github.com/NousResearch/hermes-agent
