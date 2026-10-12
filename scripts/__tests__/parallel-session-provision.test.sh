#!/bin/bash
#
# Shell test for scripts/parallel-session-provision.sh.
#
# Run from repo root: bash scripts/__tests__/parallel-session-provision.test.sh
# Exit 0 = all tests pass; exit 1 = at least one failed.
#
# Two layers:
#   1. --check-drift unit cases: the lockfile-vs-installed comparison alone.
#   2. The hook end to end: a real git repo + linked worktree, a stub `npm`
#      on PATH that records whether `npm ci` ran, and the PostToolUse JSON on
#      stdin. The decisive case is a worktree whose node_modules disagree with
#      its lockfile: before the drift check existed the hook left them alone.
#
# The clone path only exists on APFS. On other volumes the hook goes straight
# to npm ci, so the "fresh worktree" case asserts the same outcome (npm ci ran)
# on both and records which path it took.

set -u

# This suite runs inside git's pre-push hook (husky -> verify -> test:shell),
# where git exports GIT_DIR, GIT_INDEX_FILE and friends. Those beat `git -C`,
# so every `git -C "$CANON" init/add/commit/worktree add` below would act on
# the repo being pushed instead of the scratch repo. Observed 2026-10-12: the
# reinit flipped crane-console's core.bare to true (breaking the primary
# checkout for every session), committed a fixture lockfile onto the branch
# being pushed, and registered four worktrees. Strip them before any git call.
# The "hook environment" case at the bottom proves this holds.
while IFS= read -r v; do unset "$v"; done < <(env | sed -n 's/^\(GIT_[A-Z_]*\)=.*/\1/p')

HOOK="$(cd "$(dirname "$0")/../.." && pwd)/scripts/parallel-session-provision.sh"
[ -f "$HOOK" ] || { echo "fatal: hook not found at $HOOK"; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "fatal: jq required"; exit 2; }
command -v node >/dev/null 2>&1 || { echo "fatal: node required"; exit 2; }

PASS=0
FAIL=0
ROOT=$(mktemp -d -t provision-test.XXXXXX)
trap 'rm -rf "$ROOT"' EXIT

