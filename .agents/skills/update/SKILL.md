---
name: update
description: Update session with current branch and work context
---

# Update Session Context

Update your session with current branch, commit, and work metadata.

## What It Does

1. Detects current git branch and commit
2. Updates session with current work context via `crane_context`
3. Refreshes heartbeat (keeps session alive)
4. Provides visibility: "Agent X is on branch Y working on issue #123"

## When to Use

- Started working on a new issue
- Switched branches
- Made significant progress (checkpoint)
- Want to update team visibility

## Execution

### 1. Detect Context

Get the current git branch and short commit SHA:

```bash
git branch --show-current
git rev-parse --short HEAD
```

### 2. Check for Arguments

If an issue number was provided (e.g., `$ARGUMENTS` contains a number), include it as metadata.

### 3. Report Status

Call `crane_context` MCP tool to verify session, then display:

```
Session updated.
Branch: {branch}
Commit: {commit}
Issue: #{issue_number} (if provided)
Your session context is now visible to other agents.
```

## Notes

- Auto-detects git branch and commit
- Requires active session (run sod first)
- Refreshes heartbeat (prevents timeout)
- Safe to call frequently
