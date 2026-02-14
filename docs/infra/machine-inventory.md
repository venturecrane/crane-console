# Machine Inventory

Development machines for Venture Crane operations. All machines are connected via Tailscale.

## Quick Reference

| Machine | SSH Alias | OS                         | Arch   | Tailscale IP   | Primary Use                    |
| ------- | --------- | -------------------------- | ------ | -------------- | ------------------------------ |
| mac23   | `mac23`   | macOS 26.2                 | arm64  | 100.115.75.103 | Primary dev (Captain's Mac)    |
| mini    | `mini`    | Ubuntu 24.04 LTS           | x86_64 | 100.105.134.85 | Server (always-on, CI runners) |
| mbp27   | `mbp27`   | Ubuntu 24.04 LTS (Xubuntu) | x86_64 | 100.73.218.64  | Secondary dev workstation      |
| think   | `think`   | Ubuntu 24.04 LTS (Xubuntu) | x86_64 | 100.69.57.3    | Secondary dev workstation      |
| m16     | `m16`     | macOS 26.2                 | arm64  | 100.119.24.42  | Field dev (portable)           |
| ~~mba~~ | —         | —                          | —      | —              | **RETIRED — replaced by m16**  |

## SSH Access

All machines use Tailscale for connectivity. SSH key: `~/.ssh/id_ed25519`

```bash
# From any machine on Tailscale network
ssh mini       # Ubuntu server (mac mini)
ssh mac23      # macOS (Captain's Mac)
ssh mbp27      # Xubuntu workstation
ssh think      # Xubuntu workstation (ThinkPad)
ssh m16        # macOS (MacBook Air - field)
```

## Machine Details

### mac23 (Primary Dev Mac)

- **Hostname:** mac23
- **SSH alias:** `mac23`
- **OS:** macOS 26.2 (Darwin)
- **Architecture:** arm64 (Apple Silicon)
- **Tailscale IP:** 100.115.75.103
- **Local IP:** N/A (primary machine)
- **User:** scottdurgan
- **Role:** Primary development machine, Claude Code sessions

### mini (Ubuntu Server)

- **Hostname:** mini
- **SSH alias:** `mini`, `mini-local`
- **OS:** Ubuntu 24.04.3 LTS
- **Architecture:** x86_64
- **CPU:** Intel Core i7-3615QM @ 2.30GHz (4 cores / 8 threads, boost to 3.3GHz)
- **RAM:** 16GB
- **Tailscale IP:** 100.105.134.85
- **Local IP:** 10.0.4.36
- **User:** smdurgan
- **Role:** Always-on server, background jobs, CI runners

### mbp27 (Xubuntu Workstation)

- **Hostname:** mbp27
- **SSH alias:** `mbp27` (via Tailscale MagicDNS)
- **OS:** Ubuntu 24.04.3 LTS (Xubuntu desktop)
- **Architecture:** x86_64
- **CPU:** Intel Core i7-4870HQ @ 2.50GHz (4 cores / 8 threads, boost to 3.7GHz)
- **RAM:** 16GB
- **Tailscale IP:** 100.73.218.64
- **User:** scottdurgan
- **Role:** Secondary dev workstation

### think (Xubuntu ThinkPad)

- **Hostname:** think
- **SSH alias:** `think` (via Tailscale MagicDNS)
- **OS:** Ubuntu 24.04.3 LTS (Xubuntu desktop)
- **Architecture:** x86_64
- **CPU:** Intel Core i5-4300U @ 1.90GHz (2 cores / 4 threads, boost to 2.9GHz)
- **RAM:** 8GB
- **Tailscale IP:** 100.69.57.3
- **User:** scottdurgan
- **Role:** Secondary dev workstation (ThinkPad laptop)

### m16 (MacBook Air - Field)

- **Hostname:** m16
- **SSH alias:** `m16` (via Tailscale MagicDNS)
- **OS:** macOS 26.2 (Darwin)
- **Architecture:** arm64 (Apple Silicon M1)
- **RAM:** 16GB
- **Tailscale IP:** 100.119.24.42
- **User:** scottdurgan
- **Role:** Field dev workstation (portable MacBook Air, replaces mba)
- **Hardening:** optimize-macos.sh + harden-mac.sh applied 2026-02-10
  - Firewall + stealth mode enabled
  - Reduce Transparency + Reduce Motion enabled
  - File descriptors: 524288 / 131072
  - Battery: Power Nap off, low power mode on
  - AirPlay Receiver disabled, AirDrop contacts-only
  - Tailscale DNS routing verified
  - Safari privacy defaults applied

#### Field Mode

When traveling, m16 operates as the primary dev machine alongside iPhone and iPad. iPhone provides hotspot internet; Blink Shell on iPhone/iPad connects to dev machines for quick Claude Code sessions.

**Quick sessions (Blink on iPhone/iPad):** Mosh to an always-on office dev box (`mini`, `think`, `mbp27`) via Tailscale. This is the default for first-thing-in-the-morning or end-of-night sessions where M16 is closed. Always available, zero battery impact on M16, no setup to remember. Mosh handles intermittent connectivity and network roaming better than raw SSH.

**Real work sessions:** Open M16 lid (wakes in ~1s), work directly in Ghostty + CC CLI. Best experience, local machine.

**Mid-session Blink access to M16:** When M16 is already open and active, iPhone/iPad can SSH to it over the hotspot LAN (172.20.10.x) for sub-millisecond latency. Use `m16.local` (Bonjour/mDNS) in Blink — hotspot IPs change between connections but `.local` resolves automatically.

**Why NOT to keep M16 awake overnight:** iPhone hotspot auto-disables after ~90s of no connected devices. Even with `caffeinate`, M16 loses its network path and sits awake burning battery for nothing.

**Power management for mid-session breaks:** Use `caffeinate` for short, intentional periods when stepping away from M16 but want Blink access:

```bash
# Keep m16 awake for Blink SSH sessions (prevents idle sleep, display sleep, system sleep)
caffeinate -dis &

# When done, let m16 sleep normally
killall caffeinate
```

**Field workflow:**

| Scenario                           | Target                   | Action                                    |
| ---------------------------------- | ------------------------ | ----------------------------------------- |
| Quick thought from bed/couch       | Office box via Tailscale | `mosh mini` or `mosh think` from Blink    |
| Sitting down for real work         | M16 directly             | Open lid, Ghostty + CC CLI                |
| Mid-session, stepping away briefly | M16 via hotspot          | `caffeinate -dis &`, Blink to `m16.local` |
| Done for the day                   | —                        | `killall caffeinate`, close M16 lid       |

**Tip:** When working from Blink mid-session, dim the M16 display to minimum. The display is the biggest battery draw. `caffeinate -di` (without `-s`) keeps the machine awake but allows display sleep.

### mba (RETIRED)

Retired 2026-02-09. Replaced by m16 (16GB MacBook Air M1).

- **Tailscale IP:** 100.64.15.100 (no longer active)

## Installed Tools

| Tool            | mac23    | mini    | mbp27   | think   | m16      |
| --------------- | -------- | ------- | ------- | ------- | -------- |
| Claude Code     | Yes      | Yes     | Yes     | Yes     | Yes      |
| Infisical       | v0.43.50 | v0.38.0 | v0.38.0 | v0.38.0 | v0.43.50 |
| Node.js         | 20.x     | 20.x    | 20.x    | 20.x    | 20.x     |
| GitHub CLI      | Yes      | Yes     | Yes     | Yes     | Yes      |
| tmux            | 3.6a     | 3.4     | 3.4     | 3.4     | 3.6a     |
| uv/uvx          | Yes      | N/A     | N/A     | N/A     | Yes      |
| Apple Notes MCP | Yes      | N/A     | N/A     | N/A     | Yes      |

## Infisical Setup

After installing Infisical on a machine, login is required once:

```bash
infisical login  # Opens browser for auth
```

Then in each project repo:

```bash
infisical init   # Link to venture-crane project
```

Usage:

```bash
crane vc                             # Launch agent into Venture Crane
crane ke                             # Launch agent into Kid Expenses
infisical run --path /ke -- npm run dev  # Non-agent commands still use infisical run
```

## New Machine Setup

To add a new macOS machine to the fleet, use the remote-driven bootstrap:

```bash
infisical run --path /vc -- bash scripts/bootstrap-new-mac.sh <tailscale-ip> <username> <alias>
```

See [docs/runbooks/new-mac-setup.md](../runbooks/new-mac-setup.md) for the full runbook.

For Ubuntu machines, use `scripts/bootstrap-new-box.sh` instead.

## Cloned Repos

| Repo          | mac23 | mini | mbp27 | think | m16 |
| ------------- | ----- | ---- | ----- | ----- | --- |
| crane-console | Yes   | Yes  | Yes   | Yes   | Yes |
| dc-console    | Yes   | Yes  | Yes   | Yes   | Yes |
| dfg-console   | Yes   | Yes  | Yes   | Yes   | —   |
| ke-console    | Yes   | Yes  | Yes   | Yes   | Yes |
| sc-console    | Yes   | Yes  | Yes   | Yes   | —   |
| smd-console   | Yes   | Yes  | Yes   | Yes   | —   |

## Slash Command Sync

Enterprise slash commands (8 files in `.claude/commands/`) are maintained in crane-console and synced to all venture repos via `scripts/sync-commands.sh`.

```bash
# Preview changes
bash scripts/sync-commands.sh --dry-run

# Sync to local venture repos
bash scripts/sync-commands.sh

# Sync to all fleet machines (pulls repos, then syncs)
bash scripts/sync-commands.sh --fleet
```

The sync is additive — enterprise commands are copied/overwritten, venture-specific commands (e.g., sc-console's custom commands) are preserved.

## Notes

- All SSH connections use Tailscale for reliable remote access
- SSH mesh config is managed by `scripts/setup-ssh-mesh.sh` via `~/.ssh/config.d/crane-mesh`
- For Tailscale SSH auth prompts, visit the URL shown to authorize

## Known Issues

### think & mbp27 - Tailscale DNS Resolver SERVFAIL

**Status:** Resolved (2026-02-05)

**Root cause:** Tailscale's internal DNS resolver had no upstream resolvers configured for non-Tailscale domains (`DefaultResolvers:[]`). Every non-`.ts.net` DNS query returned SERVFAIL, causing SSH timeouts, auth token refresh failures, and Infisical re-login loops.

**Resolution:** Added Cloudflare upstream nameservers (1.1.1.1, 1.0.0.1) in Tailscale admin console DNS settings. Also reverted the sshd port 2222 workaround on think (restored to port 22 only).

### API Machine Registry - think missing, mba stale

**Status:** Needs action — update Crane Context API

**Details:** The `/machines` endpoint in crane-context returns `mba` (retired) but does not include `think`. This causes `setup-ssh-mesh.sh` to skip think when running in API-driven mode, leaving it out of mesh configs on all machines.

**Fix:** Update the machines table in crane-context D1 — remove mba, add think (hostname: think, tailscale_ip: 100.69.57.3, user: scottdurgan).

### All machines - Tailscale Key Expiry (preventive)

**Status:** Needs action — disable in admin console

**Details:** Dev machines have Tailscale keys that expire periodically. Keys should be set to never expire to prevent disruptions — especially for laptops which are more likely to be offline when expiry occurs.

| Machine | Key Expiry                     |
| ------- | ------------------------------ |
| mac23   | 2026-07-20                     |
| mini    | 2026-07-19                     |
| mbp27   | 2026-07-25                     |
| think   | 2026-07-27                     |
| m16     | TBD (disable in admin console) |

**Fix:**

1. Go to https://login.tailscale.com/admin/machines
2. For each machine → "..." menu → "Disable key expiry"
3. Verify: `tailscale status --json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['Self']['KeyExpiry'])"` — should show a far-future date or empty

## Last Updated

2026-02-13
