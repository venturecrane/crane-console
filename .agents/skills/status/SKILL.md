---
name: status
description: Show current session state, tasks, and git status
---

# Session Status

Display current session state, tasks, and git status for situational awareness.

## What to Show

### 1. Session Information

Call `crane_context` MCP tool for current session:

- Session ID
- Session age
- Last heartbeat time
- Venture context

If no session exists, note: "No active session. Run sod to start."

### 2. Git Status

Show current repository state:

- Current branch
- Uncommitted changes (staged and unstaged)
- Commits ahead/behind remote

### 3. Context Summary

- Current working directory
- Repository name
- Machine name (hostname)

## Output Format

```
== Session Status ==
Session: [ID or "None"]
Venture: [venture name or "Unknown"]

== Git ==
Branch: [branch name]
Changes: [staged] staged, [unstaged] unstaged
Remote: [ahead/behind status]

== Context ==
Repo: [repo name]
Dir: [current directory]
Machine: [hostname]
```

## Notes

- This is a read-only status check - does not modify anything
- If crane-context is unavailable, show what information is available locally
- Keep output concise and scannable
