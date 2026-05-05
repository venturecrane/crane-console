#!/bin/bash
#
# Parallel Session Branch Check (pre-commit tripwire)
#
# When committing from inside a per-session worktree
# (.claude/worktrees/<session-id>/), the current branch name MUST contain
# <session-id>. This prevents two worktrees from independently creating
# branches with the same name and racing on push.
#
# Canonical-checkout commits (anywhere outside .claude/worktrees/) are not
# checked — branch naming for human PRs follows the existing convention.
#
# Exits non-zero on violation; zero otherwise. Called from .husky/pre-commit.

set -e

# Escape hatch for unusual cases. Use sparingly.
[ "$PARALLEL_ISOLATION_BRANCH_CHECK" = "skip" ] && exit 0

CWD=$(pwd -P)
TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

# Are we inside a per-session worktree? Match the path pattern.
WORKTREE_REL="${CWD#$TOPLEVEL/}"
case "$CWD" in
  */.claude/worktrees/*)
    # Extract session id segment after .claude/worktrees/.
    SESSION_ID=$(echo "$CWD" | sed -E 's|.*/\.claude/worktrees/([^/]+).*|\1|')
    ;;
  *)
    # Not in a worktree; canonical commit. Skip.
    exit 0
    ;;
esac

[ -z "$SESSION_ID" ] && exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0

# Empty / detached HEAD: skip.
[ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ] && exit 0

case "$BRANCH" in
  *"$SESSION_ID"*)
    # Branch contains session id; allowed.
    exit 0
    ;;
esac

cat >&2 <<EOF
[parallel-isolation] pre-commit blocked: branch name does not include session id.

  worktree:    $CWD
  session id:  $SESSION_ID
  branch:      $BRANCH

When committing from inside a per-session worktree, the current branch must
contain the session id so it cannot collide with branches from other
concurrent sessions. Rename the branch to include "$SESSION_ID" (typically
as a prefix), then retry the commit:

  git branch -m <new-name-including-$SESSION_ID>

If you really need to commit a non-prefixed branch from this worktree,
escape with:

  PARALLEL_ISOLATION_BRANCH_CHECK=skip git commit ...

(Use sparingly — the check exists to prevent push-time collisions.)
EOF
exit 1
