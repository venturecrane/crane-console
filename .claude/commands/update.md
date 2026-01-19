# /update - Update Session Context

Update your session with current branch, commit, and work metadata.

## What It Does

1. Finds your active session from Context Worker
2. Auto-detects current git branch and commit
3. Updates session with current work context
4. Refreshes heartbeat (keeps session alive)
5. Provides visibility: "Agent X is on branch Y working on issue #123"

## When to Use

- Started working on a new issue
- Switched branches
- Made significant progress (checkpoint)
- Want to update team visibility

**Tip:** Call this when you start work on an issue and after major milestones.

## Usage

```bash
# Auto-detect branch/commit
/update

# With issue number
/update 123

# With custom metadata
/update --meta '{"issue": 123, "priority": "P0"}'
```

## Execution Steps

### 1. Find Active Session

```bash
# Get current repo
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?$/\1/')

if [ -z "$REPO" ]; then
  echo "❌ Not in a git repository"
  exit 1
fi

# Determine venture from repo org
ORG=$(echo "$REPO" | cut -d'/' -f1)
case "$ORG" in
  durganfieldguide) VENTURE="dfg" ;;
  siliconcrane) VENTURE="sc" ;;
  venturecrane) VENTURE="vc" ;;
  *)
    echo "❌ Unknown venture for org: $ORG"
    exit 1
    ;;
esac

# Check for CRANE_CONTEXT_KEY
if [ -z "$CRANE_CONTEXT_KEY" ]; then
  echo "❌ CRANE_CONTEXT_KEY not set"
  echo ""
  echo "Export the key:"
  echo "  export CRANE_CONTEXT_KEY=\"your-key-here\""
  exit 1
fi

# Query Context Worker for active sessions
ACTIVE_SESSIONS=$(curl -sS "https://crane-context.automation-ab6.workers.dev/active?venture=$VENTURE&repo=$REPO" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY")

# Extract session for this host/agent
AGENT_PREFIX="claude-code-$(hostname)"
SESSION_ID=$(echo "$ACTIVE_SESSIONS" | jq -r --arg agent "$AGENT_PREFIX" \
  '.sessions[] | select(.agent | startswith($agent)) | .id' | head -1)

if [ -z "$SESSION_ID" ]; then
  echo "❌ No active session found"
  echo ""
  echo "Run /sod first to start a session"
  exit 1
fi
```

### 2. Detect Current Work Context

```bash
# Get current branch
BRANCH=$(git branch --show-current 2>/dev/null)

# Get current commit
COMMIT=$(git rev-parse --short HEAD 2>/dev/null)

# Parse arguments for issue number or metadata
ISSUE_NUMBER=""
META_JSON=""

# If first arg is a number, it's an issue
if [[ "$1" =~ ^[0-9]+$ ]]; then
  ISSUE_NUMBER="$1"
  META_JSON=$(jq -n --argjson issue "$ISSUE_NUMBER" '{issue: $issue}')
fi

# If --meta flag provided, use that
if [[ "$1" == "--meta" && -n "$2" ]]; then
  META_JSON="$2"
fi

echo "## 📝 Updating Session"
echo ""
echo "Session: $SESSION_ID"
echo "Branch: $BRANCH"
echo "Commit: $COMMIT"
if [ -n "$ISSUE_NUMBER" ]; then
  echo "Issue: #$ISSUE_NUMBER"
fi
echo ""
```

### 3. Build Update Request

```bash
# Build request body with current context
REQUEST_BODY=$(jq -n \
  --arg session_id "$SESSION_ID" \
  --arg branch "$BRANCH" \
  --arg commit "$COMMIT" \
  --argjson meta "${META_JSON:-null}" \
  '{
    session_id: $session_id,
    branch: $branch,
    commit_sha: $commit
  } + (if $meta != null then {meta: $meta} else {} end)')
```

### 4. Call Context Worker /update

