---
name: heartbeat
description: Send a heartbeat to keep session alive
---

# Heartbeat - Keep Session Alive

Send a heartbeat to prevent your session from timing out.

## What It Does

1. Verifies you have an active session via `crane_context` MCP tool
2. Refreshes the session heartbeat timestamp
3. Prevents 45-minute session timeout

## When to Use

- Working on long tasks (>30 minutes)
- Want to keep session active while reading/researching
- Need to maintain "active" status visibility

Not needed if you're actively using sod, update, or eod - those refresh heartbeat automatically.

## Execution

### 1. Check Session

Call `crane_context` MCP tool. If no active session, tell the user to run sod first.

### 2. Confirm Active

Display:

```
Heartbeat sent.
Session: {session_id}
Your session will stay active for 45 minutes from this heartbeat.
```

## Session Timeout

Sessions become "abandoned" after 45 minutes without heartbeat.

- Recommended interval: every 10-15 minutes during long tasks
- Safe to call frequently (idempotent)
