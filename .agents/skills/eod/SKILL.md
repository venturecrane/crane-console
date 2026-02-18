---
name: eod
description: End of Day - Auto-generate handoff from session context
---

# End of Day Handoff

Auto-generate handoff from session context. The agent summarizes - never ask the user to write.

## Execution

### 1. Gather Session Context

You have full conversation history. Additionally, gather:

- Current repo from git remote
- Commits from this session (last 24 hours)
- PRs created/updated today (via gh CLI)
- Issues worked on

### 2. Synthesize Handoff

Generate a summary covering:

**Accomplished:** Issues closed/progressed, PRs created/merged, problems solved, code changes made.

**In Progress:** Where things were left off, partial implementations, pending reviews.

**Blocked:** Blockers encountered, questions for PM, decisions needed.

**Next Session:** Logical next steps, priority items, follow-ups needed.

### 3. Show User for Confirmation

Display the generated handoff and ask: "Save to D1? (y/n)"

Only ask this single yes/no question. Do not ask user to write or edit the summary.

### 4. Save Handoff via MCP

Call the `crane_handoff` MCP tool with:

- `summary`: The synthesized handoff text
- `status`: One of "in_progress", "blocked", or "done" (infer from context)
- `issue_number`: If a primary issue was being worked on

### 5. Report Completion

State: "Handoff saved to D1. Next session will see this via crane_sod."

## Key Principle

The agent summarizes. The user confirms. The only user input is a yes/no confirmation before saving.
