#!/bin/bash
#
# Parallel Session Provisioner (PostToolUse hook on EnterWorktree)
#
# Runs after EnterWorktree creates a per-session worktree. Provisions
# node_modules into the new worktree using APFS clonefile when available,
# falling back to npm ci. Removes the parallel-isolation marker so the
# PreToolUse gate stops blocking subsequent tool calls.
#
# Provisioning strategy:
#   1. Worktree already has node_modules (manual provision, retry) -> keep it.
#   2. Else, APFS volume + node_modules exists in canonical -> cp -c -R
#      (clonefile, ~5s for 484M).
#   3. Whatever is now in the worktree is checked against the WORKTREE's own
#      package-lock.json (installed package.json versions, not npm's claims).
#      Drift, or a check that could not run -> npm ci in the worktree.
#   4. No node_modules after 1-2 (non-APFS, clone failed) -> npm ci
#      (~30s, baseline).
#   5. Failure of npm ci -> log + exit 0 (don't block; the worktree exists,
#      the model can resolve it manually if needed).
#
# WHY STEP 3 EXISTS. A clone copies canonical's node_modules exactly as they
# are, and canonical goes stale on its own: a session-start sync can
# fast-forward canonical's source (and its lockfile) without reinstalling,
# because `npm ci` there would delete node_modules out from under a build
# another session is running. Before this check, every worktree cloned that
# stale tree. Observed 2026-10-12 in ss-console: 15 packages off the lockfile
# (wrangler 4.135.0 vs 4.136.3, the Astro Cloudflare adapter, workerd,
# miniflare, one package missing outright), 8 days stale, inherited by every
# new session. The fix lands here rather than in canonical because a
# just-created worktree has no other user, so reinstalling it is always safe.
# The check reads the worktree's lockfile, not canonical's, because a new
# worktree branches from origin/main and can differ from canonical even when
# canonical's install is current.
#
# CRITICAL: cp -c falls back silently to a regular copy on non-APFS volumes.
# We pre-check with diskutil to avoid the silent slowdown. The clone-fallback
# rate is logged for the weekly metric.
#
# Wire protocol (Claude Code PostToolUse):
#   stdin:  JSON with .session_id, .cwd (POST-EnterWorktree, the new worktree path),
#           .tool_name (will be "EnterWorktree"), .tool_input
#   stdout: ignored unless we want to inject systemMessage
#   exit 0
#
# Also: parallel-session-provision.sh --check-drift <dir>
#   Runs only the lockfile check against <dir>. Exit 0 in sync, 1 drift,
#   2 could not check, 3 no package-lock.json. Used by the test suite.

set -e

# Compare every package the lockfile at $1 places under a node_modules/ path
# with the version actually installed there. Exit codes as documented above.
# Prints a one-line summary on stdout.
check_lockfile_drift() {
  local dir="$1"
  [ -f "$dir/package-lock.json" ] || { echo "no package-lock.json"; return 3; }
  command -v node >/dev/null 2>&1 || { echo "node not found"; return 2; }
  node -e '
const fs = require("fs"), path = require("path");
const dir = process.argv[1];
let lock;
try { lock = JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8")); }
catch (e) { console.log("unreadable package-lock.json: " + e.message); process.exit(2); }
if (!lock.packages || typeof lock.packages !== "object") {
  console.log("lockfileVersion " + lock.lockfileVersion + " has no packages map");
  process.exit(2);
}
const drift = [];
let checked = 0;
for (const [key, meta] of Object.entries(lock.packages)) {
  if (!key.includes("node_modules/") || meta.link || !meta.version) continue;
  let installed;
  try {
    installed = JSON.parse(fs.readFileSync(path.join(dir, key, "package.json"), "utf8")).version;
  } catch (e) {
    // Optional packages are legitimately absent (other platforms, failed optional builds).
    if (!meta.optional && !meta.devOptional) drift.push(key + " missing");
    continue;
  }
  checked++;
  if (installed !== meta.version) drift.push(key + " " + installed + " (lock " + meta.version + ")");
}
if (checked === 0 && drift.length === 0) {
  // A lockfile that names packages but none were found installed is not "in sync".
  console.log("no installed packages found");
  process.exit(1);
}
console.log("checked=" + checked + " drift=" + drift.length +
  (drift.length ? " e.g. " + drift.slice(0, 5).join(", ") : ""));
process.exit(drift.length ? 1 : 0);
' "$dir"
}

if [ "${1:-}" = "--check-drift" ]; then
  [ -n "${2:-}" ] || { echo "usage: $0 --check-drift <dir>" >&2; exit 2; }
  check_lockfile_drift "$2"
  exit $?
fi

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)
WORKTREE_CWD=$(jq -r '.cwd // empty' <<<"$INPUT" 2>/dev/null)
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null)

# Only act on EnterWorktree calls.
[ "$TOOL" != "EnterWorktree" ] && exit 0
[ -z "$WORKTREE_CWD" ] && exit 0

# Resolve canonical (the parent worktree). git worktree list shows all,
# but the simplest path: the worktree's `.git` file points back to the
# main .git via gitdir. We use `git rev-parse --git-common-dir` from inside
# the worktree to get the shared .git, then derive canonical.
COMMON_DIR=$(git -C "$WORKTREE_CWD" rev-parse --git-common-dir 2>/dev/null) || exit 0
# common-dir is canonical/.git ; canonical toplevel is its parent.
CANONICAL=$(cd "$WORKTREE_CWD" && cd "$COMMON_DIR" && cd .. && pwd)