```bash
# Call API
RESPONSE=$(curl -sS "https://crane-context.automation-ab6.workers.dev/update" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$REQUEST_BODY")

# Check for errors
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
if [ -n "$ERROR" ]; then
  echo "❌ Update failed"
  echo ""
  echo "Error: $ERROR"
  exit 1
fi
```

### 5. Display Results

```bash
UPDATED_AT=$(echo "$RESPONSE" | jq -r '.updated_at')
NEXT_HEARTBEAT=$(echo "$RESPONSE" | jq -r '.next_heartbeat_at')
INTERVAL=$(echo "$RESPONSE" | jq -r '.heartbeat_interval_seconds')

# Convert to human readable
MINUTES=$((INTERVAL / 60))

echo "✅ Session updated"
echo ""
echo "Updated at: $UPDATED_AT"
echo "Next heartbeat: ~$MINUTES minutes"
echo ""
echo "Your session context is now visible to other agents."
```

## Example Usage

**Auto-detect everything:**
```bash
$ /update

## 📝 Updating Session

Session: sess_01KF9E64QXARSWVT45Q5ZJXM7H
Branch: feature/vertex-ai-integration
Commit: abc123d

✅ Session updated

Updated at: 2026-01-19T15:00:00Z
Next heartbeat: ~11 minutes

Your session context is now visible to other agents.
```

**With issue number:**
```bash
$ /update 456

## 📝 Updating Session

Session: sess_01KF9E64QXARSWVT45Q5ZJXM7H
Branch: fix/auth-bug
Commit: def789a
Issue: #456

✅ Session updated
```

**With custom metadata:**
```bash
$ /update --meta '{"issue": 789, "priority": "P0", "type": "bug"}'

## 📝 Updating Session

Session: sess_01KF9E64QXARSWVT45Q5ZJXM7H
Branch: hotfix/critical-auth
Commit: ghi012b

✅ Session updated
```

## What Gets Updated

**Always updated:**
- `branch` - Current git branch
- `commit_sha` - Current commit SHA (short)
- `last_heartbeat_at` - Session heartbeat

**Optional:**
- `meta` - Custom JSON metadata (issue, priority, etc.)

**Not updated:** venture, repo, track (set at session creation)

## Visibility Benefits

**Other agents can see:**
```bash
$ /sod  # On any agent

### Active Sessions

Agent: claude-code-macbook
Track: 1
Branch: feature/vertex-ai-integration
Issue: #456
Last active: 2 minutes ago
```

**Useful for:**
- Coordinating work across multiple agents
- Avoiding duplicate work
- Understanding what's in progress

## Workflow Integration

**Recommended pattern:**
```bash
# Start work on issue
/sod
/update 456

# After major checkpoint (e.g., PR created)
/update

# End of day
/eod
```

**Automatic updates happen on:**
- `/sod` - Sets initial context
- `/eod` - Final update before ending

**Manual updates useful for:**
- Mid-session checkpoints
- Branch switches
- Starting new issue

## Notes

- Auto-detects git branch and commit
- Requires active session (run `/sod` first)
- Requires CRANE_CONTEXT_KEY environment variable
- Refreshes heartbeat (prevents timeout)
- Safe to call frequently

## Error Handling

**Not in git repo:**
```
❌ Not in a git repository
```

**No active session:**
```
❌ No active session found

Run /sod first to start a session
```

**Invalid metadata:**
```
❌ Update failed

Error: Invalid meta field (must be valid JSON object)
```

## Advanced Usage

**Track multiple issues:**
```bash
/update --meta '{"issues": [123, 456], "sprint": "2026-01-W3"}'
```

**Add tags:**
```bash
/update --meta '{"issue": 789, "tags": ["refactor", "performance"]}'
```

**Custom workflow state:**
```bash
/update --meta '{"issue": 234, "state": "code-review", "reviewer": "pm-agent"}'
```

The `meta` field is freeform JSON - use it for whatever context helps your workflow.
