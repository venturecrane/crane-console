# Git Authority

**Rule:** Force-push, `reset --hard`, and merge-into operations are pre-authorized only on **owned feature branches** verified by a mechanical test. Protected branches always escalate. Shared branches ask once.

<!-- SOD_SUMMARY_START -->

- Branch classes: **protected** (`main`, `release/*`) → always escalate; **owned feature** (mechanical test below passes) → pre-authorized; **shared feature** (test fails) → ask once before force-pushing
- Mechanical "owned" test: `git log "origin/$BRANCH" --not "$SESSION_START_SHA"` returns empty (no commits arrived from remote since session start)
- Pre-authorized on owned feature: `git push --force-with-lease`, local `git reset --hard origin/<branch>`, `git merge origin/main` into branch, `git rebase origin/main`
- Always-escalate regardless of class: force-push to `main`, `reset --hard` against uncommitted changes, `branch -D` against unmerged work, rewriting published commits on protected branches, bare `--force` (without `--with-lease`)
- Common false-pauses (these are NORMAL git, do NOT pause): `git merge origin/main` on a feature branch, `git pull --rebase origin main`, `gh pr merge --admin` (server-side merge, not a force-push)
<!-- SOD_SUMMARY_END -->

---

## Why This Module Exists

When `main` moves under an open PR, recovery normally involves rebase, force-push, and re-merge. Without a clear authority gradient, agents either over-pause (asking the Captain three times for the same routine operation) or over-extrapolate (force-pushing to a branch they share with another agent on another machine).

This module draws three crisp lines so neither failure mode happens.

## Branch Classes

### Protected — always escalate

`main`, `release/*`, and any branch with branch protection enabled. Every force-push, reset, or merge-into operation requires Captain confirmation. No exceptions. The cost of a wrong push to main is too high to assess on the fly.

### Owned feature — pre-authorized

A branch where the mechanical test passes:

```bash
git log "origin/$BRANCH" --not "$SESSION_START_SHA" --oneline
# Empty output → owned. Non-empty → shared.
```

In English: no commits have arrived on the remote since this session started. Anything you fetch is your own work. There is no other agent to clobber.

Capture `$SESSION_START_SHA` at session start (`git rev-parse HEAD`). If you don't have it, treat the branch as shared.

When the test passes, these are pre-authorized:

- `git push --force-with-lease origin <branch>` — never bare `--force`
- `git reset --hard origin/<branch>` — local-only, doesn't touch remote
- `git merge origin/main` — bringing main INTO your feature branch
- `git rebase origin/main`

### Shared feature — ask once

The test returned non-empty: another session (another agent on another machine, or the Captain) pushed to this branch since you started. Per the Captain's standing memory, mac23 often has an active CC session pushing commits — this is a normal multi-agent state, not an exception.

Stop and ask:

> Force-push to `<branch>` would clobber commit `<sha>` from another session. Confirm with `--force-with-lease`?

If confirmed, proceed. If not, rebase or merge as directed.

## Hard-Blocks

These never become pre-authorized regardless of branch class:

- `git reset --hard` against a tree with uncommitted local changes (data loss)
- Force-push to `main` (data loss + breaks every other clone)
- `git branch -D` against an unmerged branch (data loss)
- Rewriting a published commit on any protected branch
- `git clean -f` outside the worktree the agent created in this session
- `git push --force` without `--with-lease` on any branch

## Common False-Pauses

The following are NORMAL git, not destructive operations. Past agents have over-paused on each. Do not.

| Operation                                    | Why it's safe                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git merge origin/main` (on feature branch)  | Bringing main INTO feature; opposite direction of "merging feature into main."                                                                                                                  |
| `git pull origin <feature-branch>`           | Fetching your own remote tip.                                                                                                                                                                   |
| `git pull --rebase origin main` (on feature) | Rebasing your feature onto current main.                                                                                                                                                        |
| `gh pr merge --squash` / `--rebase`          | Server-side merge. No local push, no force-push.                                                                                                                                                |
| `gh pr merge --admin`                        | Server-side merge that bypasses branch protection's up-to-date check. Not a force-push. Rarely needed on venture mains once `strict = false` lands (see `crane_doc('global', 'fleet-ops.md')`). |
| `git checkout <existing-branch>`             | Switching branches with a clean tree.                                                                                                                                                           |

## Escalation Format

When this module says ask, ask using:

```
## Git Authority Check

**Operation:** {exact git command}
**Branch class:** {protected | owned-feature | shared-feature}
**Test result:** {output of the mechanical test, or N/A}
**Why escalating:** {hard-block category, or "shared-feature with commit X from another session"}

Awaiting Captain confirmation.
```

## Standing Order

When in doubt, treat as shared and ask. The cost of one extra Captain confirmation is low. The cost of clobbering another agent's commits is rebuilding their work and trust.
