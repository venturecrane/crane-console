# Hybrid Development Approach - Summary for Review

## Overview

Use the right tool for each device's strengths rather than forcing one solution everywhere.

## The Setup

```
┌────────────────────────────┐    ┌──────────────────────────────┐
│      Ubuntu Server         │    │       mac23                  │
│     mini                   │    │   (macOS workstation)        │
│   100.105.134.85           │    │   100.115.75.103             │
│                            │    │                              │
│  - Claude sessions         │    │  - Claude sessions           │
│  - Worker deployments      │    │  - Local development         │
│  - Git repos               │    │  - Git repos                 │
└────────────────────────────┘    └──────────────────────────────┘
           ▲                                   ▲
           │                                   │
           │ SSH to both via shortcuts:        │
           │ - ssh mini                        │
           │ - ssh mac23                       │
           │                                   │
    ┌──────┴──────┐                   ┌───────┴────────┐
    │  iPad/iPhone │                   │  Any Device    │
    │              │                   │                │
    │  Blink Shell │                   │  VS Code       │
    │  SSH Client  │                   │  Remote-SSH    │
    └──────────────┘                   └────────────────┘
```

## What Each Device Does

### iPad/iPhone (Mobile)

**Tool:** Blink Shell ($19.99/year)

**Use for:**

- Starting/monitoring Claude Code CLI sessions
- Quick terminal commands
- Running builds/deployments
- Checking status/logs
- Reading code (terminal editors)
- Running `/sod`, `/eod`, `/update` commands
- Staying connected via Mosh during network switches

**Examples:**

```bash
# On iPad via Blink Shell
ssh mini
ccs
/sod
# Work with Claude...
/eod
```

### Mac (Desktop)

**Tool:** VS Code + Remote-SSH extension (free)

**Use for:**

- Heavy coding sessions
- Multi-file editing/refactoring
- Visual debugging
- Complex git operations
- Side-by-side file comparisons
- Terminal work when at desk

**Examples:**

- Open VS Code
- Connect to `mini` via Remote-SSH
- Open folder: `/home/smdurgan/dev/crane-console`
- Full IDE experience on remote files

## What You Already Have

✅ **SSH keys** - Created today, working
✅ **SSH config** - Shortcuts configured for BOTH machines:

- `ssh mini` → Ubuntu server / mini (100.105.134.85)
- `ssh mac23` → mac23 / macOS workstation (100.115.75.103)
- `ssh mini-local` → Ubuntu via local network (backup)
  ✅ **Tailscale network** - Private VPN between devices
  ✅ **Ubuntu server (mini)** - Fully configured with tools
  ✅ **mac23 Terminal** - Working with SSH access to both machines
  ✅ **SSH enabled on mac23** - Remote Login working

## What We Need to Add

### 1. Blink Shell Setup (iPad/iPhone)

- [ ] Install Blink Shell from App Store
- [ ] Import SSH key (via iCloud or manual)
- [ ] Test connection: `ssh mini`
- [ ] Verify Claude Code CLI works

### 2. VS Code Remote-SSH (Mac)

- [ ] Install Remote-SSH extension in VS Code
- [ ] Connect to `mini` host
- [ ] Open dev folder
- [ ] Test integrated terminal

### 3. Documentation Updates

- [ ] Add Blink Shell quick start
- [ ] Add VS Code Remote-SSH guide
- [ ] Add workflow examples

## Key Benefits

**1. Device-appropriate tools**

- Don't fight mobile limitations
- Don't underutilize desktop power

**2. Always accessible**

- Mobile: Quick access anywhere
- Desktop: Full power when needed

**3. Shared foundation**

- Same SSH config works everywhere
- Same server, same repos
- Same Claude sessions (via handoffs)

**4. No vendor lock-in**

- Standard SSH (works with any client)
- Open source Blink Shell
- Free VS Code extension
- Self-hosted server

**5. Connection resilience**

- Mosh on mobile (survives network changes)
- Tailscale VPN (works from anywhere)
- Local network fallback option

## Example Workflows

### Morning commute (iPhone)

```bash
# In Blink Shell
ssh mini
ccs
/sod
# Review priorities, start easy task
/update
# Put phone away, session stays alive
```

### At desk (Mac)

```bash
# In VS Code
Cmd+Shift+P → "Remote-SSH: Connect to Host" → mini
# Open project folder
# Continue where you left off
# Full IDE experience
```

### Lunch break (iPad)

```bash
# In Blink Shell
ssh mini
ccs
# Check on morning's work
# Quick fix if needed
/update
```

### Evening (Mac)

```bash
# In VS Code
# Complex refactoring
# Multi-file changes
# Git operations
# Deploy workers
/eod
```

## What This Doesn't Include

**NOT setting up:**

- ❌ Termius (moving away from this)
- ❌ VS Code on iPad (doesn't exist natively)
- ❌ code-server (browser VS Code - can add later if needed)
- ❌ Desktop development on Mac directly (staying server-based)

## Cost Summary

- **Blink Shell**: $19.99/year (free trial available)
- **VS Code**: Free
- **Remote-SSH extension**: Free
- **Tailscale**: Free tier (up to 100 devices)
- **Ubuntu server**: Already running
- **SSH keys/config**: Free, already set up

**Total new cost: $19.99/year**

## Risks & Considerations

**Low risk:**

- Blink Shell is open source (community can maintain)
- VS Code Remote-SSH is Microsoft-backed
- SSH is a universal standard
- Server is self-hosted

**Medium consideration:**

- Need to manage SSH keys across devices
- Blink Shell has annual subscription
- Mobile experience limited to terminal

**Mitigation:**

- SSH keys can be synced via iCloud Keychain
- Alternative SSH clients available if needed
- Terminal-based workflow already proven

## Decision Point

**Proceed with this approach?**

If yes, we'll:

1. Install and configure Blink Shell
2. Set up VS Code Remote-SSH
3. Test both workflows
4. Document everything
5. Retire Termius if successful

**Alternatives to consider:**

- Stick with Mac Terminal only (no mobile)
- Try Termius a bit longer (current path)
- Set up code-server for browser-based VS Code

**Your call.**