ok()   { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

# write_lock <dir> <json-packages-object> [lockfileVersion]
write_lock() {
  printf '{"name":"t","lockfileVersion":%s,"packages":%s}\n' "${3:-3}" "$2" > "$1/package-lock.json"
}

# install_pkg <dir> <key> <version>
install_pkg() {
  mkdir -p "$1/$2"
  printf '{"name":"%s","version":"%s"}\n' "$(basename "$2")" "$3" > "$1/$2/package.json"
}

# expect_drift <label> <dir> <expected-exit>
expect_drift() {
  local out rc
  out=$(bash "$HOOK" --check-drift "$2" 2>&1); rc=$?
  if [ "$rc" = "$3" ]; then ok "$1 (exit $rc: $out)"; else bad "$1: expected exit $3, got $rc ($out)"; fi
}

echo "== --check-drift"

d="$ROOT/u1"; mkdir -p "$d"
write_lock "$d" '{"":{"name":"t"},"node_modules/a":{"version":"1.0.0"},"node_modules/b":{"version":"2.0.0"}}'
install_pkg "$d" node_modules/a 1.0.0; install_pkg "$d" node_modules/b 2.0.0
expect_drift "installed matches lockfile" "$d" 0

install_pkg "$d" node_modules/b 1.9.0
expect_drift "version behind lockfile is drift" "$d" 1

d="$ROOT/u2"; mkdir -p "$d"
write_lock "$d" '{"node_modules/a":{"version":"1.0.0"},"node_modules/b":{"version":"2.0.0"}}'
install_pkg "$d" node_modules/a 1.0.0
expect_drift "required package missing is drift" "$d" 1

d="$ROOT/u3"; mkdir -p "$d"
write_lock "$d" '{"node_modules/a":{"version":"1.0.0"},"node_modules/@img/sharp-linux-x64":{"version":"0.3.0","optional":true},"node_modules/c":{"version":"1.0.0","devOptional":true}}'
install_pkg "$d" node_modules/a 1.0.0
expect_drift "optional package absent is not drift" "$d" 0

d="$ROOT/u4"; mkdir -p "$d"
write_lock "$d" '{"node_modules/w":{"version":"4.136.3"},"node_modules/w/node_modules/workerd":{"version":"1.20260921.1"}}'
install_pkg "$d" node_modules/w 4.136.3; install_pkg "$d" node_modules/w/node_modules/workerd 1.20260918.1
expect_drift "nested package drift is drift" "$d" 1

d="$ROOT/u5"; mkdir -p "$d"
write_lock "$d" '{"node_modules/a":{"version":"1.0.0"},"node_modules/@me/ws":{"resolved":"packages/ws","link":true},"packages/ws":{"version":"0.0.1"}}'
install_pkg "$d" node_modules/a 1.0.0
expect_drift "workspace links are skipped" "$d" 0

d="$ROOT/u6"; mkdir -p "$d"
write_lock "$d" '{"node_modules/a":{"version":"1.0.0","optional":true}}'
expect_drift "nothing installed at all is not in sync" "$d" 1

d="$ROOT/u7"; mkdir -p "$d"
expect_drift "no lockfile means cannot compare" "$d" 3

d="$ROOT/u8"; mkdir -p "$d"
printf '{"name":"t","lockfileVersion":1,"dependencies":{}}\n' > "$d/package-lock.json"
expect_drift "v1 lockfile without packages map cannot be checked" "$d" 2

echo "== hook end to end"

# make_repo <name>: canonical repo with a lockfile committed, plus a linked
# worktree at <name>-wt. Echoes nothing; sets CANON and WT.
make_repo() {
  CANON="$ROOT/$1"; WT="$ROOT/$1-wt"
  mkdir -p "$CANON"
  git -C "$CANON" init -q
  write_lock "$CANON" '{"node_modules/a":{"version":"2.0.0"}}'
  git -C "$CANON" add package-lock.json
  git -C "$CANON" -c user.name=t -c user.email=t@t -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m init
  git -C "$CANON" worktree add -q "$WT" 2>/dev/null
  CANON=$(cd "$CANON" && pwd -P); WT=$(cd "$WT" && pwd -P)
}

# Stub npm: records the call, then installs what the worktree lockfile says.
STUB="$ROOT/bin"; mkdir -p "$STUB"
cat > "$STUB/npm" <<'EOF'
#!/bin/bash
echo "$*" >> "$NPM_CALLS"
if [ "$1" = "ci" ] && [ -n "${NPM_FAIL:-}" ]; then
  echo "npm error code EUSAGE" >&2
  exit 1
fi
if [ "$1" = "ci" ]; then
  rm -rf node_modules
  mkdir -p node_modules/a
  printf '{"name":"a","version":"2.0.0"}\n' > node_modules/a/package.json
fi
exit 0
EOF
chmod +x "$STUB/npm"

# run_hook <session>: runs the hook as Claude Code would; echoes stdout.
run_hook() {
  printf '{"tool_name":"EnterWorktree","cwd":"%s","session_id":"%s"}' "$WT" "$1" \
    | PATH="$STUB:$PATH" NPM_CALLS="$ROOT/npm-calls-$1" bash "$HOOK" 2>/dev/null
}
npm_ci_ran() { grep -q '^ci' "$ROOT/npm-calls-$1" 2>/dev/null; }
installed_a() { node -e 'console.log(require(process.argv[1]).version)' "$WT/node_modules/a/package.json" 2>/dev/null; }

# Case 1 (the defect): worktree node_modules present but behind its lockfile.
make_repo r1
install_pkg "$CANON" node_modules/a 1.0.0
install_pkg "$WT" node_modules/a 1.0.0
mkdir -p "$CANON/.claude"
touch "$CANON/.claude/parallel-isolation-required-s1"
out=$(run_hook s1)
if npm_ci_ran s1; then ok "stale worktree node_modules trigger npm ci"; else bad "stale worktree node_modules did not trigger npm ci"; fi
[ "$(installed_a)" = "2.0.0" ] && ok "worktree now matches its lockfile" || bad "worktree still at $(installed_a)"
echo "$out" | grep -q "npm_ci_lockfile_drift" && ok "systemMessage names the drift" || bad "systemMessage: $out"
[ ! -e "$CANON/.claude/parallel-isolation-required-s1" ] && ok "gate marker cleared" || bad "gate marker left behind"
grep -q 'drift="checked=1 drift=1' "$CANON/.claude/parallel-isolation-log/provision.log" \
  && ok "log records the drift" || bad "log line missing drift detail"

# Case 2: worktree node_modules already match -> no reinstall.
make_repo r2
install_pkg "$CANON" node_modules/a 2.0.0
install_pkg "$WT" node_modules/a 2.0.0
run_hook s2 >/dev/null
if npm_ci_ran s2; then bad "in-sync worktree was reinstalled"; else ok "in-sync worktree left alone"; fi

# Case 3: fresh worktree, canonical stale. APFS clones then catches the drift;
# other volumes go straight to npm ci. Either way the result must be current.
make_repo r3
install_pkg "$CANON" node_modules/a 1.0.0
run_hook s3 >/dev/null
if npm_ci_ran s3; then ok "fresh worktree from stale canonical ends with npm ci"; else bad "stale canonical was cloned without npm ci"; fi
[ "$(installed_a)" = "2.0.0" ] && ok "fresh worktree matches its lockfile" || bad "fresh worktree at $(installed_a)"
echo "    path taken: $(grep -o 'method=[^ ]*' "$CANON/.claude/parallel-isolation-log/provision.log")"

# Case 4: the drift reinstall itself fails (npm 11 rejecting a lockfile npm 10
# accepts). The session must be no worse off than before the drift check:
# gate cleared, stale tree kept, and the failure said out loud.
make_repo r4
install_pkg "$CANON" node_modules/a 1.0.0
install_pkg "$WT" node_modules/a 1.0.0
mkdir -p "$CANON/.claude"; touch "$CANON/.claude/parallel-isolation-required-s4"
out=$(NPM_FAIL=1 run_hook s4)
npm_ci_ran s4 && ok "failing reinstall was attempted" || bad "reinstall not attempted"
[ ! -e "$CANON/.claude/parallel-isolation-required-s4" ] && ok "gate cleared despite failed reinstall" || bad "failed reinstall left the session gated"
[ "$(installed_a)" = "1.0.0" ] && ok "stale tree kept rather than emptied" || bad "worktree node_modules lost ($(installed_a))"
echo "$out" | grep -q "npm ci FAILED (npm error code EUSAGE)" && ok "systemMessage says npm ci failed and why" || bad "systemMessage: $out"

echo "== hook environment"

# Re-run this whole suite the way git's pre-push hook runs it: GIT_DIR,
# GIT_WORK_TREE and GIT_INDEX_FILE pointing at an enclosing repo. That repo
# must come out untouched. Without the GIT_* strip at the top this fails:
# the sentinel gains an "init" commit, extra worktrees, and core.bare=true.
if [ -z "${PROVISION_TEST_NESTED:-}" ]; then
  S="$ROOT/sentinel"
  mkdir -p "$S"
  git -C "$S" init -q
  echo sentinel > "$S/file"
  git -C "$S" add file
  git -C "$S" -c user.name=t -c user.email=t@t -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m sentinel
  before_head=$(git -C "$S" rev-parse HEAD)
  before_wt=$(git -C "$S" worktree list | wc -l)
  PROVISION_TEST_NESTED=1 GIT_DIR="$S/.git" GIT_WORK_TREE="$S" GIT_INDEX_FILE="$S/.git/index" \
    bash "$0" >/dev/null 2>&1
  nested_rc=$?
  [ "$nested_rc" = "0" ] && ok "suite passes under a git hook environment" || bad "suite failed under a git hook environment (exit $nested_rc)"
  [ "$(git -C "$S" rev-parse HEAD)" = "$before_head" ] && ok "enclosing repo gained no commits" || bad "enclosing repo HEAD moved: $(git -C "$S" log --oneline -1)"
  [ "$(git -C "$S" config --get core.bare)" = "false" ] && ok "enclosing repo still non-bare" || bad "enclosing repo core.bare=$(git -C "$S" config --get core.bare)"
  [ "$(git -C "$S" worktree list | wc -l)" = "$before_wt" ] && ok "enclosing repo gained no worktrees" || bad "enclosing repo gained worktrees"
  [ -z "$(git -C "$S" status --porcelain)" ] && ok "enclosing repo tree untouched" || bad "enclosing repo tree changed: $(git -C "$S" status --porcelain | head -3)"
fi

echo ""
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
