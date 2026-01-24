# Context Worker Setup Guide

**Last Updated:** 2026-01-18
**Status:** Production Ready

---

## Quick Setup

### 1. Add Key to Shell Profile

Add this to your `~/.zshrc` or `~/.bashrc`:

```bash
# Crane Context Worker API Key
export CRANE_CONTEXT_KEY="a42cd864ccecf8b8c34a227ca1266d692870d5b4512e5d7681e67ea06ed53ae6"
```

Then reload your shell:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

### 2. Test Connection

```bash
cd dfg-console  # or any console repo
./scripts/sod-universal.sh
```

You should see:
- Session created
- 9 docs cached to `/tmp/crane-context/docs/`
- GitHub issues displayed
- Work queues shown

### 3. Use in Your CLI

**Claude Code CLI:**
```bash
/sod
```

**Gemini CLI:**
```bash
/sod
```

**Any Other CLI:**
```bash
./scripts/sod-universal.sh
```

---

## What This Sets Up

### Authentication
- **Shared Key:** Same key used by Crane Relay and Context Worker
- **Security:** Key is required for all API calls
- **Scope:** Provides access to all ventures (vc, sc, dfg)

### Key Details
- **Key Name:** `CRANE_CONTEXT_KEY` (environment variable)
- **Cloudflare Secret (Context):** `CONTEXT_RELAY_KEY`
- **Cloudflare Secret (Relay):** `RELAY_SHARED_SECRET`
- **Generated:** 2026-01-18 using `openssl rand -hex 32`
- **Format:** 64-character hexadecimal string

### Services Using This Key

| Service | Worker | Secret Name | Purpose |
|---------|--------|-------------|---------|
| Context Worker | `crane-context` | `CONTEXT_RELAY_KEY` | Session management, doc caching |
| Crane Relay | `crane-relay` | `RELAY_SHARED_SECRET` | GitHub integration, events |

---

## Troubleshooting

### "CRANE_CONTEXT_KEY environment variable not set"

**Solution:**
```bash
# Check if it's set
echo $CRANE_CONTEXT_KEY

# If empty, add to shell profile
echo 'export CRANE_CONTEXT_KEY="a42cd864ccecf8b8c34a227ca1266d692870d5b4512e5d7681e67ea06ed53ae6"' >> ~/.zshrc
source ~/.zshrc
```

### "Unauthorized: Invalid or missing X-Relay-Key"

**Cause:** Key mismatch between script and Cloudflare Worker

**Solution:**
1. Verify key in shell profile matches this document
2. Reload shell: `source ~/.zshrc`
3. Test: `echo $CRANE_CONTEXT_KEY` should show the key

### Documentation Not Caching

**Check cache directory:**
```bash
ls -lh /tmp/crane-context/docs/
```

**Should show:**
- 8 global docs (agent-persona-briefs, cc-cli-starting-prompts, crane-relay-api, etc.)
- 1 venture-specific doc (dfg-project-description, sc-project-instructions, or vc-project-instructions)

**If empty:**
1. Check network connection
2. Verify Context Worker is running: `curl https://crane-context.automation-ab6.workers.dev/health`
3. Check key is correct

---

## Key Rotation

If you need to rotate the key:

### 1. Generate New Key
```bash
NEW_KEY=$(openssl rand -hex 32)
echo $NEW_KEY
```

### 2. Update Cloudflare Secrets

**Context Worker:**
```bash
cd workers/crane-context
echo "$NEW_KEY" | npx wrangler secret put CONTEXT_RELAY_KEY
```

**Crane Relay:**
```bash
cd workers/crane-relay
echo "$NEW_KEY" | npx wrangler secret put RELAY_SHARED_SECRET
```

### 3. Update Documentation

Update this file and `cli-context-integration.md` with the new key.

### 4. Notify Team

All developers must update their `CRANE_CONTEXT_KEY` environment variable.

---

## Security Notes

- **Shared Key:** This is a shared secret used across all agents
- **Storage:** Keep in environment variable, not committed to git
- **Distribution:** Share via secure channel (encrypted message, password manager, etc.)
- **Rotation:** Rotate if compromised or as part of regular security practice

---

## Admin Access

The Context Worker has a separate admin key for documentation management:

### Setup Admin Key

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# Crane Admin Key (for uploading docs to crane-context)
export CRANE_ADMIN_KEY="your-64-char-admin-key-here"
```

**Where to get the key:**
1. **GitHub Secrets:** `gh secret list` (shows it exists, but can't read value)
2. **Cloudflare:** `cd workers/crane-context && npx wrangler secret list` (shows CONTEXT_ADMIN_KEY exists)
3. **Team Lead:** Contact for the actual key value
4. **Bitwarden:** Check secure credential storage (if configured)

### When You Need It

- Manual documentation uploads via `./scripts/upload-doc-to-context-worker.sh`
- Testing documentation sync before PR
- Emergency documentation updates

### Testing Admin Access

```bash
# Verify key is set
echo "CRANE_ADMIN_KEY length: ${#CRANE_ADMIN_KEY}"  # Should be 64

# Test upload (dry run with a test doc)
./scripts/test-context-worker-crud.sh
```

**Note:** GitHub Actions has CRANE_ADMIN_KEY in secrets and auto-uploads docs when merged to main. But developers should also have it for manual operations.

---

## Testing

### Test API Directly

```bash
curl -sS "https://crane-context.automation-ab6.workers.dev/sod" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "schema_version": "1.0",
    "agent": "test-cli",
    "venture": "dfg",
    "repo": "durganfieldguide/dfg-console"
  }' | jq '.'
```

**Expected Response:**
```json
{
  "session": {
    "id": "sess_...",
    "status": "active",
    ...
  },
  "documentation": {
    "docs": [...],
    "count": 9
  }
}
```

### Test Full Script

```bash
cd dfg-console
./scripts/sod-universal.sh
```

**Expected Output:**
- ✓ Session loaded
- ✓ Cached 9 docs
- GitHub issues displayed
- Work queues shown
- Session ID provided

---

## Related Documentation

- **CLI Integration Guide:** `cli-context-integration.md`
- **Context Worker ADR:** `../adr/025-crane-context-worker.md`
- **Crane Relay API:** `crane-relay-api.md`
- **Documentation Sync:** `../../DOC-SYNC-SUCCESS.md`

---

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Verify key matches this document
3. Test API directly (see Testing section)
4. Check Cloudflare Worker status
5. Contact team lead if issues persist

---

**Status:** ✅ Configured and tested
**Last Verified:** 2026-01-18
