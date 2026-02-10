# End of Day / Start of Day Process

**Version:** 1.0
**Last Updated:** 2026-01-18
**Purpose:** Standard procedures for CC CLI agent session management

---

## Start of Day (SOD)

### What It Does

Loads operational context into CC CLI agent sessions so agents have complete knowledge of:

- Team workflows and conventions
- Technical infrastructure (Crane Relay API)
- Project-specific context
- Available tools and commands

### How to Use

#### 1. Navigate to Repo

```bash
cd ~/path/to/<console-repo>
```

#### 2. Set Relay Key

```bash
export CRANE_RELAY_KEY="your-relay-key-here"
```

#### 3. Run SOD Command

```bash
/sod
```

**What Happens:**

1. Detects venture from git remote (vc, sc, or dfg)
2. Defaults to track 1
3. Calls Context Worker API
4. Downloads and caches documentation locally
5. Reports what docs are available

**Output:**

```
Session Created: vc-track-1-abc123
Cached Documentation (9 files):
  • cc-cli-starting-prompts.md (6KB)
  • team-workflow.md (20KB)
  • crane-relay-api.md (15KB)
  • slash-commands-guide.md (11KB)
  • parallel-dev-track-runbook.md (3KB)
  • eod-sod-process.md (this doc!)
  • dev-directive-pr-workflow.md (3KB)
  • agent-persona-briefs.md (10KB)
  • vc-project-instructions.md (7KB)
```

#### 4. Reference Docs During Work

Docs cached at: `/tmp/crane-context/docs/`

Agent can read them anytime:

```bash
cat /tmp/crane-context/docs/team-workflow.md
```

---

## End of Day (EOD)

### What to Do

#### 1. Review Open Work

- Check GitHub issues assigned to you
- Review any open PRs
- Note any blockers or questions

#### 2. Create Handoff (If Mid-Task)

If you're in the middle of work that another agent (or you tomorrow) will continue:

```bash
# Use handoff command or create handoff doc
vim docs/handoffs/$(date +%Y-%m-%d)-your-name-task-description.md
```

**Handoff Template:**

```markdown
# Handoff: [Task Description]

**Date:** 2026-01-18
**From:** [Your Name/Agent ID]
**To:** [Next Agent/You Tomorrow]
**Status:** In Progress

## Context

[What you're working on]

## Progress

- ✅ Completed: [What's done]
- ⏳ In Progress: [What's started but not finished]
- ❌ Blocked: [What's blocked and why]

## Next Steps

1. [Specific next action]
2. [Then this]
3. [Then that]

## Important Notes

- [Gotchas, decisions made, things to know]
- [Links to relevant docs/PRs/issues]

## Questions/Decisions Needed

- [Anything you need clarity on]
```

#### 3. Clean Up Local State

- Commit any work in progress (on feature branch)
- Push branches to remote
- Clear sensitive data from env vars (if any)

#### 4. Update Issue Status

- Move GitHub issues to appropriate columns
- Add comments on progress
- Update issue descriptions if scope changed

---

## SOD After Long Break

If it's been a while since you last worked:

### 1. Run SOD Again

```bash
/sod
```

This ensures you have latest docs (may have been updated).

### 2. Read Handoff (If Applicable)

Check `docs/handoffs/` for any handoff from previous session.

### 3. Check for Changes

```bash
git fetch origin
git log HEAD..origin/main --oneline  # See what changed
gh issue list --assignee @me         # Your assigned issues
```

### 4. Resume Work

Pick up where you left off or start new task.

---

## Session Management

### Multiple Parallel Sessions

When running multiple CC CLI agents in parallel:

**Agent 1 (Track 1):**

```bash
cd crane-console
/sod vc 1
# Works on track-1 issues
```

**Agent 2 (Track 2):**

```bash
cd crane-console
/sod vc 2
# Works on track-2 issues
```

**Agent 3 (Planning):**

```bash
cd crane-console
/sod vc 0
# Reviews backlog, organizes work
```

### Session Lifetime

- Sessions have 45-minute idle timeout
- Keep working and sessions stay alive
- If session expires, just run `/sod` again

---

## Context Worker Behavior

### What Gets Cached

- **Global docs:** Same for all ventures (workflows, API docs, etc.)
- **Venture docs:** Specific to the repo you're in (vc, sc, dfg)

### Cache Location

```
/tmp/crane-context/
├── session.json          # Session metadata
└── docs/                 # Cached documentation
    ├── cc-cli-starting-prompts.md
    ├── team-workflow.md
    ├── crane-relay-api.md
    └── ...
```

### Cache Refresh

Cache is ephemeral (stored in `/tmp/`):

- Cleared on system restart
- Regenerated on next `/sod` call
- Always gets latest versions from Context Worker

---

## Troubleshooting

### "Session creation failed"

```bash
# Check relay key is set
echo $CRANE_RELAY_KEY

# If empty, set it
export CRANE_RELAY_KEY="your-key"

# Try again
/sod
```

### "Cannot determine venture"

```bash
# Check git remote
git remote -v

# If not in a console repo, specify explicitly
/sod vc 1
```

### "Docs not appearing"

```bash
# Check cache directory
ls -la /tmp/crane-context/docs/

# If empty, check session creation logs
# Context Worker may be down or key may be invalid
```

---

## Best Practices

### DO:

✅ Run `/sod` at start of every work session
✅ Create handoffs when leaving work mid-task
✅ Keep CRANE_RELAY_KEY in your shell profile
✅ Reference cached docs frequently

### DON'T:

❌ Skip SOD and work without context
❌ Commit sensitive keys to repos
❌ Assume docs haven't changed (always run SOD)
❌ Work across multiple repos without separate SOD calls

---

## Integration with Other Processes

### With PR Workflow

1. SOD (get context)
2. Work on issue
3. Create PR
4. EOD (update issue, handoff if needed)

### With Track Coordination

1. Planning agent: SOD + organize backlog
2. Track agents: SOD + work on assigned track
3. EOD: All agents update progress

### With Handoffs

1. Previous agent: EOD + create handoff doc
2. Next agent: SOD + read handoff
3. Continue work seamlessly

---

## Quick Reference

```bash
# Standard session start
cd ~/path/to/crane-console
export CRANE_RELAY_KEY="your-key"
/sod

# Explicit venture/track
/sod vc 2

# Check cached docs
ls /tmp/crane-context/docs/

# Read a doc
cat /tmp/crane-context/docs/team-workflow.md

# Create handoff
vim docs/handoffs/$(date +%Y-%m-%d)-handoff.md
```

---

## Summary

**SOD = Load Context** → Work with full knowledge
**EOD = Clean Handoff** → Next session starts smoothly

Keep it simple:

1. Start: `/sod`
2. Work: Reference docs as needed
3. End: Handoff if mid-task, update issues

That's it!
