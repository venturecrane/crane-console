# /work-plan - Work Planning

Generate a rolling N-day work schedule with Google Calendar events per venture.

## Usage

```
/work-plan
```

## Execution

### Step 1: Gather Planning Inputs

Ask the user for:

1. **Priority venture** - Which venture to focus on (vc/dfg/sc/ke)
2. **Target issues** (optional) - Specific GitHub issues to prioritize
3. **Capacity notes** (optional) - Any schedule constraints, travel, appointments
4. **Days to plan** (optional, default 7) - Rolling window size

### Step 2: Calculate Date Range

Compute the date range from today through today + N days.

### Step 3: Read Personal Calendar

Use `mcp__apple-calendar__list_events` to read events for the planned date range.

Classify each day:

- **Saturday/Sunday**: `off` (user can override in capacity notes)
- **All-day personal event**: `blocked`, note the conflict
- **Otherwise**: `work`

### Step 4: Clean Up Stale Planned Events

Remove previously planned events that are being replaced:

1. Call `crane_schedule(action: "planned-events", from: "{today}", to: "{end_date}", type: "planned")` to get existing planned events
2. For each event with a `gcal_event_id`:
   - Try to delete the Google Calendar event via `gcal_delete_event`
   - Log failures but do not abort
3. Call `crane_schedule(action: "planned-events-clear", from: "{today}")` to remove D1 records

### Step 5: Create Google Calendar Events

For each `work` day in the range:

1. Search Google Calendar for an existing `{VENTURE_CODE} Work` event on that date to avoid duplicates
2. If not found, create a Google Calendar event:
   - **Title**: `{VENTURE_CODE} Work` (e.g., `VC Work`)
   - **Start**: `06:30` (America/Phoenix timezone)
   - **End**: `22:30` (America/Phoenix timezone)
3. After successful GCal creation, store in D1:
   - Call `crane_schedule(action: "planned-event-create", event_date: "{date}", venture: "{code}", title: "{VENTURE_CODE} Work", start_time: "06:30", end_time: "22:30", gcal_event_id: "{event_id}")`

**Important**: GCal event is created first, D1 record second. If GCal fails, skip the D1 record for that day.

### Step 6: Cadence Reminders (Best-Effort)

1. Call `crane_schedule(action: "items")` to get all schedule items
2. For any due or overdue items that require effort:
   - Use osascript to check if "Venture Crane" list exists in Apple Reminders
   - If yes, create a reminder for each due/overdue item with title `[{SCOPE_LABEL}] {title}`
   - If the list doesn't exist, skip silently

Scope labels: `vc`->`VC`, `ke`->`KE`, `dfg`->`DFG`, `sc`->`SC`, `dc`->`DC`, `global`->`CRANE`

### Step 7: Write Plan File

Write `docs/planning/WEEKLY_PLAN.md`:

```markdown
# Work Plan - {DATE}

## Priority Venture

{code} - {description}

## Target Issues

{list or "None specified"}

## Capacity Notes

{notes or "Normal capacity"}

## Schedule

| Date       | Day | Venture | Status  | Notes       |
| ---------- | --- | ------- | ------- | ----------- |
| 2026-03-24 | Mon | VC      | work    | -           |
| 2026-03-25 | Tue | VC      | work    | -           |
| 2026-03-26 | Wed | -       | blocked | Doctor appt |
| 2026-03-27 | Thu | VC      | work    | -           |
| 2026-03-28 | Fri | VC      | work    | -           |
| 2026-03-29 | Sat | -       | off     | -           |
| 2026-03-30 | Sun | -       | off     | -           |

Work hours: 6:30am - 10:30pm MST (America/Phoenix)

## Created

{ISO timestamp}
```

### Step 8: Summary

Display a brief summary:

```
Work plan created for {N} days ({work_count} work days).
{event_count} Google Calendar events created.
Plan saved to docs/planning/WEEKLY_PLAN.md.
```
