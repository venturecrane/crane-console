# /eod - End of Day

End your work session and create a handoff for the next agent.

## What It Does

1. Reads your active session from Context Worker
2. Prompts you for session summary
3. Creates a handoff in the database
4. Ends the active session
5. Clears local session cache

## Usage

```bash
/eod
```

## Execution Steps

### 1. Detect Repository and Find Active Session

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

# Query Context Worker for active sessions in this repo
ACTIVE_SESSIONS=$(curl -sS "https://crane-context.automation-ab6.workers.dev/active?venture=$VENTURE&repo=$REPO" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY")

# Extract sessions for this host/agent
AGENT_PREFIX="claude-code-$(hostname)"
SESSION_ID=$(echo "$ACTIVE_SESSIONS" | jq -r --arg agent "$AGENT_PREFIX" \
  '.sessions[] | select(.agent | startswith($agent)) | .id' | head -1)

if [ -z "$SESSION_ID" ]; then
  echo "❌ No active session found for this agent"
  echo ""
  echo "Run /sod first to start a session"
  echo ""
  echo "If you just ran /sod, the session may still be active."
  echo "Session ID can be provided manually:"
  echo "  /eod <session-id>"
  exit 1
fi

# Get full session details
SESSION=$(echo "$ACTIVE_SESSIONS" | jq --arg id "$SESSION_ID" '.sessions[] | select(.id == $id)')
TRACK=$(echo "$SESSION" | jq -r '.track // empty')

echo "## 🌙 End of Day"
echo ""
echo "Repository: $REPO"
echo "Venture: $VENTURE"
if [ -n "$TRACK" ]; then
  echo "Track: $TRACK"
fi
echo "Session: $SESSION_ID"
echo ""
```

### 2. Prompt for Handoff Summary

Ask the user:

```
Please provide a session summary:

1. **What was accomplished?**
   (Issues worked on, PRs created/merged, problems solved)

2. **What's in progress?**
   (Unfinished work, where you left off)

3. **What's blocked or needs attention?**
   (Blockers, questions for PM, decisions needed)

4. **Status label** (optional):
   - in-progress (default)
   - blocked
   - ready
   - done

5. **Next agent** (optional):
   Leave empty for "anyone" or specify: pm, dev, qa
```

Store the user's responses in variables:
- `ACCOMPLISHED`
- `IN_PROGRESS`
- `BLOCKED`
- `STATUS_LABEL` (default: "in-progress")
- `TO_AGENT` (optional)

### 3. Build Handoff Payload

```bash
# Create JSON payload
PAYLOAD=$(jq -n \
  --arg accomplished "$ACCOMPLISHED" \
  --arg in_progress "$IN_PROGRESS" \
  --arg blocked "$BLOCKED" \
  '{
    accomplished: $accomplished,
    in_progress: $in_progress,
    blocked: $blocked,
    next_steps: "Continue from where left off"
  }')

# Build summary (required field)
SUMMARY=$(cat <<EOF
Session completed for $REPO (Track $TRACK)

Accomplished: $ACCOMPLISHED

In Progress: $IN_PROGRESS

Blocked: $BLOCKED
EOF
)
```

### 4. Call Context Worker /eod

```bash
# Build request body
REQUEST_BODY=$(jq -n \
  --arg session_id "$SESSION_ID" \
  --arg summary "$SUMMARY" \
  --argjson payload "$PAYLOAD" \
  --arg status_label "${STATUS_LABEL:-in-progress}" \
  --arg to_agent "${TO_AGENT:-}" \
  '{
    session_id: $session_id,
    summary: $summary,
    payload: $payload,
    status_label: $status_label,
    end_reason: "manual"
  } + (if $to_agent != "" then {to_agent: $to_agent} else {} end)')

# Call API
RESPONSE=$(curl -sS "https://crane-context.automation-ab6.workers.dev/eod" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$REQUEST_BODY")

# Check for errors
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
if [ -n "$ERROR" ]; then
  echo "❌ Failed to end session"
  echo ""
  echo "Error: $ERROR"
  echo "$RESPONSE" | jq '.'
  exit 1
fi
```

### 5. Display Results

```bash
HANDOFF_ID=$(echo "$RESPONSE" | jq -r '.handoff_id')
ENDED_AT=$(echo "$RESPONSE" | jq -r '.ended_at')

echo "✅ Session ended successfully"
echo ""
echo "Handoff ID: $HANDOFF_ID"
echo "Ended at: $ENDED_AT"
echo ""
```

### 6. Clean Up Local Cache

```bash
# Remove session cache
rm -f "$SESSION_CACHE"
echo "🧹 Local session cache cleared"
echo ""
```

### 7. Display Next Steps

```bash
echo "---"
echo ""
echo "Your handoff has been stored in Context Worker."
echo ""
echo "Next session:"
echo "  1. Run /sod to start a new session"
echo "  2. The handoff will be available in 'last_handoff'"
echo ""
echo "Good work today! 👋"
```

## Example Session

```bash
$ /eod

## 🌙 End of Day

Repository: venturecrane/crane-console
Venture: vc
Track: 1
Session: sess_abc123

Please provide a session summary:

1. **What was accomplished?**
> Implemented Vertex AI integration for QA grading

2. **What's in progress?**
> Testing the integration, need to verify with real API calls

3. **What's blocked or needs attention?**
> Waiting for GCP billing setup to complete

4. **Status label** (optional):
> in-progress

5. **Next agent** (optional):
> dev

✅ Session ended successfully

Handoff ID: ho_xyz789
Ended at: 2026-01-19T12:00:00Z

🧹 Local session cache cleared

---

Your handoff has been stored in Context Worker.

Next session:
  1. Run /sod to start a new session
  2. The handoff will be available in 'last_handoff'

Good work today! 👋
```

## Notes

- Requires active session (must run /sod first)
- Requires CRANE_CONTEXT_KEY environment variable
- Creates handoff in Context Worker database
- Ends the session (marks as 'ended')
- Clears local session cache
- Next /sod will retrieve this handoff as 'last_handoff'

## Error Handling

**No active session:**
```
❌ No active session found

Run /sod first to start a session
```

**Missing CRANE_CONTEXT_KEY:**
```
❌ CRANE_CONTEXT_KEY not set

Export the key:
  export CRANE_CONTEXT_KEY="your-key-here"
```

**API error:**
```
❌ Failed to end session

Error: Session not found
{
  "error": "Session not found",
  "details": {...}
}
```

## Integration with Workflow

**Full Session Flow:**
```bash
# Start of day
/sod

# Work on issues...

# End of day
/eod
```

**Next Day:**
```bash
# Start new session
/sod

# See previous handoff in output:
# Last Handoff:
#   From: claude-code-cli-macbook
#   Summary: Implemented Vertex AI integration...
#   Status: in-progress
```
