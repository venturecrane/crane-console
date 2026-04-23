#!/usr/bin/env bash
# hermes-verify-patch.sh — assert crane_tools is registered exactly once in Hermes.
#
# Hermes's model_tools.py is overwritten by `hermes update`, so the
# crane_tools discovery entry (inserted by packages/crane-mcp/src/cli/launch-lib.ts
# `setupHermesMcp()`) must be re-applied after every update. This script is
# the verification side of that loop — it pre-checks before patching, and
# post-asserts after patching.
#
# Exit codes:
#   0  OK — crane_tools registered exactly once
#   2  PATCH NEEDED — crane_tools not registered yet
#   3  ANOMALY — crane_tools registered N times (N != 1); manual fix required
set -euo pipefail

f="$HOME/.hermes/hermes-agent/model_tools.py"
[[ -r "$f" ]] || { echo "missing: $f" >&2; exit 1; }

count=$(grep -c '"tools\.crane_tools"' "$f" || true)

case "$count" in
  1) echo "OK: crane_tools registered once in $f"; exit 0 ;;
  0) echo "PATCH NEEDED: crane_tools not in $f — run \`crane vc --hermes -p ok\`" >&2; exit 2 ;;
  *) echo "ANOMALY: crane_tools registered $count times (expected 1) in $f" >&2; exit 3 ;;
esac
