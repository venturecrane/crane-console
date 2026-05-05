# /eos - End of Session Handoff

Auto-generate handoff from session context. The agent summarizes - never ask the user.

## Usage

```
/eos
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

### 1.5 Inspect Worktree State (Read-Only)

Determine whether this session is running inside a `.claude/worktrees/<id>/` worktree, and pre-compute the cleanup decision so Step 2 can write an accurate handoff. **No destructive actions in this step.**

```bash
PWD_OUT=$(pwd)
if [[ "$PWD_OUT" != *"/.claude/worktrees/"* ]]; then
  WORKTREE_DECISION=n/a
else
  WORKTREE_PATH="$PWD_OUT"
  WORKTREE_ID="${WORKTREE_PATH##*/}"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  STATUS=$(git status --porcelain)

  # Refresh main; ignore failure (offline OK — fall through to PR check)
  git fetch origin main --quiet 2>/dev/null

  # Squash-merge-aware ahead check (canonical post-squash idiom; offline-safe).
  # `git cherry` outputs `+` for commits NOT on main, `-` for patch-equivalent on main.
  CHERRY=$(git cherry origin/main "$BRANCH" 2>/dev/null)
  MERGED_VIA_CHERRY=false
  if [ -z "$CHERRY" ] || ! echo "$CHERRY" | grep -q '^+'; then
    MERGED_VIA_CHERRY=true
  fi

  # Direct-ancestor check (fast-forward / rebase merges)
  AHEAD=$(git log "$BRANCH" --not origin/main --oneline 2>/dev/null)
  MERGED_VIA_LOG=false
  [ -z "$AHEAD" ] && MERGED_VIA_LOG=true

  # PR-merged tertiary check (network-dependent)
  PR_NUM=$(gh pr list --head "$BRANCH" --state merged --json number --jq '.[0].number // empty' 2>/dev/null)
  PR_MERGED=false
  [ -n "$PR_NUM" ] && PR_MERGED=true

  if [ -z "$STATUS" ]; then
    if [ "$MERGED_VIA_CHERRY" = true ] || [ "$MERGED_VIA_LOG" = true ] || [ "$PR_MERGED" = true ]; then
      WORKTREE_DECISION=remove
    else
      WORKTREE_DECISION=keep_unpushed
    fi
  else
    WORKTREE_DECISION=keep_dirty
    DIRTY_FILE_COUNT=$(echo "$STATUS" | wc -l | tr -d ' ')
  fi
