# Multi-Agent Coordination

How multiple agents coordinate work across the same ventures and repositories without stepping on each other.

## Overview

Venture Crane regularly runs multiple agents in parallel -- either on the same machine (local sprint) or across fleet machines (fleet orchestration). Coordination relies on four mechanisms:

1. **Session groups** in crane-context for mutual awareness
2. **Git worktree isolation** so each agent has its own working directory
3. **Branch naming conventions** to avoid collisions
4. **Handoff chains** for context passing between sequential sessions

For the mechanics of dispatching parallel work, see `docs/process/fleet-orchestration.md`.

## Session Groups

When multiple agents work on the same venture or repo simultaneously, they share a `session_group_id`. This is set during `POST /sod` (start of day) and links the sessions in crane-context's D1 database.

### How Grouping Works

Each agent calls `/sod` with its session parameters (agent name, venture, repo, track number). If a `session_group_id` is provided, the session is associated with that group.

Agents can discover their siblings via `GET /siblings?session_group_id={id}`, which returns:

- Session ID, agent name, venture, repo, track number
- Issue number being worked
- Branch name
- Last heartbeat timestamp

This allows an agent to know who else is active, what they are working on, and whether they are still alive.

### SOD Conflict Detection

When an agent calls `/sod`, crane-context checks for existing active sessions matching the same (agent, venture, repo, track) tuple:

1. **No existing session** -- A new session is created.
2. **One active session, not stale** -- The session is resumed (heartbeat refreshed).
3. **One active session, stale** (no heartbeat for 45+ minutes) -- The stale session is marked `abandoned`, and a new session is created.
4. **Multiple active sessions** -- The most recent is kept; all others are marked `superseded`. Then the staleness check runs on the survivor.

This prevents ghost sessions from blocking new work.

### Session Lifecycle Constants

| Constant                     | Value        | Purpose                                  |
| ---------------------------- | ------------ | ---------------------------------------- |
| `STALE_AFTER_MINUTES`        | 45 minutes   | Session considered dead if no heartbeat  |
| `HEARTBEAT_INTERVAL_SECONDS` | 600 (10 min) | Base interval between heartbeats         |
| `HEARTBEAT_JITTER_SECONDS`   | 120 (2 min)  | Random jitter to prevent thundering herd |

Heartbeat interval with jitter gives a range of 8-12 minutes between beats, with a 45-minute timeout providing a 4.5x safety margin.

## Worktree Isolation

Each agent works in its own git worktree, branched from `origin/main`. This provides complete filesystem isolation -- agents cannot accidentally modify each other's files.

### Local Sprint Worktrees

For `/sprint` (single machine, multiple agents):

- Worktrees are created at `.worktrees/{issue-number}` relative to the repo root
- Each worktree gets its own `node_modules` via `npm ci`
- A lock file (`.worktrees/.sprint.lock`) prevents multiple sprints from running simultaneously

### Fleet Worktrees

For `/orchestrate` (multi-machine):

- Each machine creates worktrees under `~/.crane/tasks/{task_id}/worktree`
- The orchestrator cleans up remote worktrees after collection

### Worktree Rules

Agents in worktrees must follow strict constraints:

- Never operate outside the assigned worktree directory
- Never push to `main` or merge PRs directly
- Never modify files unrelated to the assigned issue
- Prefix every shell command with `cd {WORKTREE_PATH} &&`

## Branch Naming Conventions

Branch names encode enough information to identify the agent, issue, and purpose at a glance.

### Sprint Branches

For sprint-executed issues:

```
{issue-number}-{slugified-title}
```

Examples: `45-fix-balance-calc`, `42-add-expense-filter`

The title is lowercased, spaces replaced with hyphens, non-alphanumeric characters removed, truncated to 50 characters, and trailing hyphens stripped.

### Parallel Dev Track Branches

For manual parallel tracks on different machines:

```
dev/{instance}/{feature}
```

Examples: `dev/host/fix-relay-timeout`, `dev/crane1/add-lot-filter`

Instance identifiers correspond to physical machines or VMs.

### Collision Avoidance

- Sprint branches use issue numbers as prefixes, which are globally unique within a repo.
- Dev track branches include the instance identifier.
- If a branch already exists during sprint execution, the agent asks the user to reuse or create a `-2` suffixed variant.

