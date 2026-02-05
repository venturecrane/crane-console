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

### smdThink & smdmbp27 - Tailscale DNS Resolver SERVFAIL

**Status:** Active — needs fix in Tailscale admin console

**Root cause:** Tailscale's internal DNS resolver on smdThink and smdmbp27 has no upstream resolvers configured for non-Tailscale domains (`DefaultResolvers:[]`). When any process queries a non-`.ts.net` domain through Tailscale's DNS, the resolver returns SERVFAIL. This causes:
- SSH action fetches to the Tailscale control plane to timeout (`failed to fetch next SSH action: context deadline exceeded`)
- General DNS resolution failures that cascade into auth token refresh failures

The `tailscaled` journal on smdThink shows continuous `dns: resolver: forward: no upstream resolvers set, returning SERVFAIL` errors throughout the day. The ubuntu server (smdmacmini) does NOT have this issue — its DNS works correctly.

**Additionally on smdThink:** IPv6 route flapping — the route `fd6a:f3d5:5be9:1::/64` is continuously added and deleted (every 1-3 minutes), indicating the Wi-Fi interface is cycling after sleep/wake. This compounds the DNS issue by forcing Tailscale to re-establish its tunnel repeatedly.

**Symptoms:**
- SSH to smdThink times out intermittently
- `tailscale status` shows health warning: "Tailscale can't reach the configured DNS servers"
- `gh auth status` shows "token is invalid" (auth refresh DNS lookups fail)
- Infisical requires re-login more frequently than other machines
- smdmbp27 shows the same DNS health warning but is less affected (desktop, no sleep/wake cycles)
- ubuntu (smdmacmini) is unaffected

**Fix:**
1. Go to https://login.tailscale.com/admin/dns
2. Ensure "Override local DNS" has upstream resolvers configured (e.g., `1.1.1.1`, `8.8.8.8`), OR disable "Override local DNS" to let machines use their local resolvers
3. Verify on smdThink: `journalctl -u tailscaled -f` should stop showing SERVFAIL errors
4. Verify: `tailscale status` no longer shows DNS health warning

**Diagnosis commands:**
```bash
# Check for DNS SERVFAIL errors
ssh smdThink 'journalctl -u tailscaled --no-pager | grep "no upstream resolvers" | tail -5'

# Check DNS resolver config
ssh smdThink 'resolvectl status'

# Check Tailscale health
ssh smdThink 'tailscale status'  # Look for "# Health check:" line
```

### All machines - Tailscale Key Expiry (preventive)

**Status:** Needs action — disable in admin console

**Details:** All 4 dev machines have Tailscale keys that expire in ~165-173 days (July 2026). While this isn't causing current issues, keys should be set to never expire to prevent future disruptions — especially for smdThink which, as a laptop, is more likely to be offline when expiry occurs.

| Machine | Key Expiry |
|---------|-----------|
| Machine23 | 2026-07-20 |
| smdmacmini | 2026-07-19 |
| smdmbp27 | 2026-07-25 |
| smdThink | 2026-07-27 |

**Fix:**
1. Go to https://login.tailscale.com/admin/machines
2. For each machine → "..." menu → "Disable key expiry"
3. Verify: `tailscale status --json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['Self']['KeyExpiry'])"` — should show a far-future date or empty

## Last Updated

2026-02-04
