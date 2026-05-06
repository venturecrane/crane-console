#!/bin/bash
#
# Session Reflex Primer Hook (UserPromptSubmit) — v2 (always-on)
#
# Prepends a one-line reflex primer to the agent's context on every user
# prompt. The agent reads it before generating its next turn, biasing toward
# verify-before-opining and the four reflexes documented in
# docs/instructions/session-reflexes.md.
#
# Why always-on:
#   v1 of this hook used six regex patterns derived from a single session's
#   redirect language. Mining 5 recent JSONL transcripts (906 user turns,
#   18 verbatim Captain redirects) showed those patterns matched 0 of 18.
#   Pattern-matching against natural redirect language is too brittle to
#   build a forcing function on. The reflexes are universal; the primer
#   should fire universally too.
#
# Wire protocol:
#   stdin:  JSON with .prompt field (Claude Code hook contract)
#   stdout: single line — becomes additional context for the next turn
#   exit 0 always; never block the Captain on a hook plumbing failure
#
# If jq is unavailable or stdin is malformed, the hook exits silently. The
# cost of a missed primer is one turn without the reminder; the cost of a
# blocked prompt is the agent appearing broken to the Captain.

set -e

# Read prompt from stdin JSON. Even though the primer fires unconditionally,
# we keep the input read to (a) preserve the Claude Code contract,
# (b) leave room for future telemetry that needs the prompt, and
# (c) fail silently on malformed input rather than emit a bare line.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

PROMPT=$(jq -r '.prompt // empty' 2>/dev/null) || exit 0
[ -z "$PROMPT" ] && exit 0

echo "[reflex] Verify before opining (record with crane_verify); decode redirects precisely; classify questions (factual=read, judgment=decide, Captain-only=ask); respect mode framing; before stating duration estimates, run /estimate. See docs/instructions/session-reflexes.md."

exit 0
