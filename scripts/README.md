# Crane Scripts

Workflow automation scripts for Crane agent sessions.

## crane-sod.sh - Start of Day Briefing

**Purpose:** Initialize agent session with complete operational documentation.

### Usage

```bash
./scripts/crane-sod.sh <venture> <track> [repo]
```

**Examples:**
```bash
# Auto-detect repo from git
./scripts/crane-sod.sh vc 1

# Explicit repo
./scripts/crane-sod.sh dfg 2 dfg-console

# Different ventures
./scripts/crane-sod.sh sc 3 sc-console
```

### What It Does

1. **Connects to Context Worker** - Creates/resumes session
2. **Fetches Documentation** - Retrieves operational docs for your venture
3. **Caches Locally** - Saves docs to `/tmp/crane-context/docs/`
4. **Displays Briefing** - Shows session info, cached docs, heartbeat instructions
5. **Exports Session ID** - Sets `$CRANE_SESSION_ID` environment variable

### Output

```
════════════════════════════════════════════════════════════════════
  Crane Start of Day (SOD) - Session Briefing
════════════════════════════════════════════════════════════════════

📡 Connecting to Context Worker...
   Venture: vc | Track: 1 | Repo: venturecrane/crane-console

✓ Session created: sess_01KF917M54S6GYR5G1RJ03J3W0

📚 Caching operational documentation...
   ✓ Claude Code CLI Starting Prompts → /tmp/crane-context/docs/cc-cli-starting-prompts.md
   ✓ Claude Code CLI Track Coordinator Workflow → /tmp/crane-context/docs/cc-cli-track-coordinator.md

✓ Cached 2 document(s) to /tmp/crane-context/docs

════════════════════════════════════════════════════════════════════
  Session Briefing
════════════════════════════════════════════════════════════════════

Session Information:
   Session ID: sess_01KF917M54S6GYR5G1RJ03J3W0
   Status: created
   Agent: cc-cli-Machine.local
   Venture: vc
   Track: 1
   Repo: venturecrane/crane-console

Cached Documentation (2 files):
   • cc-cli-starting-prompts.md
   • cc-cli-track-coordinator.md

💡 Access docs at: /tmp/crane-context/docs/

✨ Ready to start work! Session active.
```

### Benefits

- **10 min → 30 sec**: Eliminates manual doc hunting
- **Always current**: Docs synced from Context Worker database
- **Complete briefing**: Process docs, starting prompts, workflows
- **Zero setup**: Works immediately after git clone

### Requirements

**Environment Variable:**
```bash
export CRANE_RELAY_KEY="your-relay-key"
# OR
export CONTEXT_RELAY_KEY="your-relay-key"
```

**Dependencies:**
- `curl` - HTTP requests
- `jq` - JSON parsing
- `git` - Repo detection (optional)

### Configuration

**Context Worker URL** (default: production)
```bash
export CONTEXT_WORKER_URL="https://crane-context.automation-ab6.workers.dev"
```

**Doc Cache Directory** (default: /tmp/crane-context/docs)
```bash
export DOC_CACHE_DIR="/custom/path/docs"
```

### Accessing Documentation

**View all docs:**
```bash
ls /tmp/crane-context/docs/
```

**Read a doc:**
```bash
cat /tmp/crane-context/docs/cc-cli-track-coordinator.md
```

**Search docs:**
```bash
grep -r "qa-grade" /tmp/crane-context/docs/
```

### Session ID

The session ID is exported for use in other scripts:

```bash
echo $CRANE_SESSION_ID
# sess_01KF917M54S6GYR5G1RJ03J3W0

# Use in heartbeat
curl -X POST https://crane-context.automation-ab6.workers.dev/heartbeat \
  -H "X-Relay-Key: $CRANE_RELAY_KEY" \
  -d "{\"session_id\": \"$CRANE_SESSION_ID\"}"
```

### Troubleshooting

**Error: "Could not auto-detect repo"**
- Provide repo name explicitly: `./scripts/crane-sod.sh vc 1 venturecrane/crane-console`
- Or run from within a git repository with configured remote

**Error: "CRANE_RELAY_KEY not set"**
- Set environment variable: `export CRANE_RELAY_KEY="your-key"`
- Add to ~/.bashrc or ~/.zshrc for persistence

**Error: "Unauthorized"**
- Verify relay key is correct
- Contact admin if key is invalid

**No documentation returned**
- Check venture code is valid (vc, dfg, sc)
- Docs may not be uploaded yet for that venture
- Contact PM to upload docs via admin endpoint

### Related

- Context Worker: `workers/crane-context/`
- Admin Endpoints: `POST /admin/docs` (upload docs)
- SOD API: `POST /sod` (session creation)

---

**Version:** 1.0
**Last Updated:** 2026-01-18
**Maintainer:** Crane Platform Team
