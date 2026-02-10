# Machine Inventory

## Fleet Overview

| Hostname  | Hardware        | OS            | Role         | SSH Access  | Dev Path          | Notes                |
| --------- | --------------- | ------------- | ------------ | ----------- | ----------------- | -------------------- |
| **mac23** | MacBook Pro     | macOS         | Main machine | Local only  | `~/Documents/...` | Primary workstation  |
| **mbp27** | Old MacBook Pro | Xubuntu       | Dev machine  | `ssh mbp27` | `~/dev/`          | Always on, Tailscale |
| **think** | Old ThinkPad    | Xubuntu       | Dev machine  | `ssh think` | `~/dev/`          | Always on, Tailscale |
| **mini**  | Old Mac Mini    | Ubuntu Server | Dev machine  | `ssh mini`  | `~/dev/`          | Always on, Tailscale |
| crane1    | UTM VM on mac23 | macOS         | Experimental | -           | -                 | Not active           |
| crane2    | UTM VM on mac23 | macOS         | Experimental | -           | -                 | Not active           |

## Standard Path Convention

All remote dev machines use a standard path structure:

```
~/dev/
├── crane-console/      # VC infrastructure (venturecrane)
├── smd-console/        # SMD venture (smdurgan)
├── dfg-console/        # DFG venture (durganfieldguide)
├── sc-console/         # SC venture (siliconcrane)
└── ke-console/         # KE venture (kidexpenses)
```

**Why `~/dev/`?**

- Consistent across all remote machines
- Easy to automate with `deploy-to-fleet.sh`
- Predictable paths for scripts and SSH commands

**Deploy to Fleet:**

```bash
# Clone a new venture to all dev machines
./scripts/deploy-to-fleet.sh <github-org> <repo-name>

# Example: Deploy smd-console everywhere
./scripts/deploy-to-fleet.sh smdurgan smd-console
```

## Dev Machine Details

### mbp27 (Xubuntu)

- **Hardware:** Old MacBook Pro
- **OS:** Xubuntu
- **Dev path:** `~/dev/`
- **User:** scottdurgan
- **Always on:** Yes
- **Tailscale:** Yes
- **Use for:** Remote development via SSH/mosh from mobile

### think (Xubuntu)

- **Hardware:** Old ThinkPad
- **OS:** Xubuntu
- **Dev path:** `~/dev/`
- **User:** scottdurgan
- **Always on:** Yes
- **Tailscale:** Yes
- **Use for:** Remote development via SSH/mosh from mobile

### mini (Ubuntu Server)

- **Hardware:** Old Mac Mini
- **OS:** Ubuntu Server
- **Dev path:** `~/dev/`
- **User:** smdurgan
- **SSH alias:** `mini`
- **Always on:** Yes
- **Tailscale:** Yes
- **Use for:** Remote development via SSH/mosh from mobile

## Mobile Development (iPad/iPhone via Blink Shell)

**Recommended targets:** mbp27, think, or mini (not mac23)

**Why not mac23?**

- macOS stores Claude Code auth in system Keychain
- Keychain can't be unlocked over SSH without GUI
- Results in "Invalid API key" errors

**Linux dev machines work better because:**

- Claude Code stores credentials in `~/.claude/` (no GUI required)
- Always on and externally accessible
- Spool system deployed for offline resilience

### Quick Start from Blink Shell

```bash
# Connect to a dev machine
mosh mbp27

# Navigate to project
cd ~/dev/crane-console

# Start Claude Code
claude
```

## Installed Tools (Dev Machines)

All dev machines have:

- Claude Code CLI
- Tailscale
- mosh
- The spool system (`ai-spool-flush`, `ai-sesh`, `ai-end`)
- `/sod` and `/eod` commands

## Last Updated

2026-02-04
