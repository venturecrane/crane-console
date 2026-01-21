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

## eod-universal.sh - End of Day with Auto-Generated Handoffs

**Purpose:** End agent session and automatically generate handoff from work artifacts.

### Usage

```bash
./scripts/eod-universal.sh
```

### What It Does

1. **Detects Active Session** - Finds your current session from Context Worker
2. **Analyzes Work Artifacts** - Queries git commits, GitHub activity, TodoWrite data
3. **Auto-Generates Handoff** - Creates structured handoff from detected activity
4. **Saves to Context Worker** - Stores handoff for next session
5. **Ends Session** - Marks session as ended and clears local cache

### Auto-Detection Sources

**Git Commits:**
- All commits since session start
- Captures what was actually accomplished
- Excludes merge commits

**GitHub Activity:**
- Issues created/closed during session
- PRs created/merged during session
- Filtered by session author and timestamp

**TodoWrite Data:**
- Completed todos → Accomplished
- In-progress todos → In Progress
- Current branch if not main/master

**Status Detection:**
- `in-progress` if work remains (open PRs, in-progress todos, active branch)
- `done` if no ongoing work detected

### Output Example

```
## 🌙 End of Day

Repository: venturecrane/crane-console
Venture: vc
Track: 1
Session: sess_01KFF6W25HNHYA67BE2Z03T44C

### 📊 Analyzing Session Activity

Session started: 2026-01-21T02:30:15.166Z

Querying git commits...
Found 2 commits

Querying GitHub issues...
Found 0 issues created, 0 closed

Querying GitHub PRs...
Found 0 PRs created, 0 merged

Reading TodoWrite data...
Found 5 completed todos, 1 in progress

### 📝 Generated Handoff

Accomplished:
  Git commits:
  adbdb06 test: verify /eod auto-generation from artifacts
  0c63cdf feat: implement eod-universal.sh with auto-generated handoffs

  Tasks completed:
  - Create eod-universal.sh script with auto-generation logic
  - Implement git commit detection since session start
  - Implement GitHub issues/PRs activity detection
  - Implement TodoWrite data reading
  - Implement handoff auto-generation and Context Worker integration

In Progress:
  Current branch: main

  Tasks in progress:
  - Update README documentation for /eod usage

Blocked:
  None detected

Status: in-progress

### 💾 Saving Handoff

✅ Session ended successfully

Handoff ID: ho_abc123xyz
Ended at: 2026-01-21T04:15:30.500Z

🧹 Local session cache cleared

---

Your handoff has been stored in Context Worker.

Next session:
  1. Run /sod to start a new session
  2. The handoff will be available in 'last_handoff'

Good work today! 👋
```

### Benefits

- **Zero manual effort** - No prompts, no manual input required
- **Accurate tracking** - Based on actual work artifacts (git, GitHub, todos)
- **Reliable continuity** - Next session starts with clear context
- **Status-aware** - Automatically determines if work is done or in-progress

### Requirements

**Environment Variable:**
```bash
export CRANE_CONTEXT_KEY="your-context-key"
```

**Active Session:**
- Must run `/sod` first to create an active session
- Script auto-detects session from Context Worker

**Dependencies:**
- `curl` - HTTP requests
- `jq` - JSON parsing
- `git` - Repository and commit detection
- `gh` - GitHub CLI (optional, for issue/PR detection)

### Workflow Integration

**Full Day Cycle:**
```bash
# Morning - Start session
./scripts/sod-universal.sh

# Work on tasks...
# (git commits, GitHub activity, TodoWrite tracking)

# Evening - End session
./scripts/eod-universal.sh
```

**Next Day:**
```bash
# Start new session
./scripts/sod-universal.sh

# Output includes previous handoff:
# Last Handoff:
#   From: universal-cli-smdmacmini
#   When: 2026-01-21T04:15:30.500Z
#   Status: in-progress
#   Summary: Session completed for venturecrane/crane-console...
```

### Fallback Behavior

If no work artifacts detected:
- Reports "No tracked accomplishments"
- Still creates handoff with session info
- Status automatically set to "done"

### Manual Override

If auto-generation is insufficient, provide session ID manually:
```bash
./scripts/eod-universal.sh sess_01KFF6W25HNHYA67BE2Z03T44C
```

### Troubleshooting

**Error: "No active session found"**
- Run `/sod` first to create a session
- Or provide session ID manually as argument

**Error: "CRANE_CONTEXT_KEY not set"**
- Set environment variable: `export CRANE_CONTEXT_KEY="your-key"`
- Add to ~/.bashrc or ~/.zshrc for persistence

**GitHub CLI not available:**
- Script continues without issue/PR detection
- Only git commits and todos will be tracked

**No commits detected:**
- Ensure you're in a git repository
- Check that commits exist since session start
- Session start time is pulled from Context Worker

### Related

- Context Worker: `workers/crane-context/`
- EOD API: `POST /eod` (handoff creation)
- Issue #53: Auto-generate /eod handoffs from git/GitHub artifacts

---

**Version:** 1.0
**Last Updated:** 2026-01-21
**Maintainer:** Crane Platform Team