fi
```

Stash `WORKTREE_DECISION`, `WORKTREE_PATH`, `BRANCH`, and `DIRTY_FILE_COUNT` for use in Steps 2 and 5.5. Decision values:

- `n/a` — not in a worktree (skip cleanup)
- `remove` — clean tree AND merged via cherry, log, or PR
- `keep_unpushed` — clean tree, commits ahead of main, no merged PR (work needs follow-up)
- `keep_dirty` — uncommitted changes present

### 2. Synthesize Handoff (Agent Task)

Using conversation history and gathered context, the agent generates a summary covering:

**Accomplished:** What was completed this session

- Issues closed/progressed
- PRs created/merged
- Problems solved
- Code changes made

**In Progress:** Unfinished work — write as pickup instructions for an agent with NO conversation history

- Include specific file paths, function names, and branch names
- State exactly where you stopped: "Function X is partially implemented in file Y"
- List what remains as numbered steps

**Blocked:** Items needing attention

- Blockers encountered
- Questions for PM
- Decisions needed
- External dependencies

**Next Session:** Recommended focus — write as an ordered action plan

- "1. Open src/foo.ts and complete the retryWithBackoff() function"
- "2. Run npm test — expect 2 new tests to pass"
- "3. Create PR for issue #123"

**Worktree-aware resume guidance:**

- If `WORKTREE_DECISION` from Step 1.5 is `keep_unpushed` or `keep_dirty`, the **In Progress** and **Next Session** sections MUST start with `cd $WORKTREE_PATH && git checkout $BRANCH` so an agent with no context resumes in the right place. For `keep_dirty`, also list the modified files.
- If `WORKTREE_DECISION` is `remove` or `n/a`, do NOT reference the worktree path or branch in the handoff — the worktree will be gone after Step 5.5 and the reference would mislead the next session.

### 3. Display and Save (Auto-Save)

Display the generated handoff, then **immediately save it to D1 without asking for confirmation.** Do not prompt the user with "Save to D1?" or any yes/no question. Just show the summary and save.

### 4. End Work Day

Call `POST /work-day` with `action: "end"` via the `upsertWorkDay` API method.

### 5. Save Handoff via MCP

Call the `crane_handoff` MCP tool with:

- `summary`: The synthesized handoff text
- `status`: One of `in_progress`, `blocked`, or `done` (infer from context)
- `issue_number`: If a primary issue was being worked on

This writes to D1 via the Crane Context API. The next session's SOD will read it.

**Important:** When status is `in_progress`, the full summary is shown to the next session's SOD briefing. Write "In Progress" and "Next Session" as if giving instructions to another developer who has zero context from this conversation.

#### Cross-venture sessions

If work was done across multiple ventures this session (e.g., started in dc-console then switched to crane-console), write a separate handoff for each venture:

1. Identify all ventures that had meaningful work this session (commits, PRs, code changes, issue progress).
2. For each venture EXCEPT THE LAST, call `crane_handoff` with `venture: "<code>"` AND `final: false`. The `final: false` flag tells the API to create the handoff record but keep the session active so the next call doesn't 409 with "Session is not active".
3. For the FINAL venture, call `crane_handoff` without `final` (or with `final: true`). This call ends the session.
4. Each handoff summary should cover only the work relevant to that venture.

Example for a session that touched both `dc` and `vc`:

```
crane_handoff(summary: "Rebuilt AI assist panels...", status: "done", venture: "dc", final: false)
crane_handoff(summary: "Added /ship skill, command sync...", status: "done", venture: "vc")
```

Order doesn't strictly matter, but the LAST call must omit `final: false` (or pass `final: true`) so the session terminates cleanly.

### 5.5 Execute Worktree Decision

Acts on `WORKTREE_DECISION` from Step 1.5. For cross-venture sessions, this runs **once**, after the FINAL `crane_handoff` call (the one without `final: false`). Earlier per-venture handoffs do NOT trigger cleanup — the session is still active.

1. **`WORKTREE_DECISION=n/a`** — skip; jump to Step 6.

2. **`WORKTREE_DECISION=remove`** — call:

   ```
   ExitWorktree(action: "remove", discard_changes: true)
   ```

   `discard_changes: true` is required when local commits exist (post-squash case): the substance is already on main as a squash commit, but the original branch commits are not ancestors of `origin/main` and the harness needs explicit consent to discard them.

3. **`WORKTREE_DECISION=keep_unpushed`** or **`keep_dirty`** — call:

   ```
   ExitWorktree(action: "keep")
   ```

   Worktree stays, branch stays, next session resumes via the handoff text written in Step 2.

4. **Fallback on `ExitWorktree` failure** (rare — running outside the harness, session-state mismatch, etc.):
   - For `remove`: attempt raw cleanup. Identify canonical repo path (`git rev-parse --git-common-dir` then resolve up two levels from `.git`, or use the path before `/.claude/worktrees/` in `WORKTREE_PATH`). Then:
     ```bash
     CANONICAL="${WORKTREE_PATH%/.claude/worktrees/*}"
     cd "$CANONICAL"
     git worktree remove --force "$WORKTREE_PATH" \
       && git branch -D "$BRANCH"
     ```
     If raw cleanup also fails, capture both error messages for Step 6 — do NOT crash `/eos`.
   - For `keep_unpushed` or `keep_dirty`: ExitWorktree failure is non-fatal; the worktree was going to stay anyway.

### 6. Report Completion

Build the closing line based on `WORKTREE_DECISION` and the actual outcome of Step 5.5:

```
Handoff saved to D1. Worktree: {removed | kept (unpushed: <branch>) | kept (dirty: <N> file(s)) | n/a | remove failed (see above)}. Next session will see this via crane_sos.
```

Examples:

- `Handoff saved to D1. Worktree: removed. Next session will see this via crane_sos.`
- `Handoff saved to D1. Worktree: kept (unpushed: feat/some-thing). Next session will see this via crane_sos.`
- `Handoff saved to D1. Worktree: kept (dirty: 3 file(s)). Next session will see this via crane_sos.`
- `Handoff saved to D1. Worktree: n/a. Next session will see this via crane_sos.`
- `Handoff saved to D1. Worktree: remove failed (ExitWorktree: <err>; raw cleanup: <err>). Next session will see this via crane_sos.`

## Key Principle

**The agent summarizes. The agent saves. No confirmation needed.**

The agent has full session context - every command run, every file edited, every conversation turn. It should synthesize this into a coherent handoff without asking the user to remember or summarize anything.

Auto-save directly to D1. Never ask "Save to D1?" or any confirmation question.
