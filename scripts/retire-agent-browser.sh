#!/usr/bin/env bash
# retire-agent-browser.sh - Remove agent-browser CLI and orphan skill copies from the fleet.
#
# Follow-up to PR #607 (agent-browser skill retirement). The enterprise
# switched from the `agent-browser` CLI to the Claude-in-Chrome and
# Playwright MCP plugins on 2026-04-20. This script removes the stale
# install from every fleet machine so nothing still references a
# retired tool.
#
# Usage: bash scripts/retire-agent-browser.sh [machine...]
#   No args = all machines (mac23, mini, mbp27, m16, think)
#   With args = only specified machines
#
# Safe to re-run. Each action is idempotent.

set -uo pipefail

ALL_MACHINES="mac23 mini mbp27 m16 think"

if [ $# -gt 0 ]; then
  MACHINES="$*"
else
  MACHINES="$ALL_MACHINES"
fi

CURRENT_HOST="$(hostname -s 2>/dev/null || hostname)"

cleanup_local() {
  echo "  npm uninstall -g agent-browser..."
  if command -v npm >/dev/null 2>&1; then
    npm uninstall -g agent-browser 2>&1 | tail -1 || true
  fi
  echo "  rm -rf ~/.agents/skills/{stitch-design,agent-browser}..."
  rm -rf "$HOME/.agents/skills/stitch-design" "$HOME/.agents/skills/agent-browser"
  if command -v agent-browser >/dev/null 2>&1; then
    echo "  verify: agent-browser still on PATH at $(command -v agent-browser)"
  else
    echo "  verify: agent-browser not on PATH (ok)"
  fi
}

cleanup_remote() {
  local host="$1"
  ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no "$host" bash -s <<'REMOTE'
set -uo pipefail
if command -v npm >/dev/null 2>&1; then
  npm uninstall -g agent-browser 2>&1 | tail -1 || true
fi
rm -rf "$HOME/.agents/skills/stitch-design" "$HOME/.agents/skills/agent-browser"
if command -v agent-browser >/dev/null 2>&1; then
  echo "  verify: agent-browser still on PATH at $(command -v agent-browser)"
else
  echo "  verify: agent-browser not on PATH (ok)"
fi
REMOTE
}

for machine in $MACHINES; do
  echo "=== $machine ==="
  if [ "$machine" = "$CURRENT_HOST" ]; then
    cleanup_local
  else
    cleanup_remote "$machine" || echo "  (ssh failed — skipping)"
  fi
done

echo ""
echo "Done. agent-browser retired across: $MACHINES"
