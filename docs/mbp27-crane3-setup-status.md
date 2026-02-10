# mbp27 (Crane 3) Setup Status

**Machine:** mbp27
**Designation:** Crane 3 - Parallel Dev Track 4
**Branch Prefix:** `dev/crane3/`
**OS:** Ubuntu 24.04.3 LTS (Xubuntu)
**Local IP:** 10.0.4.121 (WiFi)
**Tailscale IP:** 100.73.218.64
**SSH:** `ssh scottdurgan@100.73.218.64`

**Last Updated:** 2026-01-26

---

## Setup Progress

### ✅ Completed

| Component        | Status | Details                                                            |
| ---------------- | ------ | ------------------------------------------------------------------ |
| SSH Access       | ✅     | Working: `ssh scottdurgan@100.73.218.64` (Tailscale)               |
| System Updates   | ✅     | `apt update && apt upgrade` completed                              |
| Base Packages    | ✅     | git, curl, wget, jq, tmux, build-essential, ca-certificates, unzip |
| Node.js          | ✅     | v24.13.0 via nvm, npm 11.6.2                                       |
| GitHub CLI       | ✅     | Authenticated as `smdurgan-llc`                                    |
| Claude Code CLI  | ✅     | v2.1.19 installed and verified                                     |
| Git Config       | ✅     | user.name, user.email, init.defaultBranch=main                     |
| SSH Key          | ✅     | Generated and added to GitHub as `mbp27`                           |
| SSH to GitHub    | ✅     | Verified working                                                   |
| Tailscale        | ✅     | Installed and authenticated at 100.73.218.64                       |
| Wrangler         | ✅     | v4.60.0 installed and authenticated                                |
| Wrangler Auth    | ✅     | CLOUDFLARE_API_TOKEN configured in ~/.bashrc                       |
| Repos Cloned     | ✅     | ~/dev/dfg-console, sc-console, crane-relay, crane-command          |
| npm Dependencies | ✅     | Installed for dfg-console, crane-relay, crane-command              |
| Designation      | ✅     | Assigned as Crane 3 (Parallel Dev Track 4)                         |
| Documentation    | ✅     | Added to parallel-dev-track-runbook.md                             |

---

## Quick Access Commands

```bash
# Connect to machine via Tailscale
ssh scottdurgan@100.73.218.64

# Verify wrangler
wrangler whoami

# Check Claude Code
claude --version

# Navigate to a repo and start working
cd ~/dev/dfg-console
git status
git fetch origin
```

---

## Usage as Crane 3

Once setup is complete, use mbp27 as parallel development track 4:

### Starting Work

```bash
# SSH to machine via Tailscale
ssh scottdurgan@100.73.218.64

# Navigate to repo
cd ~/dev/<repo-name>

# Sync with main
git fetch origin
git checkout main
git pull origin main

# Create branch with crane3 prefix
git checkout -b dev/crane3/<feature-name>

# Start Claude Code
claude
```

### Workflow Rules

- Always use `dev/crane3/` branch prefix
- One branch per track (never two instances on same branch)
- Push frequently to remote
- Create PRs for all merges to main
- Coordinate with other tracks (Host, Crane 1, Crane 2) via GitHub

---

## Integration with Factory

**Parallel Dev Track Configuration:**

| Instance | Machine         | Branch Prefix | Status  |
| -------- | --------------- | ------------- | ------- |
| Host     | mac23 (macOS)   | `dev/host/`   | Active  |
| Crane 1  | TBD (VM)        | `dev/crane1/` | Unknown |
| Crane 2  | TBD (VM)        | `dev/crane2/` | Unknown |
| Crane 3  | mbp27 (Xubuntu) | `dev/crane3/` | Active  |

---

## Next Steps

1. ✅ **Setup Complete** - mbp27 is ready for parallel development
2. **Test:** Create a test branch `dev/crane3/test-setup` to verify workflow
3. **Deploy:** Assign first parallel dev task to Crane 3
4. **Monitor:** Verify workers can deploy and access D1/R2 from mbp27

---

## Support Information

**Cloudflare Token:** Stored in Bitwarden as "Cloudflare - Workers API Token"
**Machine Inventory:** See `docs/cloudflare-token-inventory.md`
**Parallel Dev Workflow:** See `docs/process/parallel-dev-track-runbook.md`

**SSH Access via Tailscale:**

```bash
# Check Tailscale status
tailscale status | grep mbp27

# Connect via Tailscale IP
ssh scottdurgan@100.73.218.64

# Verbose SSH connection (if needed)
ssh -v scottdurgan@100.73.218.64
```

---

**Setup Owner:** Claude Sonnet 4.5
**Designated By:** Captain (2026-01-26)
**Production Ready:** ✅ 100% (Active - Ready for parallel development)
