#!/usr/bin/env bash
#
# Install the enterprise Claude Code policy floor into managed settings.
#
# Managed settings is the only scope that is machine-wide, survives a wiped
# ~/.claude, and cannot be edited away by the account running Claude Code.
# It requires root, so this script is run by a human with sudo — the fleet has
# no MDM and no NOPASSWD, and server-managed settings needs Claude for
# Enterprise (this org is Max 20x).
#
# Idempotent: re-run to update after changing managed-settings.json.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/managed-settings.json"

case "$(uname -s)" in
  Darwin) DEST_DIR="/Library/Application Support/ClaudeCode/managed-settings.d" ;;
  Linux)  DEST_DIR="/etc/claude-code/managed-settings.d" ;;
  *)      echo "error: unsupported platform $(uname -s)" >&2; exit 1 ;;
esac

DEST="$DEST_DIR/10-venturecrane-enterprise.json"

[ -f "$SRC" ] || { echo "error: missing $SRC" >&2; exit 1; }

# Fail before touching root-owned paths if the payload is malformed — a broken
# managed-settings file is read at every session start on this machine.
if command -v jq >/dev/null 2>&1; then
  jq -e . "$SRC" >/dev/null || { echo "error: $SRC is not valid JSON" >&2; exit 1; }
  for section in allow soft_deny; do
    jq -e --arg s "$section" \
      'if (.autoMode[$s] // []) | index("$defaults") then true else false end' \
      "$SRC" >/dev/null || {
        echo "error: autoMode.$section is missing the literal \"\$defaults\"." >&2
        echo "       Omitting it discards the entire built-in ruleset for that section." >&2
        exit 1
      }
  done
else
  echo "warning: jq not found; skipping payload validation" >&2
fi

echo "Installing enterprise policy floor"
echo "  from: $SRC"
echo "    to: $DEST"
echo "This needs sudo (managed settings is root-owned by design)."

sudo mkdir -p "$DEST_DIR"
sudo cp "$SRC" "$DEST"
sudo chown root:wheel "$DEST" 2>/dev/null || sudo chown root:root "$DEST"
sudo chmod 644 "$DEST"

echo
echo "Installed. Verify in a FRESH session — settings load at session start,"
echo "so an already-running session will not see this file."
echo
echo "1. A gated verb must prompt. Safe against a non-existent app:"
echo
echo "    claude -p 'run: fly machine destroy --app no-such-app-probe 0000000000000'"
echo
echo "   Expected: the session prompts, and the prompt names the ask rule."
echo "   Do NOT verify with --help: it is harmless by construction, so the"
echo "   classifier waves it through whether or not this file loaded, and the"
echo "   check cannot fail."
echo
echo "2. A read must NOT prompt — it belongs to the classifier, which clears"
echo "   the session once you name the target:"
echo
echo "    claude -p 'run: fly machines list -a <some-app>'"
echo
echo "   Expected: blocked by the classifier. If it PROMPTS, a namespace ask"
echo "   rule survived somewhere. If it RUNS SILENTLY, a permissions.allow"
echo "   grant is shadowing the classifier and needs to be found."
