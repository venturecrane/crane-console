# Machine Inventory

Development machines for Venture Crane operations. All machines are connected via Tailscale.

## Quick Reference

| Machine | SSH Alias | OS | Arch | Tailscale IP | Primary Use |
|---------|-----------|-----|------|--------------|-------------|
| Machine23.local | `mac` | macOS 26.2 | arm64 | 100.115.75.103 | Primary dev (Captain's Mac) |
| smdmacmini | `ubuntu` | Ubuntu 24.04 LTS | x86_64 | 100.105.134.85 | Server (always-on, CI runners) |
| smdmbp27 | `smdmbp27` | Ubuntu 24.04 LTS (Xubuntu) | x86_64 | 100.73.218.64 | Secondary dev workstation |
| smdThink | `smdThink` | Ubuntu 24.04 LTS (Xubuntu) | x86_64 | (discovered at runtime) | Secondary dev workstation |

## SSH Access

All machines use Tailscale for connectivity. SSH key: `~/.ssh/id_ed25519`

```bash
# From any machine on Tailscale network
ssh ubuntu      # Ubuntu server (smdmacmini)
ssh mac         # Machine23 (macOS)
ssh smdmbp27    # Xubuntu workstation
ssh smdThink    # Xubuntu workstation (ThinkPad)
```

## Machine Details

### Machine23.local (Primary Dev Mac)

- **Hostname:** Machine23.local
- **SSH alias:** `mac`, `localhost`
- **OS:** macOS 26.2 (Darwin)
- **Architecture:** arm64 (Apple Silicon)
- **Tailscale IP:** 100.115.75.103
- **Local IP:** N/A (primary machine)
- **User:** scottdurgan
- **Role:** Primary development machine, Claude Code sessions

### smdmacmini (Ubuntu Server)

- **Hostname:** smdmacmini
- **SSH alias:** `ubuntu`, `ubuntu-local`
- **OS:** Ubuntu 24.04.3 LTS
- **Architecture:** x86_64
- **Tailscale IP:** 100.105.134.85
- **Local IP:** 10.0.4.36
- **User:** smdurgan
- **Role:** Always-on server, background jobs, CI runners

### smdmbp27 (Xubuntu Workstation)

- **Hostname:** smdmbp27
- **SSH alias:** `smdmbp27` (via Tailscale MagicDNS)
- **OS:** Ubuntu 24.04.3 LTS (Xubuntu desktop)
- **Architecture:** x86_64
- **Tailscale IP:** 100.73.218.64
- **User:** scottdurgan
- **Role:** Secondary dev workstation

### smdThink (Xubuntu ThinkPad)

- **Hostname:** smdThink
- **SSH alias:** `smdThink` (via Tailscale MagicDNS)
- **OS:** Ubuntu 24.04.3 LTS (Xubuntu desktop)
- **Architecture:** x86_64
- **Tailscale IP:** discovered at runtime by `scripts/setup-ssh-mesh.sh`
- **User:** scottdurgan
- **Role:** Secondary dev workstation (ThinkPad laptop)

## Installed Tools

| Tool | Machine23 | smdmacmini | smdmbp27 | smdThink |
|------|-----------|------------|----------|----------|
| Claude Code | Yes | Yes | Yes | Yes |
| Infisical | v0.43.50 | v0.38.0 | v0.38.0 | v0.38.0 |
| Node.js | 20.x | 20.x | 20.x | 20.x |
| GitHub CLI | Yes | Yes | Yes | Yes |

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
infisical run --path /vc -- claude   # Inject VC secrets
infisical run --path /ke -- npm run dev  # Inject KE secrets
```

## Notes

- All SSH connections use Tailscale for reliable remote access
- SSH mesh config is managed by `scripts/setup-ssh-mesh.sh` via `~/.ssh/config.d/crane-mesh`
- The `ubuntu` alias connects to smdmacmini (naming is historical)
- For Tailscale SSH auth prompts, visit the URL shown to authorize

## Known Issues

### smdThink - Tailscale Key Expiry

**Status:** Needs fix (disable key expiry)

**Root cause:** Tailscale node keys expire by default. When smdThink (a laptop) sleeps and wakes, it fails to re-register if the key has expired, taking the node offline. This causes SSH timeouts from the deploy script and likely explains the `gh` CLI and Infisical auth failures — when Tailscale is down, auth token refreshes fail silently, and the stale tokens get invalidated.

**Symptoms:**
- SSH to smdThink times out from deploy script
- `gh auth status` shows "token is invalid"
- Infisical requires re-login more frequently than other machines
- Other machines (smdmbp27, ubuntu) remain stable

**Fix:**
1. Go to https://login.tailscale.com/admin/machines
2. Find smdThink → "..." menu → "Disable key expiry"
3. On smdThink, run: `sudo tailscale up --accept-risk=lose-ssh`
4. Verify: `tailscale status` shows smdThink without expiry warning

**Workaround (immediate):**
Reauthorize smdThink from the admin console when it drops off, then SSH in and re-run `gh auth login` and `infisical login`.

## Last Updated

2026-02-04
