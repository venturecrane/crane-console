# Sync Admin Key Between Cloudflare and GitHub

**Problem:** CRANE_ADMIN_KEY in GitHub Secrets doesn't match CONTEXT_ADMIN_KEY in Cloudflare Worker.

**Symptom:** GitHub Actions fails with "Unauthorized - Invalid admin key" when uploading docs.

---

## Solution Options

### Option 1: Update GitHub Secret to Match Cloudflare (Recommended)

If Cloudflare has the correct key and GitHub is out of sync:

```bash
# 1. Generate a new admin key (or use existing from secure storage)
NEW_KEY=$(openssl rand -hex 32)
echo "New admin key: $NEW_KEY"

# 2. Update Cloudflare secret
cd workers/crane-context
echo "$NEW_KEY" | npx wrangler secret put CONTEXT_ADMIN_KEY

# 3. Update GitHub secret
gh secret set CRANE_ADMIN_KEY --body "$NEW_KEY"

# 4. Update your local environment
echo "export CRANE_ADMIN_KEY=\"$NEW_KEY\"" >> ~/.bashrc
source ~/.bashrc
```

### Option 2: Retrieve Existing Key from Secure Storage

If the key exists in Bitwarden or other password manager:

```bash
# 1. Get key from secure storage
# (Check Bitwarden, 1Password, or team documentation)

# 2. Update GitHub secret
gh secret set CRANE_ADMIN_KEY --body "your-key-here"

# 3. Update local environment
echo "export CRANE_ADMIN_KEY=\"your-key-here\"" >> ~/.bashrc
source ~/.bashrc
```

### Option 3: Verify Keys Match

To check if they're already in sync:

```bash
# 1. Check GitHub (only shows it exists, not value)
gh secret list | grep CRANE_ADMIN_KEY

# 2. Check Cloudflare (only shows it exists, not value)
cd workers/crane-context
npx wrangler secret list | grep CONTEXT_ADMIN_KEY

# 3. Test with your local key
export CRANE_ADMIN_KEY="your-local-key"
./scripts/test-context-worker-crud.sh
```

---

## Root Cause

The admin key exists in three places:

1. **Cloudflare Worker** (as CONTEXT_ADMIN_KEY) - authoritative source
2. **GitHub Secrets** (as CRANE_ADMIN_KEY) - for CI/CD
3. **Local environment** (as CRANE_ADMIN_KEY) - for manual ops

These must all match exactly (64-character hex string).

---

## Prevention

After syncing keys:

1. **Document the key** in team password manager
2. **Update setup checklist** with retrieval instructions
3. **Test GitHub Actions** by pushing a doc change
4. **Test local** with `./scripts/test-context-worker-crud.sh`

---

## Current Status (2026-01-24)

- ✗ GitHub Secret is out of sync with Cloudflare
- ✗ Local environment missing CRANE_ADMIN_KEY
- ✓ GitHub Actions configured to use secret
- ✓ Upload script configured correctly

**Next Action:** Sync the keys using Option 1 or 2 above.
