#!/bin/bash
#
# Run every shell test suite in the repo.
#
# WHY THIS EXISTS. On 2026-08-12 an audit found four shell test suites — 103
# assertions, 69 of them covering secret-leak detection — that no workflow and
# no npm script had ever executed. They passed, but nothing knew that, and
# nothing would have known if they had started failing. Tests that nothing runs
# are the same defect as a check that cannot fail: green for as long as they
# exist, because nobody ever asks.
#
# Two design choices, both load-bearing:
#
#   1. Suites are DISCOVERED, never enumerated. A hardcoded list re-creates the
#      defect the moment someone adds a fifth suite and forgets to register it.
#   2. Finding zero suites is a FAILURE, not a quiet success. A discovery step
#      that silently matches nothing looks identical to a passing run — that is
#      how a runner becomes decorative.
#
# Lives in a script rather than inline in the workflow so the same command runs
# locally and in CI. An inline `run:` body cannot be executed by a developer,
# which is how workflow logic goes unverified in the first place.
#
# Usage:  bash scripts/run-shell-tests.sh
# Exit:   0 all suites passed; 1 at least one failed or none were found.

set -uo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)" || exit 1

SUITES=()
while IFS= read -r suite; do
  SUITES+=("$suite")
done < <(find scripts -type f -name '*.test.sh' | sort)

if [ ${#SUITES[@]} -eq 0 ]; then
  echo "FAIL: no *.test.sh suites found under scripts/."
  echo "Either they were deleted or the discovery glob is wrong. Both are bugs —"
  echo "a runner that finds nothing must not report success."
  exit 1
fi

echo "Discovered ${#SUITES[@]} shell test suite(s)."
echo ""

FAILED=()
for suite in "${SUITES[@]}"; do
  echo "==> $suite"
  if bash "$suite"; then
    echo "    PASS"
  else
    echo "    FAIL (exit $?)"
    FAILED+=("$suite")
  fi
  echo ""
done

echo "================================================================"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "FAILED: ${#FAILED[@]} of ${#SUITES[@]} suite(s)"
  for suite in "${FAILED[@]}"; do
    echo "  - $suite"
  done
  exit 1
fi

echo "All ${#SUITES[@]} shell test suite(s) passed."
