# Cloudflare API Token Inventory

**Purpose:** Track all machines/environments that need the shared `CLOUDFLARE_API_TOKEN` for wrangler CLI operations.

**Token Name:** Cloudflare - Workers API Token (crane-org-workers)
**Token Storage:** Bitwarden → Infrastructure folder
**Token Value:** `<CLOUDFLARE_API_TOKEN>`
**Created:** 2026-01-26 (rolled from existing "Edit Cloudflare Workers" token)
**Permissions:** Account.Workers (All accounts, All zones)

---

## Machines Requiring Token

### 1. mac23 (Current MacBook)
- **OS:** macOS (Darwin 25.2.0)
- **Hostname:** mac23
- **Shell:** zsh
- **Config File:** `~/.zshrc`
- **Status:** ❌ NOT SET - Needs configuration
- **Current Auth:** OAuth (wrangler login via browser)
- **Action Required:** Add `export CLOUDFLARE_API_TOKEN="..."` to ~/.zshrc

### 2. Ubuntu Server (mini)
- **OS:** Ubuntu Server 24.04
- **Hostname:** mini / smdubuntu
- **IP:** 10.0.4.36 (LAN), 100.105.134.85 (Tailscale)
- **Shell:** bash
- **Config File:** `~/.bashrc`
- **Status:** ✅ CONFIGURED (from validation report)
- **Action Required:** Verify token is the new shared one, update if needed

### 3. mbp27 (Xubuntu Development Box)
- **OS:** Ubuntu 24.04.3 LTS (Xubuntu)
- **Hostname:** mbp27
- **IP:** 10.0.4.121
- **Shell:** bash
- **Config File:** `~/.bashrc`
- **Status:** ❌ NOT SET - BLOCKS SETUP
- **Current State:** Wrangler installed, OAuth timed out over SSH
- **Action Required:** Add token to ~/.bashrc, test with `wrangler whoami`
- **Priority:** HIGH - blocking mbp27 initial setup

### 4. Crane 1 (VM - Status Unknown)
- **Purpose:** Parallel dev track 2
- **Branch Prefix:** `dev/crane1/`
- **Status:** ⚠️ UNKNOWN - needs investigation
- **Action Required:** Determine if this VM exists, if so, check token configuration

### 5. Crane 2 (VM - Status Unknown)
- **Purpose:** Parallel dev track 3
- **Branch Prefix:** `dev/crane2/`
- **Status:** ⚠️ UNKNOWN - needs investigation
- **Action Required:** Determine if this VM exists, if so, check token configuration

---

## Configuration Commands

### macOS (mac23)
```bash
echo 'export CLOUDFLARE_API_TOKEN="<CLOUDFLARE_API_TOKEN>"' >> ~/.zshrc
source ~/.zshrc
wrangler whoami
```

### Ubuntu/Linux (mbp27, Ubuntu Server)
```bash
echo 'export CLOUDFLARE_API_TOKEN="<CLOUDFLARE_API_TOKEN>"' >> ~/.bashrc
source ~/.bashrc
wrangler whoami
```

### Verification
```bash
# Check token is set
echo "CLOUDFLARE_API_TOKEN length: ${#CLOUDFLARE_API_TOKEN}"  # Should be 40

# Test authentication
wrangler whoami  # Should show automation@smdurgan.com with Workers permissions
```

---

## CI/CD Environments

**Status:** None identified yet

Check for token usage in:
- GitHub Actions workflows (`.github/workflows/*.yml`)
- Vercel environment variables
- Other CI/CD pipelines

---

## Update History

| Date | Machine | Action | Status |
|------|---------|--------|--------|
| 2026-01-26 | Token created | Rolled existing "Edit Cloudflare Workers" token | ✅ |
| 2026-01-26 | Bitwarden | Saved as "Cloudflare - Workers API Token" | 🔄 In progress |
| 2026-01-26 | mac23 | Needs configuration | ⏳ Pending |
| 2026-01-26 | Ubuntu Server | Verify/update token | ⏳ Pending |
| 2026-01-26 | mbp27 | Needs initial setup | ⏳ Pending |

---

## Security Notes

- **Do not commit this token to any repository**
- Token should only exist in:
  - Bitwarden (primary secure storage)
  - Shell config files on authorized machines (`~/.bashrc` / `~/.zshrc`)
  - Environment variables during active sessions
- After all machines updated with new token, revoke old "Edit Cloudflare Workers" token from Cloudflare dashboard
- This token has broad Workers permissions - protect accordingly

---

**Last Updated:** 2026-01-26
**Maintained By:** Development Team
