# /sos - Start of Session

1. Call `crane_sos` MCP tool (returns formatted briefing).
2. Call `crane_schedule(action: "planned-events", from: "{today}", to: "{today}", type: "planned")`.
3. **Orphan worktree backstop** — see below. Auto-remove provably-safe orphans from sessions that ended unnaturally; surface the rest. Compute a one-line worktree status line for the briefing.
4. Display briefing. Prepend the worktree status line from Step 3 (omit if no orphans found and no warning). Highlight any Resume block or P0 issues.
5. If cadence items overdue, ask: "Execute any now, or skip?"
6. **STOP.** If Resume block: "Previous session was working on [summary]. Resume or focus elsewhere?" Otherwise: "What would you like to focus on?"

## Step 3 — Orphan Worktree Backstop

Closes the exit-side gap from PR #789's parallel-isolation system. `/eos` is the deterministic primary path; this step handles sessions that ended unnaturally (closed terminal, force-quit, kernel panic).

**Scope.** Worktrees under `.claude/worktrees/` only. Skip the worktree this session is currently in (if any) — that's `/eos`'s responsibility.

**Cap.** If more than 20 orphans found, evaluate the 20 most recent by mtime and surface a one-line warning. "Evaluated" means the classification logic ran — it does NOT imply removal happened. Cleaned/surfaced counts are reported separately on the briefing line:

```
Worktrees: <N> orphans found, evaluating 20 most recent by mtime; <N-20> deferred. Run `git worktree list` and clean manually if intentional.
```

**Single-shot setup** (run once at top of step):

```bash
git fetch origin main --quiet 2>/dev/null

# One batched gh call; cache the headRefName→PR-number map locally
MERGED_PRS_JSON=$(gh pr list --state merged --limit 100 --json number,headRefName 2>/dev/null || echo '[]')
# Use jq to lookup later: echo "$MERGED_PRS_JSON" | jq -r --arg b "$BRANCH" '.[] | select(.headRefName == $b) | .number'

CURRENT_PWD=$(pwd)
NOW_TS=$(date +%s)
SIXTY_MIN_AGO=$((NOW_TS - 3600))
```

**For each orphan worktree path**, classify in this exact order:

1. **Skip if it's this session's own worktree.** `[[ "$CURRENT_PWD" == "$WORKTREE_PATH"* ]]` → skip (it's `/eos`'s job).

2. **Lock triage.** `git worktree list --porcelain` exposes any per-worktree lock with a `locked <reason>` line. Parse the lock state for this path (or skip this sub-step if not locked):
   - **Recognized owner pattern, alive PID** (`claude agent .* (pid <N>)` and `ps -p <N>` exits 0) → live agent owns this worktree; skip.
   - **Recognized owner pattern, dead PID** (`claude agent .* (pid <N>)` and `ps -p <N>` exits non-zero) → stale lock from a crashed Claude session. Force-unlock with `git worktree unlock "$WORKTREE_PATH"` and continue evaluation through the remaining sub-steps as if it had never been locked.
   - **Foreign lock pattern** (anything else, including bare `locked` with no reason) → surface as "needs review" with reason `locked: <truncated reason or 'no reason'>`. Do not unlock — the lock was set by something we don't recognize.

3. **Skip if anything is using the directory.** `lsof +D "$WORKTREE_PATH" 2>/dev/null` — if exit code is 0 AND output non-empty, treat as live and skip. This catches all process names (`claude`, `claude-code`, `node /path/to/cli.js`, wrappers, shells with that cwd) and all FD types (cwd, mmap, log, any). This still runs after a force-unlock from sub-step 2 — it is the independent fallback that catches the case where a dead PID appears in the lock reason but a different live process is using the directory.

4. **Skip if HEAD is fresh.** `HEAD_TS=$(git -C "$WORKTREE_PATH" log -1 --format=%ct HEAD 2>/dev/null)` — if `$HEAD_TS -gt $SIXTY_MIN_AGO`, refuse auto-remove and add to "needs review" with reason "fresh HEAD". Independent staleness signal.

5. **Provably safe — auto-remove.** Required: ALL of the following.
   - `git -C "$WORKTREE_PATH" status --porcelain` empty (clean tree).
   - One of: (a) `git -C "$WORKTREE_PATH" cherry origin/main "$BRANCH"` returns no `+`-prefixed lines (squash-merged or empty); or (b) `git -C "$WORKTREE_PATH" log "$BRANCH" --not origin/main --oneline` is empty (direct merge); or (c) `echo "$MERGED_PRS_JSON" | jq -e --arg b "$BRANCH" 'any(.headRefName == $b)'` returns 0 (PR was merged).

   Action:

   ```bash
   git worktree remove --force "$WORKTREE_PATH" \
     && git branch -D "$BRANCH" 2>/dev/null
   ```

   Add to "cleaned" list with the worktree id (last path segment). If the worktree was force-unlocked in sub-step 2, append `(unlocked)` to its entry: `agent-a0324558 (unlocked)`.

6. **Has work — surface, do not touch.** Add to "needs review" with reason:
   - dirty tree → "dirty: \<file count\>"
   - unmerged commits → "\<commit count\> commit(s) ahead"
   - fresh HEAD → "fresh HEAD"
   - foreign lock → "locked: \<reason\>" (from sub-step 2)

**Compose the briefing line** (omit entirely if both lists are empty AND no warning):

```
Worktrees: cleaned <N> orphan(s) [<id1>, <id2>]; <M> needs review [<id3>: <reason>, <id4>: <reason>]
```

If only one half applies, omit the empty half. Examples:

- `Worktrees: cleaned 2 orphan(s) [robust-fluttering-oasis, shiny-toasting-prism]`
- `Worktrees: 1 needs review [test-pending: 1 commit(s) ahead]`
- `Worktrees: cleaned 1 orphan(s) [test-squash]; 1 needs review [test-pending: 1 commit(s) ahead]`
- `Worktrees: cleaned 6 orphan(s) [agent-a0324558 (unlocked), agent-a09306ec (unlocked), ...]; 11 needs review [agent-a1705f92: dirty: 11, agent-a17f5148: dirty: 11, ...]`

**Conservative auto-remove rationale:** clean tree + merged-via-cherry-or-log-or-PR + no active FD usage + HEAD older than 60 min. Four independent signals before any destructive action. False positive (a live worktree gets removed) requires all four to be wrong simultaneously. Force-unlock (sub-step 2) does not weaken this — sub-steps 3, 4, 5 still run after, so a dead-PID lock paired with a live process or fresh HEAD still skips the worktree.

## Rules

- All GitHub issues this session target the repo shown in context. Targeting a different repo? STOP.
- Do NOT start working automatically.
- Do NOT create calendar events for cadence items.
- If MCP tools unavailable: check `claude mcp list`, ensure started with `crane vc`.
