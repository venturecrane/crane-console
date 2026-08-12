#!/bin/bash
#
# Tests for the per-workflow CI check in scripts/fleet-ops-health.sh.
#
# Sources the script in library mode (FLEET_OPS_HEALTH_LIB=1) and drives
# ci_workflow_findings() against a fake `gh` on PATH, so every case is a real
# execution of the shipped function against a controlled API response.
#
# The load-bearing case is `masking`: it reproduces the defect this check
# replaced — a repo where the single most recent run across all workflows is a
# success while an older-finishing workflow has been failing for weeks. If that
# case ever passes with zero findings, the check has regressed to measuring
# nothing.
#
# Run from repo root: bash scripts/__tests__/fleet-ops-health-ci.test.sh
# Exit 0 = all tests pass; exit 1 = at least one failed.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/fleet-ops-health.sh"
[ -f "$SCRIPT" ] || {
  echo "fatal: script not found at $SCRIPT"
  exit 2
}

PASS=0
FAIL=0
FAILED_CASES=()

SANDBOX=$(mktemp -d -t fleet-ops-health-test.XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT

# ---- Fake gh ---------------------------------------------------------------
# Serves fixtures from $FIXTURE_DIR. The workflow list comes from
# `workflows.json`; each workflow's runs come from `runs-<id>.json`. A missing
# runs fixture exits non-zero, exercising the script's defensive `|| echo ""`
# path (one repo's API hiccup must not crash the org-wide audit).
mkdir -p "$SANDBOX/bin"
cat >"$SANDBOX/bin/gh" <<'FAKE_GH'
#!/bin/bash
# Fake gh: `gh auth status` succeeds; `gh api <path> [--paginate] --jq <expr>`
# resolves <path> to a fixture file and pipes it through jq.
if [ "${1:-}" = "auth" ]; then exit 0; fi
if [ "${1:-}" != "api" ]; then echo "fake gh: unsupported: $*" >&2; exit 2; fi
shift
path=""
jq_expr=""
while [ $# -gt 0 ]; do
  case "$1" in
    --jq) jq_expr="$2"; shift 2 ;;
    --paginate) shift ;;
    -*) shift ;;
    *) [ -z "$path" ] && path="$1"; shift ;;
  esac
