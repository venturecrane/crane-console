# Fleet Operations

## SSH & Fleet Bootstrap

- **bootstrap-machine.sh** must add the local machine's OWN pubkey to `~/.ssh/authorized_keys`, not just fleet keys. Without it, no one can SSH in.
- When bootstrapping a new machine, follow the phases IN ORDER: Tailscale -> CLI wrapper -> bootstrap -> optimize -> mesh. Don't skip to mesh.
- The `tailscale` CLI on macOS App Store installs needs a shell wrapper script (not a symlink - symlinks crash with bundle ID error). Use `scripts/fix-tailscale-cli.sh`.
- `tailscale ssh` checks host keys against Tailscale coordination server, not local `known_hosts`. Doesn't bypass SSH key auth unless Tailscale SSH server is enabled on target.
- mac23 runs `setup-ssh-mesh.sh` (has hostname check). Other machines can't run it.

## Remote Git Conflict Patterns

- mac23 often has an active CC session pushing commits. Always `git pull --rebase` before pushing. Expect conflicts on machine-inventory.md.

## macOS Hardening

- `optimize-macos.sh` replaces old `optimize-mba.sh`. Generalized for any fleet Mac.
- Safari defaults keys guarded with `2>/dev/null || true` - may differ across macOS versions.
- Firewall signed app allowance covers Tailscale.app. Verify `tailscale ping` after enabling.

## Automated fleet updates (Hermes-on-mini)

**Architecture.** The fleet has two independent update-hygiene systems that meet at the same `fleet_health_findings` table:

1. **`unattended-upgrades` on Linux boxes** — the always-on floor. Installed by `scripts/bootstrap-unattended-upgrades.sh` via `bootstrap-machine.sh` on mini/mbp27/think. Security-only origins, no auto-reboot, runs nightly regardless of anything else. Lands security patches even when the orchestrator is offline.
2. **Hermes fleet_update orchestrator on `mini`** — weekly Sunday 07:20 systemd timer. Walks every machine via Tailscale SSH, classifies findings (OS updates, brew outdated, reboot-required, uptime, Xcode CLT, disk pressure), applies safe-auto fixes, files GitHub issues for needs-human findings, and posts a `source: 'machine'` snapshot to `/admin/fleet-health/ingest`. Findings surface in `crane_sos` under Fleet Health → Machines.

**Host roles.**

| Box               | Role                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| mini              | Orchestrator host. Only box that runs the timer.                                                                     |
| mac23             | SSH target. Permanently apply-suppressed (Captain's workstation; see `tools/hermes/fleet_update/suppressions.yaml`). |
| mbp27, think, m16 | SSH targets. Subject to both the `unattended-upgrades` floor (Linux) and orchestrator apply (all).                   |

**mac23 is not a scheduler host.** Never cron the orchestrator on mac23. The Captain's workstation is not a server and should not run unattended maintenance.

**Canary rollout.** `FLEET_UPDATE_APPLY=false` by default (classify-only). Captain flips to `true` after ~2 weeks of validating that classifications match expectations. Per-machine, per-type suppressions live in `tools/hermes/fleet_update/suppressions.yaml`.

**Canonical sources.** All orchestrator code lives in the crane-console repo under `tools/hermes/fleet_update/` and `tools/hermes/systemd/`. On mini, `/srv/crane-console` is a git clone that the systemd `ExecStartPre=` resets to `origin/main` on every run — edits to the canonical sources take effect the next Sunday. Stale-code drift is visible via the `extra.source_sha` field on ingested findings.

**Heartbeat.** `crane_sos` renders a WARN in the Fleet Health section when the newest open machine-source finding is > 10 days old — that directly implies the timer isn't firing. Since open findings are refreshed on every successful run, staleness is a reliable stuck-timer signal.

**Provisioning.** The orchestrator is NOT armed by default. See `scripts/provision-hermes-fleet-update.sh` (refuses any host other than mini) and issue #657 for the enablement checklist.

## Pending Fleet Items

- **think**: offline during fleet sync. Needs `cd ~/dev/sc-console && git pull` when it comes back online. All other repos on think will self-update on next `git pull`.

## Related Documentation

- `docs/infra/ssh-tailscale-access.md` - SSH and Tailscale setup
- `docs/infra/machine-inventory.md` - Dev machine inventory
- `docs/process/scheduled-automation-guide.md` - Timer patterns (cron, launchd, systemd, Workers, GH Actions)
- `tools/hermes/fleet_update/SKILL.md` - Per-run orchestrator execution contract
- `scripts/bootstrap-unattended-upgrades.sh` - Linux security-patch floor
- `scripts/provision-hermes-fleet-update.sh` - Orchestrator provisioner (mini-only)
