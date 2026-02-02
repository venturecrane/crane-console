# Machine Inventory

## Fleet Overview

| Hostname | Hardware | OS | Role | SSH Access | Notes |
|----------|----------|-----|------|------------|-------|
| **machine23** | MacBook Pro | macOS | Main machine | Local only | Primary workstation |
| **smdmbp27** | Old MacBook Pro | Xubuntu | Dev machine | `ssh smdmbp27` | Always on, Tailscale |
| **smdThink** | Old ThinkPad | Xubuntu | Dev machine | `ssh smdThink` | Always on, Tailscale |
| **smdmacmini** | Old Mac Mini | Ubuntu Server | Dev machine | `ssh ubuntu` | Always on, Tailscale |
| crane1 | UTM VM on machine23 | macOS | Experimental | - | Not active |
| crane2 | UTM VM on machine23 | macOS | Experimental | - | Not active |

## Dev Machine Details

### smdmbp27 (Xubuntu)
- **Hardware:** Old MacBook Pro
- **OS:** Xubuntu
- **crane-console path:** `~/dev/crane-console`
- **User:** scottdurgan
- **Always on:** Yes
- **Tailscale:** Yes
- **Use for:** Remote development via SSH/mosh from mobile

### smdThink (Xubuntu)
- **Hardware:** Old ThinkPad
- **OS:** Xubuntu
- **crane-console path:** `~/crane-console` (verify)
- **User:** scottdurgan
- **Always on:** Yes
- **Tailscale:** Yes
- **Use for:** Remote development via SSH/mosh from mobile

### smdmacmini / ubuntu (Ubuntu Server)
- **Hardware:** Old Mac Mini
- **OS:** Ubuntu Server
- **crane-console path:** `~/crane-console`
- **User:** smdurgan
- **SSH alias:** `ubuntu`
- **Always on:** Yes
- **Tailscale:** Yes
- **Use for:** Remote development via SSH/mosh from mobile

## Mobile Development (iPad/iPhone via Blink Shell)

**Recommended targets:** smdmbp27, smdThink, or ubuntu (not machine23)

**Why not machine23?**
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
mosh smdmbp27

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
2026-02-01