done
case "$path" in
  *actions/workflows/*/runs*)
    wf_id="${path#*actions/workflows/}"
    wf_id="${wf_id%%/runs*}"
    fixture="$FIXTURE_DIR/runs-$wf_id.json" ;;
  *actions/workflows*)
    fixture="$FIXTURE_DIR/workflows.json" ;;
  *)
    echo "fake gh: unmapped path: $path" >&2; exit 2 ;;
esac
[ -f "$fixture" ] || { echo "fake gh: no fixture $fixture" >&2; exit 22; }
if [ -n "$jq_expr" ]; then jq -r "$jq_expr" <"$fixture"; else cat "$fixture"; fi
FAKE_GH
chmod +x "$SANDBOX/bin/gh"
PATH="$SANDBOX/bin:$PATH"
export PATH

# Source the script in library mode. `set --` clears positional params so the
# script's own arg parser sees no args when it inherits ours.
set --
# shellcheck disable=SC1090
FLEET_OPS_HEALTH_LIB=1 . "$SCRIPT"

if ! declare -f ci_workflow_findings >/dev/null; then
  echo "fatal: ci_workflow_findings not defined after sourcing $SCRIPT"
  exit 2
fi

# ---- Fixture helpers -------------------------------------------------------

# new_fixture_dir <case-name> — fresh empty fixture dir, exported to fake gh.
new_fixture_dir() {
  FIXTURE_DIR="$SANDBOX/fixtures/$1"
  rm -rf "$FIXTURE_DIR"
  mkdir -p "$FIXTURE_DIR"
  export FIXTURE_DIR
  : >"$FIXTURE_DIR/.workflows"
}

# add_workflow <id> <name> <state> [conclusion ...]
# Conclusions are newest-first. Omit them entirely to produce a workflow with
# no runs on the branch. Use the literal `INCOMPLETE` to emit an in-progress
# run (status != completed, conclusion null).
add_workflow() {
  local id="$1" name="$2" state="$3"
  shift 3
  printf '%s\t%s\t%s\n' "$id" "$name" "$state" >>"$FIXTURE_DIR/.workflows"
  jq -n --args '{workflow_runs: ($ARGS.positional | map(
        if . == "INCOMPLETE" then {status: "in_progress", conclusion: null}
        else {status: "completed", conclusion: .} end))}' "$@" \
    >"$FIXTURE_DIR/runs-$id.json"
  jq -Rs 'split("\n") | map(select(length > 0) | split("\t"))
          | {total_count: length,
             workflows: map({id: (.[0] | tonumber), name: .[1], state: .[2]})}' \
    <"$FIXTURE_DIR/.workflows" >"$FIXTURE_DIR/workflows.json"
}

# ---- Assertions ------------------------------------------------------------

assert_output() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo "  ok  $label"
  else
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$label")
    echo "  FAIL $label"
    echo "       expected: $(printf '%q' "$expected")"
    echo "       actual:   $(printf '%q' "$actual")"
  fi
}

run_check() { ci_workflow_findings "owner/repo" "main"; }

echo "fleet-ops-health per-workflow CI check"

# ---- Case: the masking defect ---------------------------------------------
# This is the shape that made the old check useless. `Deploy Workers` finished
# most recently and succeeded; `D1 Nightly Backup` has failed every run for
# weeks. The old probe reported the repo healthy.
new_fixture_dir masking
add_workflow 1 "Deploy Workers" active success success success
add_workflow 2 "D1 Nightly Backup" active failure failure failure failure failure
add_workflow 3 "Verify" active success success
out=$(run_check)
assert_output "masking: names the buried failing workflow" \
  "error	D1 Nightly Backup (failure, 5 consecutive)" "$out"

# ---- Case: clean repo ------------------------------------------------------
new_fixture_dir clean
add_workflow 1 "Verify" active success success success
add_workflow 2 "Deploy Workers" active success
out=$(run_check)
assert_output "clean: no findings" "" "$out"

# ---- Case: recovered workflow is not flagged -------------------------------
# Latest run is green; the failures beneath it are history, not a finding.
new_fixture_dir recovered
add_workflow 1 "Security Checks" active success failure failure failure
out=$(run_check)
assert_output "recovered: green latest run clears the finding" "" "$out"

# ---- Case: multiple failing workflows --------------------------------------
new_fixture_dir multi
add_workflow 1 "Deploy Workers" active success
add_workflow 2 "D1 Nightly Backup" active failure failure
add_workflow 3 "Docs Refresh" active failure success failure
out=$(run_check)
assert_output "multi: reports every failing workflow" \
  "error	D1 Nightly Backup (failure, 2 consecutive)
error	Docs Refresh (failure, 1 consecutive)" "$out"

# ---- Case: streak fills the window -> N+ -----------------------------------
new_fixture_dir streakcap
# shellcheck disable=SC2046
add_workflow 1 "D1 Nightly Backup" active $(for _ in $(seq 1 "$CI_RUN_WINDOW"); do echo failure; done)
out=$(run_check)
assert_output "streak cap: reports ${CI_RUN_WINDOW}+ when the window is full" \
  "error	D1 Nightly Backup (failure, ${CI_RUN_WINDOW}+ consecutive)" "$out"

# ---- Case: non-failure conclusions -----------------------------------------
new_fixture_dir conclusions
add_workflow 1 "Regression Claim-Origin" active startup_failure startup_failure
add_workflow 2 "Nightly Perf" active timed_out
add_workflow 3 "Release Gate" active action_required
add_workflow 4 "Flaky Deploy" active cancelled success
out=$(run_check)
assert_output "conclusions: startup_failure/timed_out/action_required are errors, cancelled is a warning" \
  "error	Regression Claim-Origin (startup_failure, 2 consecutive)
error	Nightly Perf (timed_out, 1 consecutive)
error	Release Gate (action_required, 1 consecutive)
warning	Flaky Deploy (cancelled)" "$out"

# ---- Case: skipped/neutral must not mask a failure -------------------------
# Same defect class one level down: a skipped run sitting on top of a failing
# streak must not read as "not failing".
new_fixture_dir skipped
add_workflow 1 "Conditional Deploy" active skipped neutral failure failure
add_workflow 2 "Always Skipped" active skipped skipped
out=$(run_check)
assert_output "skipped/neutral: transparent, do not mask the failure below" \
  "error	Conditional Deploy (failure, 2 consecutive)" "$out"

# ---- Case: in-progress run is ignored --------------------------------------
new_fixture_dir inprogress
add_workflow 1 "Verify" active INCOMPLETE failure failure
out=$(run_check)
assert_output "in-progress: incomplete run does not hide the last decided run" \
  "error	Verify (failure, 2 consecutive)" "$out"

# ---- Case: disabled workflows are skipped ----------------------------------
new_fixture_dir disabled
add_workflow 1 "Retired Nightly" disabled_manually failure failure failure
add_workflow 2 "Dormant Audit" disabled_inactivity failure
add_workflow 3 "Verify" active success
out=$(run_check)
assert_output "disabled: inactive workflows generate no permanent noise" "" "$out"

# ---- Case: workflow with no runs on the branch -----------------------------
new_fixture_dir noruns
add_workflow 1 "Publish crane-mcp" active
add_workflow 2 "Verify" active success
out=$(run_check)
assert_output "no runs: tag-only/reusable workflows produce no finding" "" "$out"

# ---- Case: API failure is contained ----------------------------------------
# The runs fixture is deleted so fake gh exits non-zero, mimicking a 403 or a
# transient 502. The audit must skip that workflow, not crash the org walk.
new_fixture_dir apifail
add_workflow 1 "Verify" active success
add_workflow 2 "D1 Nightly Backup" active failure failure
rm "$FIXTURE_DIR/runs-1.json"
out=$(run_check)
rc=$?
assert_output "api failure: unreadable workflow is skipped, walk continues" \
  "error	D1 Nightly Backup (failure, 2 consecutive)" "$out"
assert_output "api failure: exit code stays 0" "0" "$rc"

# ---- Case: workflow name sanitization --------------------------------------
# `|` is the FINDINGS record delimiter and `"` breaks the --json emitter.
new_fixture_dir sanitize
add_workflow 1 'Build | "prod"' active failure
out=$(run_check)
assert_output "sanitize: delimiter and quote chars scrubbed from workflow name" \
  "error	Build prod (failure, 1 consecutive)" "$out"

# ---- Summary ---------------------------------------------------------------
echo ""
echo "fleet-ops-health-ci tests: $PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then
  for c in "${FAILED_CASES[@]}"; do echo "  - $c"; done
  exit 1
fi
exit 0
