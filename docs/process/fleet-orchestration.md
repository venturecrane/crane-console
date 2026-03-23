# Fleet Orchestration Process

How Venture Crane executes development work in parallel across multiple machines.

## Overview

The enterprise runs a fleet of 5 machines connected via Tailscale mesh. When multiple independent issues need implementation, work is dispatched across machines so agents run in parallel — each machine handles one or more issues in isolated git worktrees, pushes branches, and opens PRs.

Two modes exist:

| Mode                    | Command        | Where                              | When                                              |
| ----------------------- | -------------- | ---------------------------------- | ------------------------------------------------- |
| **Local sprint**        | `/sprint`      | Single machine, parallel worktrees | 1-3 issues, or limited fleet availability         |
| **Fleet orchestration** | `/orchestrate` | Multiple machines via SSH          | 4+ independent issues across different components |

## The Process End-to-End

### 1. Issue Selection

The Captain (or a planning agent) selects which GitHub issues go into the sprint. Selection criteria:

- Issues have `status:ready` label
- Issues have clear acceptance criteria in the body
- Issues are independent (no blocking dependencies within the set, or dependencies form a clean wave structure)

### 2. Decision: Local or Fleet

Use the decision matrix in `docs/process/fleet-decision-framework.md`:

```
Issues ≤3 OR high file overlap OR <3 healthy machines → /sprint (local)
Issues ≥4 AND independent AND 3+ healthy machines → /orchestrate (fleet)
```

### 3. Pre-flight Checks

Before any work dispatches:

- **CI on main must pass.** A broken main wastes every agent's time simultaneously.
- **Fleet health check.** SSH connectivity, disk space, and reliability scores for each machine.
- **Overlap detection.** Issues referencing the same files get flagged — merge conflicts are expensive across machines.

### 4. Wave Planning

Issues are scheduled into waves based on dependencies and machine capacity:

- **Wave 1:** All issues with no in-sprint dependencies, up to total fleet concurrency
- **Wave 2:** Issues that depend on Wave 1 completions
- **Cycles** (A depends on B, B depends on A) are rejected — fix the dependency graph first

Each wave is a complete dispatch-monitor-collect cycle. Only one wave runs at a time.

### 5. Dispatch

**Local (`/sprint`):**

- Creates git worktrees at `.worktrees/{issue-number}` branching from `origin/main`
- Installs dependencies in each worktree
- Spawns parallel `sprint-worker` agents (one per issue)

**Fleet (`/orchestrate`):**

- Assigns issues to machines (round-robin, weighted by reliability score)
- Dispatches via `crane_fleet_dispatch` MCP tool which SSH's to the target machine
- Each machine runs `crane {venture}` to start a headless agent session
- Agent receives the issue and works in an isolated worktree on that machine

### 6. Execution (Per Agent)

Each sprint-worker agent, whether local or remote:

1. Reads `CLAUDE.md` for project conventions
2. Reads the issue body for requirements and acceptance criteria
3. Implements the change in the isolated worktree
4. Runs the verify command (`npm run verify` or equivalent)
5. If verify fails: fixes the issue and retries (up to 3 attempts)
6. Commits, pushes the branch, opens a PR via `gh pr create`
7. Writes `result.json` to the worktree root with outcome metadata

**Constraints on workers:**

- NEVER operate outside the assigned worktree
- NEVER push to main or merge PRs
- NEVER modify files unrelated to the issue
- Prefix every bash command with `cd {WORKTREE_PATH} &&`

### 7. Monitoring (Fleet Only)

The orchestrator polls each machine for task status:

- Poll interval: 30s initial, exponential backoff to 5 min max
- Status transitions: `dispatched` → `running` → `completed` / `failed`
- Live progress display with per-machine status table

### 8. Collection

After all agents in a wave complete:

- **Successful:** PR is open, issue label updated to `status:review`
- **Failed:** Orchestrator offers retry (fresh worktree from `origin/main`) or skip
- One retry per failed issue, second failure is final

### 9. Merge and Next Wave

The Captain reviews and merges PRs from the completed wave. Then:

- If more waves remain: `re-run /sprint {remaining issues}` or `/orchestrate --resume {sprint_id}`
- If all waves done: sprint complete

### 10. Cleanup

- Local worktrees removed: `git worktree remove --force`
- Sprint lock file cleared
- Branches preserved (they back the open PRs)
- Fleet machines: remote worktrees cleaned up by the dispatch tool

## Fleet Topology

| Machine | Role                         | Max Concurrent        | Reliability                             |
| ------- | ---------------------------- | --------------------- | --------------------------------------- |
| mac23   | Orchestrator (Captain's Mac) | 3 (local sprint only) | —                                       |
| m16     | Worker                       | 3                     | Check `~/.crane/fleet-reliability.json` |
| mini    | Worker (always-on server)    | 2                     | Check reliability file                  |
| mbp27   | Worker                       | 2                     | Check reliability file                  |
| think   | Worker                       | 1                     | Check reliability file                  |

mac23 orchestrates but does not receive fleet dispatch work (avoids resource contention with the orchestrator). For local sprints, mac23 uses its own capacity.

## Key Files

| File                                              | Purpose                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `.claude/commands/sprint.md`                      | Local sprint command (single machine, parallel worktrees)           |
| `.claude/commands/orchestrate.md`                 | Fleet orchestrator command (multi-machine dispatch)                 |
| `.claude/agents/sprint-worker.md`                 | Sprint worker agent definition (behavioral rules for coding agents) |
| `docs/process/fleet-decision-framework.md`        | When to use fleet vs local                                          |
| `packages/crane-mcp/src/tools/fleet-dispatch.ts`  | MCP tool for SSH-based task dispatch                                |
| `packages/crane-mcp/src/tools/fleet-status.ts`    | MCP tool for remote task status polling                             |
| `packages/crane-mcp/src/lib/fleet-reliability.ts` | Reliability scoring for fleet machines                              |
| `~/.crane/fleet-reliability.json`                 | Per-machine success/failure history                                 |
| `~/.crane/sprints/{id}.json`                      | Sprint state cache (for resume support)                             |

## Failure Modes and Mitigations

| Failure                             | Mitigation                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| CI broken on main                   | Pre-flight check blocks dispatch until CI is fixed                             |
| Machine unreachable during dispatch | Excluded from assignment, work redistributed to healthy machines               |
| Agent crashes mid-work              | Retry with fresh worktree from origin/main (one retry max)                     |
| Merge conflicts between PRs         | Overlap detection warns before dispatch; merge in order of fewest shared files |
| Machine runs out of disk            | Health check verifies disk space before dispatch                               |
| Stale local main                    | Worktrees branch from `origin/main` (fetched fresh), not local main            |
| Concurrent sprint collision         | Lock file (`/.worktrees/.sprint.lock`) prevents multiple sprints               |

## Related Processes

- **Issue creation:** `docs/instructions/creating-issues.md`
- **PR workflow:** `docs/process/pr-workflow.md`
- **QA grading:** `docs/process/dev-directive-qa-grading.md`
- **Parallel dev tracks:** `docs/process/parallel-dev-track-runbook.md`
