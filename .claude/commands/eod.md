# /eod - End of Day Handoff

Auto-generate handoff from session context. The agent summarizes - never ask the user.

## Usage

```
/eod
```

## Execution Steps

### 1. Gather Session Context

The agent has full conversation history. Additionally, gather:

```bash
# Get repo info
REPO=$(git remote get-url origin | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?$/\1/')

# Get commits from this session (last 24 hours or since last handoff)
git log --oneline --since="24 hours ago" --author="$(git config user.name)"

# Get any PRs created/updated today
gh pr list --author @me --state all --json number,title,state,updatedAt --jq '.[] | select(.updatedAt | startswith("'$(date +%Y-%m-%d)'"))'

# Get issues worked on (from commits or conversation)
gh issue list --state all --json number,title,state,updatedAt --jq '.[] | select(.updatedAt | startswith("'$(date +%Y-%m-%d)'"))'
```

### 2. Synthesize Handoff (Agent Task)

Using conversation history and gathered context, the agent generates:

**Accomplished:** What was completed this session

- Issues closed/progressed
- PRs created/merged
- Problems solved
- Code changes made

**In Progress:** Unfinished work

- Where things were left off
- Partial implementations
- Pending reviews

**Blocked:** Items needing attention

- Blockers encountered
- Questions for PM
- Decisions needed
- External dependencies

**Next Session:** Recommended focus

- Logical next steps
- Priority items
- Follow-ups needed

### 3. Read Current Handoff

```bash
HANDOFF_FILE="docs/handoffs/DEV.md"
cat "$HANDOFF_FILE" 2>/dev/null || echo "No existing handoff"
```

### 4. Write Updated Handoff

Generate the complete handoff file:

```markdown
# Dev Handoff

**Last Updated:** YYYY-MM-DD
**Session:** [agent/machine identifier]

## Summary

[2-3 sentence overview of the session]

## Accomplished

- [Bullet list of completed items with issue/PR links]

## In Progress

- [Bullet list of unfinished work with context]

## Blocked

- [Bullet list of blockers, or "None"]

## Next Session

- [Bullet list of recommended next steps]
```

### 5. Show User for Confirmation

Display the generated handoff and ask:

```
Here's the handoff I generated:

[show handoff content]

Commit and push? (y/n)
```

Only ask this single yes/no question. Do not ask user to write or edit the summary.

### 6. Commit and Push

```bash
HANDOFF_FILE="docs/handoffs/DEV.md"
git add "$HANDOFF_FILE"
git commit -m "docs: update Dev handoff for $(date +%Y-%m-%d)"
git push
```

### 7. Report Completion

```
Handoff committed: docs/handoffs/DEV.md
```

## Key Principle

**The agent summarizes. The user confirms.**

The agent has full session context - every command run, every file edited, every conversation turn. It should synthesize this into a coherent handoff without asking the user to remember or summarize anything.

The only user input is a yes/no confirmation before committing.

## Handoff File Location

| Repository Type | Handoff Path           |
| --------------- | ---------------------- |
| All repos       | `docs/handoffs/DEV.md` |