## Handoff Chains

Handoff documents are the primary mechanism for passing context between sequential agent sessions. When agent A finishes a session (`/eod`), it writes a handoff containing its progress, open questions, and next steps. When agent B starts (`/sod`), it reads the latest handoff for that venture/repo/track.

### Handoff Flow

```
Agent A: /sod (creates session) -> works -> /eod (writes handoff, ends session)
                                                    │
Agent B: /sod (creates session, reads handoff) <────┘
```

### Handoff Query Modes

Handoffs can be queried by:

- **Issue number** -- Get the latest handoff for a specific issue
- **Track number** -- Get the latest handoff for a parallel track
- **Session ID** -- Get the handoff from a specific session

### What Handoffs Contain

Handoff payloads are free-form JSON (up to 800KB) but typically include:

- Summary of work completed
- Files changed and why
- Open questions or blockers
- Suggested next steps
- Branch name and commit SHA

## Parallel Tracks

Track numbers provide a lightweight coordination mechanism for multi-stream work within the same venture/repo. Each track is an independent stream of work.

### How Tracks Work

- Track numbers are integers assigned when an agent starts a session
- Sessions with different track numbers are independent and do not conflict
- Sessions with the same track number are sequential (one replaces the other)
- The track number appears in session queries and handoff lookups

### When to Use Tracks

- **Single issue work** -- No track needed (default)
- **Two independent features in the same repo** -- Assign track 1 and track 2
- **Sprint execution** -- Each issue effectively gets its own track via the sprint framework

## File Overlap Risks and Merge Conflict Prevention

The most common coordination failure is two agents modifying the same file. Prevention happens at multiple levels:

### Pre-Dispatch Detection

The `/orchestrate` command scans issue bodies for file path references before dispatching. If two issues in the same wave reference the same file, a warning is displayed:

```
Warning: Potential merge conflict risk
  - src/components/Layout.tsx referenced by #42, #47
```

This is advisory and does not block dispatch.

### Component Labels

Issues tagged with the same `component:*` label in the same sprint wave trigger a conflict warning. This catches overlap even when issue bodies do not mention specific files.

### Merge Order

PRs are merged in dependency order (Wave 1 before Wave 2, within a wave by issue number). The agent with the fewest shared-file touches should merge first to minimize conflict surface.

### When Conflicts Occur

If a merge conflict happens:

1. The merge operation stops and escalates to the user
2. The conflicting PR is left open for manual resolution
3. The sprint can be resumed with `--resume` after the conflict is resolved

## When to Use Parallel Agents vs Sequential Work

| Scenario                                          | Approach            | Reason                                    |
| ------------------------------------------------- | ------------------- | ----------------------------------------- |
| 4+ independent issues across different components | Fleet orchestration | Maximum throughput, minimal conflict risk |
| 1-3 issues, or high file overlap                  | Local sprint        | Simpler coordination, one machine         |
| Issues with strict dependencies (A before B)      | Sequential work     | Wave planning adds overhead for chains    |
| Exploratory/research work                         | Single agent        | Unclear scope makes parallelism wasteful  |
| Cross-cutting refactor touching many files        | Single agent        | High conflict risk with parallel agents   |
| Emergency fix on production                       | Single agent        | Speed and focus over throughput           |

The decision framework is documented in detail in `docs/process/fleet-decision-framework.md`.

## Key Files

| File                                         | Purpose                                        |
| -------------------------------------------- | ---------------------------------------------- |
| `workers/crane-context/src/sessions.ts`      | Session CRUD, resume logic, sibling queries    |
| `workers/crane-context/src/constants.ts`     | Session timing constants, heartbeat config     |
| `.agents/skills/sprint/SKILL.md`             | Local sprint skill (sequential on one machine) |
| `.claude/commands/orchestrate.md`            | Fleet orchestrator command                     |
| `docs/process/fleet-orchestration.md`        | Fleet orchestration process overview           |
| `docs/process/parallel-dev-track-runbook.md` | Manual parallel track runbook                  |
| `docs/process/fleet-decision-framework.md`   | Decision matrix: local vs fleet                |
