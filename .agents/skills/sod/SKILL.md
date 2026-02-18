---
name: sod
description: Start of Day - Initialize session via MCP tools
---

# Start of Day

This skill prepares your session using MCP tools to validate context, show work priorities, and ensure you're ready to code.

## Execution

### Step 1: Run Preflight Checks

Call the `crane_preflight` MCP tool to validate environment:

- CRANE_CONTEXT_KEY is set
- gh CLI is authenticated
- Git repository detected
- API connectivity

If any critical check fails, show the error and stop.

### Step 2: Start Session

Call the `crane_sod` MCP tool to initialize the session.

The tool returns:

- Session context (venture, repo, branch)
- Last handoff summary
- P0 issues (if any)
- Weekly plan status
- Cadence briefing (overdue/due recurring activities)
- Active sessions (conflict detection)
- Enterprise context (executive summaries)

### Step 3: Display Context Confirmation

Present a clear context confirmation:

```
VENTURE:  {venture_name} ({venture_code})
REPO:     {repo}
BRANCH:   {branch}
SESSION:  {session_id}
```

### Step 4: Handle P0 Issues

If P0 issues exist, display prominently: "There are P0 issues that need immediate attention."

If the P0 lookup failed, warn but continue.

### Step 5: Check Weekly Plan

Based on weekly_plan.status:

- **valid**: Note the priority venture and proceed
- **stale**: Warn user the plan needs updating
- **missing**: Ask user for priority venture, target issues, and capacity constraints. Then create docs/planning/WEEKLY_PLAN.md.

### Step 6: Warn About Active Sessions

If other agents are active, display a warning with session details.

### Step 7: STOP and Wait

Do NOT automatically start working. Present a brief summary and ask: "What would you like to focus on?"

If user wants the full work queue, call `crane_status` MCP tool.

## Wrong Repo Prevention

All GitHub issues created this session MUST target the repo shown in context confirmation.

## Troubleshooting

If MCP tools aren't available:

1. Check that crane MCP server is connected
2. Ensure started with: `crane vc`
3. Try: `cd ~/dev/crane-console/packages/crane-mcp && npm run build && npm link`
