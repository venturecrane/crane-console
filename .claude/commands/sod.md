# /sod - Start of Day

This command prepares your session using MCP tools to validate context, show work priorities, and ensure you're ready to code.

## Execution

### Step 1: Run Preflight Checks

Call the `crane_preflight` MCP tool to validate environment:

- CRANE_CONTEXT_KEY is set
- gh CLI is authenticated
- Git repository detected
- API connectivity

**If any critical check fails**, show the error and stop. The user needs to fix their environment.

### Step 2: Start Session

Call the `crane_sod` MCP tool to initialize the session.

The tool returns:

- Session context (venture, repo, branch)
- Last handoff summary
- P0 issues (if any)
- Weekly plan status
- Active sessions (conflict detection)
- Enterprise context (executive summaries)

> **Note:** The MCP tool reads the weekly plan but does not auto-create it. If the plan is missing, Step 5 below guides you through creating it.

### Step 3: Display Context Confirmation

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

### Step 4: Handle P0 Issues

If `p0_issues` is not empty:

1. Display prominently with warning icon
2. Say: "**There are P0 issues that need immediate attention.**"
3. List each issue

If the P0 lookup failed (e.g., `gh` CLI error), warn: "**Could not check for P0 issues.** Verify `gh auth status` is valid." Continue with the rest of SOD - do not block.

### Step 5: Check Portfolio Review (vc only)

If the SOD response includes `portfolio_review` (only present when venture is vc):

Based on `portfolio_review.status`:

- **current**: Note it briefly: "Portfolio review is current ({age_days} days old)"
- **due**: Prompt: "Portfolio review is due ({age_days} days old). Run /portfolio-review to update."
- **overdue**: Warn: "Portfolio review is overdue ({age_days} days old). Run /portfolio-review to update."
- **missing**: Note: "No portfolio review data found. Run /portfolio-review to initialize."

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
2. Ensure started with: `crane vc`
3. Try: `cd ~/dev/crane-console/packages/crane-mcp && npm run build && npm link`
