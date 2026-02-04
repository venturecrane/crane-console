# Machine Inventory

Development machines for Venture Crane operations. All machines are connected via Tailscale.

## Quick Reference

| Machine | SSH Alias | OS | Arch | Tailscale IP | Primary Use |
|---------|-----------|-----|------|--------------|-------------|
| Machine23.local | `mac` | macOS 26.2 | arm64 | 100.115.75.103 | Primary dev (Captain's Mac) |
| smdmacmini | `ubuntu` | Ubuntu 24.04 LTS | x86_64 | 100.105.134.85 | Server (always-on, CI runners) |
| smdmbp27 | `smdmbp27` | Ubuntu 24.04 LTS (Xubuntu) | x86_64 | 100.73.218.64 | Secondary dev workstation |
| smdThink | `smdThink` | Ubuntu 24.04 LTS (Xubuntu) | x86_64 | via MagicDNS | Secondary dev workstation |

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
- **Tailscale IP:** via MagicDNS (smdthink)
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
- smdmbp27 and smdThink are not in ~/.ssh/config but work via Tailscale MagicDNS
- The `ubuntu` alias connects to smdmacmini (naming is historical)
- For Tailscale SSH auth prompts, visit the URL shown to authorize

## Known Issues

### smdThink - Recurring Auth Problems

**Status:** Needs investigation

smdThink repeatedly loses authentication for `gh` CLI and Infisical while other machines remain stable. This has happened multiple times now.

**Symptoms:**
- `gh auth status` shows "token is invalid"
- Infisical requires re-login more frequently than other machines

**TODO:**
- [ ] Investigate why auth tokens expire/invalidate on this machine
- [ ] Check if keyring/credential storage is configured differently
- [ ] Compare auth token storage between smdThink and smdmbp27 (both Xubuntu)
- [ ] Consider if this is related to the machine being a laptop (sleep/hibernate cycles?)

## Last Updated

2026-02-04
