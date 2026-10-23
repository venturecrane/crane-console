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

model_tools="$HOME/.hermes/hermes-agent/model_tools.py"
crane_tools="$HOME/.hermes/hermes-agent/tools/crane_tools.py"

[[ -r "$model_tools" ]] || { echo "missing: $model_tools" >&2; exit 1; }

count=$(grep -c '"tools\.crane_tools"' "$model_tools" || true)
has_module=0
[[ -r "$crane_tools" ]] && has_module=1

if [[ "$count" == 1 && "$has_module" == 1 ]]; then
  echo "OK: crane_tools registered in model_tools.py AND module exists"
  exit 0
elif [[ "$count" == 1 && "$has_module" == 0 ]]; then
  echo "DEGRADED: model_tools.py references tools.crane_tools but $crane_tools MISSING" >&2
  echo "Hermes will silently skip the import — crane tools will not be exposed." >&2
  echo "Fix: deploy crane_tools.py to $(dirname "$crane_tools")/ (see follow-up issue)." >&2
  exit 4
elif [[ "$count" == 0 ]]; then
  echo "PATCH NEEDED: crane_tools not in $model_tools — run \`crane vc --hermes -p ok\`" >&2
  exit 2
else
  echo "ANOMALY: crane_tools registered $count times (expected 1) in $model_tools" >&2
  exit 3
fi
