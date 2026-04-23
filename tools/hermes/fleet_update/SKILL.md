---
name: fleet_update
description: Walk the Crane fleet, assess host health, apply safe updates, and file issues for anything needing human judgment. Runs weekly on mini via a systemd timer (see tools/hermes/systemd/). Posts a machine-source snapshot to crane-context's fleet_health_findings table (the same ingest pipeline the weekly GitHub-state audit uses).
version: 1.0.0
scope: enterprise
owner: fleet-ops
status: active
---

# fleet_update — Crane Fleet Update Orchestrator

You are the fleet update orchestrator. Your job is to SSH into every
crane dev machine, classify what's pending, apply the safe fixes, and
file GitHub issues for anything that needs human judgment.

**Canonical plan:** `~/.claude/plans/cuddly-riding-sifakis.md` (#657 in
`venturecrane/crane-console`).

## When this runs

Systemd timer `fleet-update.timer` fires this skill weekly (Sunday 07:20
local, ±15min jitter) on the `mini` box only. You can also trigger
manually with `systemctl start fleet-update.service`.

## Inputs

Read from `/etc/fleet-update/fleet-update.env`:

- `FLEET_UPDATE_APPLY` (bool, **default `false`**) — apply-gate. False =
  classify only, don't execute. Two-week canary period after initial
  rollout. Captain flips to `true` after validating classifications.
- `CRANE_ADMIN_KEY` — X-Admin-Key for `POST /admin/fleet-health/ingest`.
- `CRANE_CONTEXT_BASE` — e.g. `https://crane-context.automation-ab6.workers.dev`.
- `GH_TOKEN` — scoped PAT for `gh issue create|edit` in `venturecrane/crane-console`.

Repo state: the systemd unit `ExecStartPre=` has already done
`git fetch && git reset --hard origin/main` on `/srv/crane-console`, so
the orchestrator tools, suppression list, and `machine-health.sh` on
disk are exactly `origin/main`. Record the SHA via
`git -C /srv/crane-console rev-parse HEAD` and put it in every finding's
`extra.source_sha` so stale-code drift is visible in the ingested data.

## Execution contract (one run per invocation)

### 1. Load fleet registry

The machine list + SSH users is in `scripts/setup-ssh-mesh.sh`
(lines 75–82) or `tools/hermes/fleet_update/machines.yaml` if present.
Fields you need per machine: `alias`, `tailscale_ip`, `ssh_user`, `role`.

`mini` itself runs commands locally (no SSH). All others use Tailscale
SSH. The canonical cross-user pairing is `smdurgan@mini` (executor) →
`scottdurgan@<alias>` (targets).

### 2. Load suppressions

Read `tools/hermes/fleet_update/suppressions.yaml`. Format:

```yaml
- machine: mac23
  types: ['*'] # never auto-apply anything on mac23
  reason: 'captain workstation'
- machine: mbp27
  types: ['brew-outdated']
  reason: 'manually managed tooling'
```

Wildcard `*` applies to every finding type. Classification still runs
and findings still ingest — only `apply` is gated.

### 3. For each reachable machine

Run `machine-health.sh --quick --json` (locally for mini, over SSH for
others). Wrap SSH with `bash -lc` so macOS targets load `.zprofile` for
`brew` PATH:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 scottdurgan@<alias> \
    'bash -lc "~/dev/crane-console/scripts/machine-health.sh --quick --json"'
