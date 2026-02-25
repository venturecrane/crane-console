# Fleet vs Local Sprint Decision Framework

When to use `/orchestrate` (fleet) vs `/sprint` (local) for parallel issue execution.

## Quick Decision

| Condition                                         | Use                       |
| ------------------------------------------------- | ------------------------- |
| 4+ independent issues across different components | Fleet (`/orchestrate`)    |
| 1-3 issues, or issues with high file overlap      | Local (`/sprint`)         |
| Only 1-2 healthy fleet machines available         | Local (`/sprint`)         |
| CI on main is broken                              | Fix CI first, then decide |

## Factors

### Issue Count and Independence

- **Fleet advantage**: Fleet shines with 4+ issues that can run truly in parallel across machines. Each machine handles one issue with full resources.
- **Local advantage**: For 1-3 issues, the overhead of SSH dispatch, monitoring, and cross-machine coordination outweighs the parallelism benefit.

### File Overlap Risk

- **Fleet risk**: Issues modifying the same files (especially CSS, shared configs, or API routes) create merge conflicts that require manual resolution in the COLLECT phase. The more overlap, the more painful fleet becomes.
- **Local advantage**: Local sprint agents still run in separate worktrees, but conflicts are caught earlier and the operator can coordinate merge order immediately.
- **Mitigation**: The overlap detection warning (Step 2c in `/orchestrate`) flags this risk before dispatch.

### Machine Availability

- **Minimum viable fleet**: At least 3 healthy machines with combined concurrency >= issue count. Otherwise, the fleet queue is slower than local execution.
- **Check**: Run fleet health checks before committing to fleet mode. If 2+ machines are unreachable, fall back to local.

### Machine Reliability

- **Check `~/.crane/fleet-reliability.json`**: Machines below 70% success rate should be deprioritized or excluded. Two unreliable machines effectively reduce your fleet to the reliable ones.
- **Historic patterns**: Some machines crash frequently due to resource constraints. If your fleet's effective capacity (reliable machines only) is 3 or fewer, local may be faster.

### CI Health on Main

- **Pre-requisite for both modes**: CI must pass on main before dispatching. Agents that encounter pre-existing CI failures will waste time or fail immediately (depending on the CI-fix scoping guard).
- **Fleet amplification**: A broken CI on main wastes time on every machine simultaneously. Fix CI first.

### Dependency Chains

- **Simple chains**: If issues form a linear chain (A -> B -> C), fleet offers no advantage since they must execute sequentially anyway.
- **Wide graphs**: If you have multiple independent issues with one or two dependent follow-ups, fleet handles the independent wave well.

## Decision Matrix

```
START
  |
  v
How many issues? ----[1-3]----> /sprint (local)
  |
  [4+]
  |
  v
CI passing on main? ---[No]----> Fix CI first
  |
  [Yes]
  |
  v
High file overlap? ---[Yes]----> /sprint (local) or split into waves
  |
  [No]
  |
  v
3+ healthy machines? ---[No]----> /sprint (local)
  |
  [Yes]
  |
  v
/orchestrate (fleet)
```

## Post-Sprint Lessons (sprint_e4c439ce42fd)

This framework was created from the fleet orchestration post-mortem:

- **6/6 issues merged in ~2 hours** - fleet works well for independent issues
- **55-minute churn** on pre-existing CI failure - now blocked by CI-fix scoping guard
- **2/4 machines unreliable** - reliability scoring now deprioritizes them
- **globals.css caused O(n) conflicts** - overlap detection now warns before dispatch
- **Manual worktree cleanup** on every crash - auto-cleanup now handles this

## Related

- `/orchestrate` command: `.claude/commands/orchestrate.md`
- `/sprint` command: `.claude/commands/sprint.md`
- Sprint worker agent: `.claude/agents/sprint-worker.md`
