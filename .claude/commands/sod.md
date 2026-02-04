# /sod - Start of Day

This command prepares your session using MCP tools to validate context, show work priorities, and ensure you're ready to code.

## Execution

### Step 1: Cache Documentation (Background)

Run silently to cache docs for the session:

```bash
bash scripts/cache-docs.sh 2>/dev/null || true
```

### Step 2: Run Preflight Checks

Call the `crane_preflight` MCP tool to validate environment:

- CRANE_CONTEXT_KEY is set
- gh CLI is authenticated
- Git repository detected
- API connectivity

**If any critical check fails**, show the error and stop. The user needs to fix their environment.

### Step 3: Start Session

Call the `crane_sod` MCP tool to initialize the session.

The tool returns:
- Session context (venture, repo, branch)
- Last handoff summary
- P0 issues (if any)
- Weekly plan status
- Active sessions (conflict detection)

### Step 4: Display Context Confirmation

Present a clear context confirmation box:

```
┌─────────────────────────────────────────────────────────────┐
│  VENTURE:  {venture_name} ({venture_code})                  │
│  REPO:     {repo}                                           │
│  BRANCH:   {branch}                                         │
│  SESSION:  {session_id}                                     │
└─────────────────────────────────────────────────────────────┘
```

State: "You're in the correct repository and on the {branch} branch."

### Step 5: Handle P0 Issues

If `p0_issues` is not empty:

1. Display prominently with warning icon
2. Say: "**There are P0 issues that need immediate attention.**"
3. List each issue

### Step 6: Check Weekly Plan

Based on `weekly_plan.status`:

- **valid**: Note the priority venture and proceed
- **stale**: Warn user: "Weekly plan is {age_days} days old. Consider updating."
- **missing**: Ask user:
  - "What venture is priority this week? (vc/dfg/sc/ke)"
  - "Any specific issues to target? (optional)"
  - "Any capacity constraints? (optional)"

  Then create `docs/planning/WEEKLY_PLAN.md`:
  ```markdown
  # Weekly Plan - Week of {DATE}

  ## Priority Venture
  {venture code}

  ## Target Issues
  {list or "None specified"}

  ## Capacity Notes
  {notes or "Normal capacity"}

  ## Created
  {ISO timestamp}
  ```

### Step 7: Warn About Active Sessions

If `active_sessions` is not empty:

Display: "**Warning:** Other agents are active on this venture."
List each session.

### Step 8: STOP and Wait

**CRITICAL**: Do NOT automatically start working.

Present a brief summary and ask: **"What would you like to focus on?"**

If user wants to see the full work queue, call `crane_status` MCP tool.

## Wrong Repo Prevention

All GitHub issues created this session MUST target the repo shown in context confirmation. If you find yourself targeting a different repo, STOP and verify with the user.

## Troubleshooting

If MCP tools aren't available:
1. Check `claude mcp list` shows crane connected
2. Ensure started with: `infisical run --path /vc -- claude`
3. Try: `cd ~/dev/crane-mcp && npm run build && npm link`
