# Cloudflare Token Revocation Checklist

**Purpose:** Safely revoke the old "Edit Cloudflare Workers" token after all machines migrate to new token.

**Date:** 2026-01-26

---

## ⚠️ IMPORTANT: DO NOT REVOKE UNTIL ALL MACHINES UPDATED

The old token was rolled to generate the new token. Revoking the old token will break any machines still using it.

---

## Pre-Revocation Checklist

Before revoking the old token, verify ALL machines are using the new token:

### Machine Status

| Machine                   | Status     | Verification Command | Result                            |
| ------------------------- | ---------- | -------------------- | --------------------------------- |
| mac23 (macOS)             | ✅ UPDATED | `wrangler whoami`    | Working with new token            |
| Ubuntu Server (10.0.4.36) | ⏸️ PENDING | SSH not reachable    | Need to verify when accessible    |
| mbp27 (10.0.4.121)        | ⏸️ PENDING | SSH not reachable    | Need to configure when accessible |
| Crane 1 VM                | ❓ UNKNOWN | TBD                  | Need to investigate if exists     |
| Crane 2 VM                | ❓ UNKNOWN | TBD                  | Need to investigate if exists     |

### Required Actions Before Revocation

- [x] New token created and saved to Bitwarden
- [x] mac23 configured and verified
- [ ] Ubuntu Server configured and verified
- [ ] mbp27 configured and verified
- [ ] Crane VMs investigated and configured (if they exist)
- [ ] All CI/CD pipelines checked (none found yet)
- [ ] All repos checked for hardcoded token references

---

## Search for Hardcoded Token References

**CRITICAL:** Check if the old token is hardcoded anywhere:

```bash
# Search crane-console
cd ~/Documents/SMDurgan\ LLC/Projects/crane-console
grep -r "CLOUDFLARE.*TOKEN" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude="*.md"

# Check .env files
find . -name ".env*" -type f ! -name "*.example" -exec grep -l "CLOUDFLARE" {} \;

# Check wrangler.toml files
find . -name "wrangler.toml" -exec grep -l "token" {} \;

# Check GitHub Actions
find .github/workflows -name "*.yml" -exec grep -l "CLOUDFLARE" {} \;
```

**If any hardcoded references found:** Update them with the new token before revoking.

---

## Revocation Steps (Execute ONLY when checklist complete)

### Step 1: Final Verification

Test wrangler on each machine one more time:

```bash
# On each machine:
wrangler whoami
# Should show: automation@smdurgan.com with Workers permissions
# Should say: "The API Token is read from the CLOUDFLARE_API_TOKEN environment variable"
```

### Step 2: Revoke Old Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Find the token named "Edit Cloudflare Workers"
3. Click the "..." menu
4. Click "Revoke"
5. Confirm revocation

### Step 3: Verify No Breakage

After revocation, test on all machines again:

```bash
# mac23
wrangler whoami

# Ubuntu Server (when accessible)
ssh scottdurgan@10.0.4.36 "wrangler whoami"

# mbp27 (when accessible)
ssh scottdurgan@10.0.4.121 "wrangler whoami"
```

**Expected:** All should still work with new token
**If broken:** Check that CLOUDFLARE_API_TOKEN is actually set in environment

### Step 4: Update Inventory

Update docs/cloudflare-token-inventory.md with revocation date:

```markdown
## Token History

| Date       | Action      | Token Name              | Status  |
| ---------- | ----------- | ----------------------- | ------- |
| 2026-01-26 | Created     | crane-org-workers       | Active  |
| 2026-01-26 | Rolled from | Edit Cloudflare Workers | Revoked |
```

---

## Rollback Plan (If Something Breaks)

If revocation causes issues:

1. **Immediately create a new token:**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Create Token → Edit Cloudflare Workers template
   - Copy new token

2. **Update all machines ASAP:**

   ```bash
   # Update ~/.bashrc or ~/.zshrc on each machine
   export CLOUDFLARE_API_TOKEN="new-emergency-token"
   ```

3. **Root cause analysis:**
   - Which machine broke?
   - Was it using an old token that wasn't updated?
   - Was there a hardcoded reference somewhere?

---

## Current Status

**DO NOT REVOKE YET** - Remote machines (Ubuntu Server, mbp27) are not reachable from mac23.

**Blockers:**

- mbp27 (10.0.4.121) - No route to host
- Ubuntu Server (10.0.4.36) - No route to host

**Next Steps:**

1. User needs to power on/verify network access to remote machines
2. Configure remote machines with new token
3. Verify all machines working
4. Then revoke old token

---

**Last Updated:** 2026-01-26
**Safe to Revoke:** NO - Waiting for remote machine access
