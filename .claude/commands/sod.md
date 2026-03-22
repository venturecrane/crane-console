# /sod - Start of Day

This command prepares your session using MCP tools to validate context, show work priorities, and ensure you're ready to code.

## Execution

### Step 1: Start Session

Call the `crane_sod` MCP tool to initialize the session.

The tool returns a structured briefing with:

- Session context (venture, repo, branch)
- Behavioral directives (enterprise rules)
- Continuity (recent handoffs)
- Alerts (P0 issues, active sessions)
- Weekly plan status
- Cadence briefing (overdue/due recurring activities)
- Knowledge base and enterprise context

> **Note:** The MCP tool reads the weekly plan but does not auto-create it. If the plan is missing, Step 4 below guides you through creating it.

### Step 2: Display Context Confirmation

Present a clear context confirmation box:

```
VENTURE:  {venture_name} ({venture_code})
REPO:     {repo}
BRANCH:   {branch}
SESSION:  {session_id}
```

State: "You're in the correct repository and on the {branch} branch."

### Step 3: Handle P0 Issues

If the Alerts section shows P0 issues:

1. Display prominently with warning icon
2. Say: "**There are P0 issues that need immediate attention.**"
3. List each issue

### Step 4: Check Weekly Plan

The weekly plan is a **portfolio-level** artifact that lives in crane-console (vc). Only prompt for creation when the active venture is `vc`.

Based on `weekly_plan` status in the response:

- **valid**: Note the priority venture and proceed
- **stale**: Warn user: "Weekly plan is {age_days} days old. Consider updating."
- **missing**:
  - **If venture is `vc`**: Ask user:
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

  - **If venture is NOT `vc`**: Skip silently. Do not prompt the user to create a weekly plan.

### Step 5: Calendar Sync (idempotent)

After cadence briefing, sync schedule items to Google Calendar and Apple Reminders.

1. Call `crane_schedule(action: "items")` to get all items with `gcal_event_id` and `next_due_date`
2. For each item with `gcal_event_id: null` and a `next_due_date`:
   - Search Google Calendar for an existing event titled `[{SCOPE_LABEL}] {title}` on `next_due_date` (crash recovery - prevents duplicates)
   - Scope labels: `vc`->`VC`, `ke`->`KE`, `dfg`->`DFG`, `sc`->`SC`, `dc`->`DC`, `global`->`CRANE`
   - If not found, create an all-day event on `next_due_date` with title `[{SCOPE_LABEL}] {title}` and a 9am reminder notification
   - Store the event ID via `crane_schedule(action: "link-calendar", name: "{name}", gcal_event_id: "{event_id}")`
3. For each item with `gcal_event_id` set:
   - Verify the event date matches `next_due_date`. Update if drifted.
4. Create Apple Reminders for due/overdue items (best-effort):
   - Use AppleScript (osascript) to check if "Venture Crane" list exists
   - If yes, for each due/overdue item, check if a reminder with title `[{SCOPE_LABEL}] {title}` exists. Create if missing.
   - If list doesn't exist, log a warning in SOD output and skip

### Step 6: Work Day Start

1. Call `crane_schedule` API's `POST /work-day` with `action: "start"` via the `upsertWorkDay` API method
2. If response shows no `gcal_event_id` (first SOD today), create a Google Calendar event:
   - Title: `Crane Work Day`
   - Start: now
   - End: 11:59pm local time (provisional - EOD updates with actual end time)
3. Link event ID by calling `POST /work-day` again with `gcal_event_id`

### Step 7: Personal Calendar (lightweight)

If Apple Calendar MCP is available:

- Read today's events from personal calendars
- Display as a bullet list in SOD output for awareness
- No storage, no action, just visibility

If not available, skip silently.

### Step 8: STOP and Wait

**CRITICAL**: Do NOT automatically start working. Steps 5-7 (calendar) should complete quickly and silently - do not flood the user with calendar sync details unless there are errors.

Present a brief summary and ask: **"What would you like to focus on?"**

If user wants to see the full work queue, call `crane_status` MCP tool.

## Wrong Repo Prevention

All GitHub issues created this session MUST target the repo shown in context confirmation. If you find yourself targeting a different repo, STOP and verify with the user.

## Troubleshooting

If MCP tools aren't available:

1. Check `claude mcp list` shows crane connected
2. Ensure started with: `crane vc`
3. Try: `cd ~/dev/crane-console/packages/crane-mcp && npm run build && npm link`
