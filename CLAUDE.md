# CLAUDE.md - Crane Console

This file provides guidance for Claude Code agents working in this repository.

## About This Repository

Crane Console is the central infrastructure and documentation hub for Venture Crane (VC) operations. It contains:

- **workers/** - Cloudflare Workers for shared services
  - `crane-relay/` - GitHub operations, QA events, AI classification
  - `crane-context/` - Session management, handoffs, documentation serving
- **docs/** - Process documentation, runbooks, and guides
- **scripts/** - Shell scripts for automation and setup
- **ventures/** - Venture-specific configurations and documentation

## Session Start

Always run `/sod` at the start of every session to:
- Create session in Context Worker
- Download current documentation
- Establish session context for handoffs

## Common Commands

```bash
# Session management
/sod                    # Start of day - load context
/eod                    # End of day - create handoff
/update                 # Update session context mid-session
/heartbeat              # Keep session alive

# Git workflow
/commit                 # Create commit with good message
/pr                     # Create pull request
```

## Build Commands

### Crane Relay
```bash
cd workers/crane-relay
npx wrangler dev        # Local dev server
npx wrangler deploy     # Deploy to Cloudflare
npx tsc --noEmit        # TypeScript validation
```

### Crane Context
```bash
cd workers/crane-context
npx wrangler dev        # Local dev server
npx wrangler deploy     # Deploy to Cloudflare
npx tsc --noEmit        # TypeScript validation
```

## Sub-agent Guidelines

When spawning sub-agents via Task tool:
- Provide specific task scope (files, functionality area)
- Include relevant decisions from current session
- State constraints (security, patterns to follow)
- Define success criteria
- Use appropriate agent type:
  - **Explore**: Finding files, understanding code
  - **Plan**: Designing implementation approach
  - **Bash**: Running commands, git operations

## Worktree Usage

When working with git worktrees:
- Each worktree = isolated directory, safe for parallel work
- Sub-agents can operate in different worktrees without conflicts
- Coordinate: don't have multiple agents modify same files
- Parent agent merges results after parallel work completes

## Parallel Work Anti-patterns

- Don't spawn agents without specific context
- Don't have parallel agents modify same files
- Don't spawn more agents before reading previous results
- Don't use "do whatever you think is best" prompts

## Security Requirements

### General
- Never commit secrets to the repository
- Use Bitwarden/environment variables for credentials
- Validate all input at API boundaries
- Use prepared statements for SQL (always `.bind()` in D1)

### Frontend Security
- Never include secrets/tokens in frontend bundles
- Whitelist API response fields, don't blacklist
- No PII unless explicitly required
- No internal IDs enabling enumeration

### Database Queries
```typescript
// CORRECT - parameterized
const result = await env.DB.prepare(
  'SELECT * FROM events WHERE event_id = ?'
).bind(eventId).first()

// WRONG - SQL injection risk
const result = await env.DB.prepare(
  `SELECT * FROM events WHERE event_id = ${eventId}`
).first()
```

## Test-Driven Development (Optional)

TDD works well for qa:0/qa:1 issues:
1. Write failing test first
2. Implement to pass test
3. Refactor if needed

Use developer judgment on when TDD adds value vs overhead.

## Model Selection

Use Opus for all work in this repository:
- Max plan makes cost fixed
- Enterprise infrastructure benefits from highest quality
- Consistency across planning and execution

## Problem Shaping (Plan Mode)

When entering plan mode for significant work, answer these questions first:

1. **What problem are we solving?**
   - User need or pain point
   - Why does this matter?

2. **What are the constraints?**
   - Technical limitations
   - Time/scope boundaries
   - Dependencies on other work

3. **What's in scope / out of scope?**
   - Explicit boundaries prevent scope creep
   - "We will NOT do X" is valuable

4. **What are the unknowns?**
   - Questions that need answers first
   - Risks that need investigation

5. **What does success look like?**
   - How will we know we're done?
   - What's the acceptance criteria?

Write answers to a plan file before implementation.

## Iteration Protocol

When iterating on complex work, don't rely on conversation memory:

1. **State in files, not memory**
   - Write approach/decisions to plan file
   - Reference the file, don't recall from conversation

2. **Track progress with tasks**
   - TaskCreate for each iteration round
   - Clear what was tried, what worked

3. **Commit between iterations**
   - Git commit provides checkpoint
   - Can always revert to known state

4. **Document decisions**
   - Note why approach X over Y
   - Future you (or another agent) needs this

**Anti-pattern:** "Continuing from where I was" without verification.

**Correct pattern:**
```
1. Check git status
2. Read relevant files
3. Verify current state
4. Then proceed
```

## Escalation Triggers

From team-workflow.md - mandatory stop points:

| Condition | Action |
|-----------|--------|
| Credential not found in 2 minutes | Stop. File issue. Ask Captain. |
| Same error 3 times (different approaches) | Stop. Escalate with what was tried. |
| Network/TLS errors from container | Stop. "Can't test from this environment." |
| Blocked >30 minutes on single problem | Time-box expired. Escalate or pivot. |

## Related Documentation

- `docs/process/team-workflow.md` - Team workflow and QA grading
- `docs/process/slash-commands-guide.md` - CLI command reference
- `docs/process/eod-sod-process.md` - Session handoff process
- `workers/crane-relay/CLAUDE.md` - Crane Relay specific guidance
- `workers/crane-context/CLAUDE.md` - Crane Context specific guidance
