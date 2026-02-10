# Bitwarden Cloudflare Tokens Cleanup Guide

**Purpose:** Clean up old/duplicate Cloudflare tokens and ensure only the new shared token is used.

**Date:** 2026-01-26

---

## Current State (Before Cleanup)

From the existing Bitwarden vault, we have these Cloudflare-related items:

| Item Name                       | Value/Content                                                    | Keep?                                          |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Cloudflare                      | Password: <REDACTED>                                             | ✅ KEEP - Dashboard login                      |
| Cloudflare - API Tokens         | KV namespace ID: c9b5d07c5ec044d2852f8dca8ff36866                | ✅ KEEP - This is a namespace ID, not a token  |
| Reset Token                     | 90d591d8c8a7c7ecb9097737aa8d847bf530138adb82116e                 | ❓ REVIEW - What is this for?                  |
| Worker DB OPS Token             | ff2e52feebee475cd08da93d8f30e31b5a73638c928bc3dd                 | ❓ REVIEW - What is this for?                  |
| workers/dfg-relay               | 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f | ✅ KEEP - This is RELAY_TOKEN (not Cloudflare) |
| Cloudflare R2 - AWS Credentials | a17fc8e5a689662ffa73a804a8fb6a40735d9fea00dceca081d0b4e2f07b7ac7 | ✅ KEEP - R2 access credentials                |

**NEW ITEM TO ADD:**
| Cloudflare - Workers API Token | <CLOUDFLARE_API_TOKEN> | ✅ ADD - New shared wrangler token |

---

## Cleanup Steps

### Step 1: Unlock Bitwarden

```bash
source scripts/bitwarden-shell-helpers.sh
bwunlock
```

### Step 2: Add New Shared Token

```bash
cat > /tmp/cf-token.json <<'EOF'
{
  "type": 2,
  "name": "Cloudflare - Workers API Token",
  "notes": "Shared organization-wide token for wrangler CLI on all crane-console development machines. Rolled from existing 'Edit Cloudflare Workers' token on 2026-01-26. Permissions: Account.Workers (All accounts, All zones). Use this token for CLOUDFLARE_API_TOKEN environment variable.",
  "folderId": null,
  "login": {
    "username": "automation@smdurgan.com",
    "password": "<CLOUDFLARE_API_TOKEN>"
  }
}
EOF

bw create item "$(cat /tmp/cf-token.json)"
rm /tmp/cf-token.json
```

Verify it was added:

```bash
bw list items --search "Cloudflare - Workers API Token"
```

### Step 3: Review Mystery Tokens

Get full details on the mystery tokens:

```bash
# Review "Reset Token"
bw list items --search "Reset Token" | jq '.'

# Review "Worker DB OPS Token"
bw list items --search "Worker DB OPS Token" | jq '.'
```

**Questions to answer:**

- Are these still in use?
- What services/scripts reference them?
- Can they be consolidated with the new shared token?

### Step 4: Search Codebase for Token Usage

Check if the mystery tokens are referenced anywhere:

```bash
cd ~/Documents/SMDurgan\ LLC/Projects/crane-console

# Search for "Reset Token" references
grep -r "Reset Token" . --exclude-dir=node_modules --exclude-dir=.git

# Search for "Worker DB OPS" references
grep -r "Worker DB OPS" . --exclude-dir=node_modules --exclude-dir=.git

# Search for the actual token values (first 20 chars to avoid exposing full token)
grep -r "90d591d8c8a7c7ecb909" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "ff2e52feebee475cd08d" . --exclude-dir=node_modules --exclude-dir=.git
```

### Step 5: Decision Matrix

Based on search results:

**If tokens are NOT found in any code:**

- Delete them from Bitwarden (they're orphaned)

**If tokens ARE found in code:**

- Determine if they serve the same purpose as the new shared token
- If yes: Replace references with new token, delete old token
- If no: Keep them but add clear notes about their purpose

### Step 6: Update Notes on Kept Items

For items we're keeping, ensure they have clear notes:

**Cloudflare (login)**

```bash
bw get item "Cloudflare" | jq '.id' -r | xargs -I {} bw edit item {} --notes "Dashboard login credentials for automation@smdurgan.com. Use for web interface access at https://dash.cloudflare.com/"
```

**Cloudflare R2 - AWS Credentials**

```bash
bw get item "Cloudflare R2 - AWS Credentials" | jq '.id' -r | xargs -I {} bw edit item {} --notes "R2 storage access credentials (AWS S3-compatible). Used for direct bucket access outside of wrangler."
```

---

## Final Verification

After cleanup:

```bash
# List all Cloudflare items
bw list items --search cloudflare | jq '.[] | {name: .name, notes: .notes}'

# Should see:
# 1. Cloudflare (login password) - CLEAR PURPOSE
# 2. Cloudflare - API Tokens (KV namespace ID) - CLEAR PURPOSE
# 3. Cloudflare - Workers API Token (NEW) - CLEAR PURPOSE
# 4. Cloudflare R2 - AWS Credentials - CLEAR PURPOSE
# ... and any others with documented purposes
```

---

## Success Criteria

- ✅ New "Cloudflare - Workers API Token" added to Bitwarden
- ✅ All kept tokens have clear notes explaining their purpose
- ✅ No orphaned/mystery tokens remain
- ✅ All tokens are organized (consider moving to "Infrastructure" folder)
- ✅ Sync completed: `bw sync`

---

**Next Step After Cleanup:** Revoke old "Edit Cloudflare Workers" token from Cloudflare dashboard (Task #5)
