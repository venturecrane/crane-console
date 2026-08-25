#!/bin/bash
#
# Run every Node test suite under scripts/.
#
# WHY THIS EXISTS. run-shell-tests.sh was written on 2026-08-12 after an audit
# found four shell suites that no workflow and no npm script had ever executed:
# "tests that nothing runs are the same defect as a check that cannot fail."
# Its glob is `*.test.sh`. On 2026-08-24 an audit of the AC-tick matcher found
# the same defect one file extension over -- scripts/__tests__/*.test.mjs
# (regression-parse-files, pr-verify-check) were referenced by no npm script, no
# workflow and no hook. They had never run either.
#
# Same two design choices, for the same reasons:
#
#   1. Suites are DISCOVERED, never enumerated. A hardcoded list re-creates the
#      defect the moment someone adds one and forgets to register it.
#   2. Finding zero suites is a FAILURE. A discovery step that silently matches
#      nothing looks identical to a passing run.
#
# Usage:  bash scripts/run-script-tests.sh
# Exit:   0 all suites passed; 1 at least one failed or none were found.

set -uo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)" || exit 1

SUITES=()
while IFS= read -r suite; do
  SUITES+=("$suite")
done < <(find scripts -type f -name '*.test.mjs' | sort)

if [ ${#SUITES[@]} -eq 0 ]; then
  echo "FAIL: no *.test.mjs suites found under scripts/."
  echo "Either they were deleted or the discovery glob is wrong. Both are bugs --"
  echo "a runner that finds nothing must not report success."
  exit 1
fi

echo "Discovered ${#SUITES[@]} node test suite(s)."
echo ""

FAILED=()
for suite in "${SUITES[@]}"; do
  echo "==> $suite"
  if node "$suite"; then
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

echo "All ${#SUITES[@]} node test suite(s) passed."