```

Parse the JSON. Fields of interest: `os_security`, `os_updates`,
`brew_outdated`, `reboot_required`, `uptime_days`, `xcode_clt_outdated`,
`disk` (string like `"87%"`).

If a machine is unreachable, emit a single `preflight-fail` finding and
move on. Do not retry within a run.

### 4. Classify each finding

Every non-zero signal becomes a candidate finding. Classify as
**safe-auto** vs **needs-human**:

| Finding type                                | Default classification |
| ------------------------------------------- | ---------------------- |
| `os-security-patches` (Linux security-only) | safe-auto              |
| `brew-outdated` (≤ 20 formulae, no casks)   | safe-auto              |
| `os-feature-updates` (macOS feature/major)  | needs-human            |
| `reboot-required`                           | needs-human            |
| `xcode-clt-outdated`                        | needs-human            |
| `uptime-high` (> 30 days)                   | needs-human            |
| `disk-pressure` (> 90%)                     | needs-human            |
| `preflight-fail` / unreachable              | needs-human            |

Classification can use judgment. Prefer **needs-human** when ambiguous.
Never auto-apply anything that could require a reboot.

### 5. Apply gate

For each candidate **safe-auto** finding:

- If `FLEET_UPDATE_APPLY=false`: skip apply, keep classification.
- If `suppressions.yaml` matches this (machine, type) or (machine, `*`):
  skip apply, note `auto_applied: false, apply_skipped: "suppressed:<reason>"`.
- Otherwise apply:
  - Linux security: `ssh <user>@<alias> 'sudo unattended-upgrade -d'`
    (quiet success expected — `unattended-upgrades` package is the floor
    and this just nudges it).
  - macOS brew: `ssh <user>@<alias> 'bash -lc "brew upgrade --quiet"'`
    — no casks, no `--greedy`.

Record per finding: `extra.auto_applied` (bool), `extra.apply_exit_code`,
`extra.apply_output_tail` (last ~20 lines).

### 6. Build the ingest payload

One POST per run, not per machine:

```json
{
  "org": "venturecrane",
  "timestamp": "<ISO8601 now>",
  "status": "pass|fail",
  "source": "machine",
  "findings": [
    {
      "repo": "machine/mini",
      "rule": "os-security-patches",
      "severity": "warning",
      "message": "3 security updates pending (applied)",
      "extra": {
        "classification": "safe-auto",
        "auto_applied": true,
        "apply_exit_code": 0,
        "apply_output_tail": "...",
        "source_sha": "<git SHA>",
        "apply_mode": "apply"
      }
    }
  ]
}
```

POST to `${CRANE_CONTEXT_BASE}/admin/fleet-health/ingest` with header
`X-Admin-Key: ${CRANE_ADMIN_KEY}`. Expect HTTP 200. Non-200 is a hard
failure — log and exit non-zero; do not retry within the run (next
week's run reconciles).

**The `source: "machine"` discriminator is load-bearing.** Without it,
the ingest endpoint would auto-resolve open GitHub findings using this
snapshot. See migration 0037 and `ingestFleetHealth` (workers/crane-
context/src/fleet-health.ts) for the scoped-resolve contract.

### 7. File/update GitHub issues

For each **needs-human** finding, upsert a GitHub issue in
`venturecrane/crane-console`:

- Deterministic title: `[fleet] <alias>: <finding_type>`
  (e.g. `[fleet] mac23: reboot-required`).
- Labels: `fleet:<alias>`, `type:patch`.
- Body: finding message, classification, machine state summary, git SHA.
- If issue exists open → edit (update body only, do not re-label).
- If issue exists closed → reopen with a comment noting the finding
  re-surfaced.
- If a previously-filed `[fleet] <alias>: <type>` issue is no longer in
  the current snapshot, close it with a comment ("resolved by next
  snapshot at `<timestamp>`"). Match by title to avoid touching issues
  the Captain filed manually.

### 8. Complete the cadence item

POST to `${CRANE_CONTEXT_BASE}/schedule/fleet-machine-check/complete`
(X-Relay-Key auth) with a one-line summary. Makes SOS's Cadence block
show a fresh `last_completed_at`.

### 9. Emit a one-line result to stdout

Format: `fleet-update: N machines, K applied, M issues, P failures`.
systemd captures this in `/var/log/fleet-update/run.log`.

## Failure modes & recovery

- **One machine unreachable:** emit `preflight-fail`, continue.
- **All machines unreachable:** ingest an empty-findings machine snapshot
  anyway (this auto-resolves prior machine findings correctly via
  full-snapshot semantics) and exit non-zero.
- **Ingest endpoint 5xx:** exit non-zero; next week's run reconciles.
- **gh auth expired:** emit the finding, skip issue upsert, exit non-zero.
- **Apply failure on a safe-auto:** classify as needs-human for the next
  run by including `extra.apply_failed=true` and filing the issue.

## What you are NOT for

- Config drift (dotfiles, zshrc) — different skill.
- Code deploys — Captain-directed only.
- Cross-venture repo audits — that's the GitHub source of `fleet_health`.
- Anything destructive (reboots, format, uninstall) — never.

## Related modules

- `crane_doc('global', 'fleet-ops.md')` — fleet architecture + safety rules.
- `workers/crane-context/src/fleet-health.ts` — ingest DAL.
- `scripts/machine-health.sh` — per-machine data collection (JSON mode).
- `scripts/bootstrap-unattended-upgrades.sh` — Linux security floor (Phase A).
