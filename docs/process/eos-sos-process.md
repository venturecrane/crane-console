# End of Session / Start of Session Process

**Version:** 2.0
**Last Updated:** 2026-03-23
**Purpose:** MCP-based session lifecycle for Claude Code CLI agents

---

## Start of Session (SOS)

### Overview

The `/sos` skill initializes agent sessions using the `crane_sos` MCP tool. It loads venture context, shows work priorities, checks for handoffs from previous sessions, and surfaces any alerts.

**Source of truth:** `.agents/skills/sos/SKILL.md`

### How to Use

```
/sos
```

No arguments needed. The tool auto-detects the venture from the git remote and environment variables set by the `crane` launcher.

### What Happens

1. **Session initialization** - `crane_sos` MCP tool creates a session in the Context API
2. **Context display** - Shows venture, repo, branch, and session ID
3. **P0 alert check** - Surfaces any P0 issues requiring immediate attention
4. **Work plan check** - Queries D1 for today's planned events via `crane_schedule`
5. **Cadence check** - Shows overdue recurring activities (portfolio reviews, etc.)
6. **Wait for direction** - Presents summary and asks "What would you like to focus on?"

### What Gets Loaded

The `crane_sos` response includes:

- **Session context** - Venture, repo, branch
- **Behavioral directives** - Enterprise rules and constraints
- **Continuity** - Recent handoffs from previous sessions (stored in D1)
- **Alerts** - P0 issues, active sessions on the same venture
- **Weekly plan status** - Whether the work plan is current, stale, or missing
- **Cadence briefing** - Overdue or due recurring activities
- **Knowledge base** - Enterprise context and venture-specific docs

### After SOS

The agent does NOT auto-start work. It waits for Captain direction. If the user wants to see the full work queue, the agent calls `crane_status`.

---

## End of Session (EOS)

### Overview

The `/eos` skill auto-generates a structured handoff from session context and stores it in D1 via the `crane_handoff` MCP tool. The next session's `/sos` reads this handoff automatically.

**Source of truth:** `.agents/skills/eos/SKILL.md`

### How to Use

```
/eos
```

No arguments needed. The agent synthesizes the handoff from conversation history - it never asks the user to write or recall the summary.

### What Happens

1. **Gather context** - Agent reviews conversation history plus git log, PR list, and issue updates from the session
2. **Synthesize handoff** - Agent generates a structured summary covering:
   - **Accomplished:** Issues closed, PRs created/merged, problems solved
   - **In Progress:** Unfinished work, partial implementations, pending reviews
   - **Blocked:** Blockers encountered, questions for PM, decisions needed
   - **Next Session:** Recommended focus, logical next steps, follow-ups
3. **Save via MCP** - Calls `crane_handoff` with summary, status (`in_progress`, `blocked`, or `done`), and issue number if applicable
4. **Confirm** - Reports "Handoff saved to D1. Next session will see this via crane_sos."

### Key Principle

**The agent summarizes. The agent saves.**

The agent has full session context - every command run, every file edited, every conversation turn. It synthesizes this into a coherent handoff and saves directly to D1 without asking for confirmation.

---

## Session Lifecycle

### Session Timeout

Sessions have a **45-minute stale threshold**. If no activity occurs within 45 minutes, the session is considered stale.

### Heartbeat

Heartbeats are fully automatic. The MCP server refreshes the session heartbeat on every tool call and via a background timer (10-minute interval). No manual keepalive command is needed. See [Session Lifecycle](./session-lifecycle.md) for the full heartbeat protocol.

### Checkpoints

Mid-session snapshots can be saved with `/checkpoint`. Checkpoints capture partial progress without ending the session - useful for long sessions or before risky operations. Each checkpoint gets a unique `cp_<ULID>` ID and auto-incrementing sequence number.

For the full checkpoint protocol (payload structure, size limits, auto-numbering), see [Session Lifecycle](./session-lifecycle.md).

---

## SOS After a Break

If resuming after a long break or in a new terminal:

1. **Launch with crane** - `crane {venture_code}` (sets up env vars and MCP)
2. **Run SOS** - `/sos` loads context and shows any handoffs from previous sessions
3. **Review handoff** - The `crane_sos` response includes recent handoffs automatically
4. **Resume work** - Pick up where the previous session left off

No manual handoff files to find or read. D1 stores everything and SOS surfaces it.

---

## Multiple Parallel Sessions

When running multiple agents in parallel (e.g., separate worktrees):

- Each agent runs its own `/sos` and gets its own session ID
- The Context API tracks active sessions per venture
- SOS alerts when another session is already active on the same venture
- Each agent runs `/eos` independently at session end

---

## Quick Reference

```
SESSION START
/sos                  Initialize session, load context, show priorities

DURING SESSION
/checkpoint           Save mid-session snapshot (partial progress)

SESSION END
/eos                  Generate handoff, save to D1, end session
```

Heartbeats are automatic - the MCP server handles them via a background timer.

---

## Version History

| Version | Date         | Changes                                                                |
| ------- | ------------ | ---------------------------------------------------------------------- |
| 2.0     | Mar 23, 2026 | Full rewrite for MCP-based flow (crane_sos, crane_handoff, D1 storage) |
| 1.0     | Jan 18, 2026 | Initial process with manual handoff files                              |