# Sanity: are we actually in a worktree? If WORKTREE_CWD == CANONICAL, the
# tool didn't isolate (the silent-failure mode). Don't provision; let the
# PreToolUse gate keep blocking.
if [ "$WORKTREE_CWD" = "$CANONICAL" ]; then
  exit 0
fi

# Logging dir.
LOG_DIR="$CANONICAL/.claude/parallel-isolation-log"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="$LOG_DIR/provision.log"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# If canonical has no node_modules, nothing to provision. Skip cleanly.
if [ ! -d "$CANONICAL/node_modules" ]; then
  echo "$TIMESTAMP session=$SESSION_ID method=skip reason=no-canonical-node_modules" \
    >> "$LOG_FILE" 2>/dev/null || true
  rm -f "$CANONICAL/.claude/parallel-isolation-required-$SESSION_ID" 2>/dev/null || true
  exit 0
fi

# Detect APFS on the canonical volume. diskutil info wants a mount point or
# disk id, not an arbitrary path, so we resolve via df first. cp -c falls
# back silently to a regular copy on non-APFS volumes; the precondition
# check is what avoids the unobserved 30s tax.
IS_APFS=0
if command -v diskutil >/dev/null 2>&1 && command -v df >/dev/null 2>&1; then
  MOUNT_POINT=$(df -P "$CANONICAL" 2>/dev/null | awk 'NR==2{print $NF}')
  if [ -n "$MOUNT_POINT" ] && diskutil info "$MOUNT_POINT" 2>/dev/null | grep -q "File System Personality:.*APFS"; then
    IS_APFS=1
  fi
fi

START=$(date +%s)
METHOD=""
RESULT="ok"
NEED_CI=0
DRIFT_NOTE=""

if [ -d "$WORKTREE_CWD/node_modules" ]; then
  METHOD="existing"
elif [ "$IS_APFS" = "1" ]; then
  if cp -c -R "$CANONICAL/node_modules" "$WORKTREE_CWD/node_modules" 2>/dev/null; then
    METHOD="cp_clonefile"
  else
    rm -rf "$WORKTREE_CWD/node_modules" 2>/dev/null || true
    METHOD="npm_ci_after_clone_fail"
    NEED_CI=1
  fi
else
  METHOD="npm_ci"
  NEED_CI=1
fi

if [ "$NEED_CI" = "0" ]; then
  DRIFT_RC=0
  DRIFT_NOTE=$(check_lockfile_drift "$WORKTREE_CWD" 2>&1) || DRIFT_RC=$?
  case "$DRIFT_RC" in
    0|3) ;;  # in sync, or no lockfile to compare against (npm ci would fail too)
    1) METHOD="$METHOD+npm_ci_lockfile_drift"; NEED_CI=1 ;;
    *) METHOD="$METHOD+npm_ci_drift_unchecked"; NEED_CI=1 ;;
  esac
fi

if [ "$NEED_CI" = "1" ]; then
  CI_ERR=$(cd "$WORKTREE_CWD" && npm ci --silent 2>&1 >/dev/null) && CI_RC=0 || CI_RC=$?
  if [ "$CI_RC" != "0" ]; then
    CI_ERR=$(printf '%s\n' "$CI_ERR" | grep -m1 -iE "error" | cut -c1-200)
    case "$METHOD" in
      cp_clonefile+*|existing+*)
        # A drift reinstall that fails must leave the session no worse than
        # before the drift check existed: restore the clone and clear the
        # gate, but say plainly that the tree is stale and why npm ci failed.
        # (npm 11 rejects lockfiles npm 10 accepts, so a repo green in CI can
        # still fail here.)
        if [ ! -d "$WORKTREE_CWD/node_modules" ] && [ "${METHOD%%+*}" = "cp_clonefile" ]; then
          cp -c -R "$CANONICAL/node_modules" "$WORKTREE_CWD/node_modules" 2>/dev/null || true
        fi
        if [ -d "$WORKTREE_CWD/node_modules" ]; then
          RESULT="stale_kept"
          DRIFT_NOTE="$DRIFT_NOTE; npm ci FAILED ($CI_ERR), kept the stale tree. Run npm ci in this worktree before trusting build or test results"
        else
          RESULT="failed"
        fi
        ;;
      *) RESULT="failed" ;;
    esac
  fi
fi

END=$(date +%s)
ELAPSED=$((END - START))

echo "$TIMESTAMP session=$SESSION_ID method=$METHOD result=$RESULT elapsed_s=$ELAPSED canonical=$CANONICAL worktree=$WORKTREE_CWD drift=\"$DRIFT_NOTE\"" \
  >> "$LOG_FILE" 2>/dev/null || true

# Marker removal: only on success. On failure, leave the marker so the model
# can see the gate is still active and can troubleshoot.
if [ "$RESULT" = "ok" ] || [ "$RESULT" = "stale_kept" ]; then
  rm -f "$CANONICAL/.claude/parallel-isolation-required-$SESSION_ID" 2>/dev/null || true
  jq -n --arg method "$METHOD" --arg elapsed "$ELAPSED" --arg drift "$DRIFT_NOTE" '{
    systemMessage: ("[parallel-isolation] node_modules provisioned in worktree (" + $method + ", " + $elapsed + "s)."
      + (if ($drift | length) > 0 then " Lockfile check: " + $drift + "." else "" end)
      + " Isolation gate cleared.")
  }'
fi

exit 0
