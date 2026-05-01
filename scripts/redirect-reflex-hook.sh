#!/bin/bash
#
# Redirect Reflex Hook (UserPromptSubmit)
#
# Pattern-matches imprecise redirect language in the Captain's prompt and
# prepends a one-line reflex reminder so the next assistant turn fires the
# verify-then-act loop documented in docs/instructions/session-reflexes.md.
#
# Reads Claude Code hook input on stdin (JSON with .prompt). On match: prints
# a single reminder line to stdout (becomes additional context for the next
# turn). On no match: silent, exit 0 — zero overhead.
#
# Patterns are conservative on purpose: the cost of a false positive is
# annoying the Captain; the cost of a false negative is the originating
# session this work was built to prevent.

set -e

# Read prompt from stdin JSON. If jq unavailable or input malformed, exit 0
# silently — never block the Captain on a hook plumbing failure.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

PROMPT=$(jq -r '.prompt // empty' 2>/dev/null) || exit 0
[ -z "$PROMPT" ] && exit 0

# Patterns — case-insensitive, word-boundary anchored where it matters.
PATTERNS=(
  '\brecalibrat(e|ing|ion)\b'
  '\bstep up\b'
  '\bstop asking\b'
  '\bout of sync\b'
  '\byou keep [a-zA-Z]+ing\b'
  '\bquestions? you can answer\b'
)

for pat in "${PATTERNS[@]}"; do
  if echo "$PROMPT" | grep -qiE "$pat"; then
    echo "[reflex] Imprecise redirect detected. Pause; decode the signal (see docs/instructions/session-reflexes.md); verify against code/memory before acting."
    exit 0
  fi
done

exit 0
