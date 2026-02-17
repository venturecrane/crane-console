#!/bin/bash
#
# Claude Code statusline script for Crane ventures.
#
# Receives JSON session data on stdin from Claude Code.
# Outputs two lines:
#   Line 1: [VC] crane-console (main) - Opus
#   Line 2: [###-------] 35% | $0.42 | 5m
#
# Env vars (set by crane launcher):
#   CRANE_VENTURE_CODE - venture code (vc, ke, sc, dfg, dc)
#   CRANE_REPO         - repo basename (crane-console, ke-console, etc.)
#
# Kill switch: CRANE_STATUSLINE_DISABLE=1
#

# Kill switch
[ "$CRANE_STATUSLINE_DISABLE" = "1" ] && exit 0

# Require jq
command -v jq >/dev/null 2>&1 || exit 0

# Read JSON from stdin
INPUT=$(cat)
[ -z "$INPUT" ] && exit 0

# Parse session data
MODEL=$(echo "$INPUT" | jq -r '.model.display_name // empty')
USED_PCT=$(echo "$INPUT" | jq -r '.context_window.used_percentage // empty')
COST=$(echo "$INPUT" | jq -r '.cost.total_cost_usd // empty')
DURATION_MS=$(echo "$INPUT" | jq -r '.cost.total_duration_ms // empty')

# Venture identity (fall back to ?? / unknown if not launched via crane)
CODE="${CRANE_VENTURE_CODE:-??}"
REPO="${CRANE_REPO:-unknown}"
BADGE="[$(echo "$CODE" | tr '[:lower:]' '[:upper:]')]"

# Git branch (fast - ~5ms locally)
BRANCH=$(git branch --show-current 2>/dev/null)
[ -z "$BRANCH" ] && BRANCH="detached"

# Format duration
if [ -n "$DURATION_MS" ] && [ "$DURATION_MS" != "null" ]; then
  TOTAL_SEC=$((${DURATION_MS%.*} / 1000))
  if [ "$TOTAL_SEC" -ge 3600 ]; then
    HOURS=$((TOTAL_SEC / 3600))
    MINS=$(( (TOTAL_SEC % 3600) / 60 ))
    DURATION="${HOURS}h${MINS}m"
  elif [ "$TOTAL_SEC" -ge 60 ]; then
    MINS=$((TOTAL_SEC / 60))
    DURATION="${MINS}m"
  else
    DURATION="${TOTAL_SEC}s"
  fi
else
  DURATION="-"
fi

# Format cost
if [ -n "$COST" ] && [ "$COST" != "null" ]; then
  COST_FMT="\$${COST}"
else
  COST_FMT="-"
fi

# Build context bar (20 chars wide)
BAR_WIDTH=20
if [ -n "$USED_PCT" ] && [ "$USED_PCT" != "null" ]; then
  PCT_INT=${USED_PCT%.*}
  FILLED=$(( (PCT_INT * BAR_WIDTH + 50) / 100 ))
  [ "$FILLED" -gt "$BAR_WIDTH" ] && FILLED=$BAR_WIDTH
  EMPTY=$((BAR_WIDTH - FILLED))
  BAR=$(printf '%0.s#' $(seq 1 "$FILLED" 2>/dev/null))$(printf '%0.s-' $(seq 1 "$EMPTY" 2>/dev/null))
  PCT_LABEL="${PCT_INT}%"
else
  BAR=$(printf '%0.s-' $(seq 1 "$BAR_WIDTH"))
  PCT_LABEL="-"
fi

# Line 1: bold badge + repo + branch + model
MODEL_LABEL="${MODEL:-unknown}"
echo -e "\033[1m${BADGE}\033[0m ${REPO} (${BRANCH}) - ${MODEL_LABEL}"

# Line 2: context bar + cost + duration
echo "[${BAR}] ${PCT_LABEL} | ${COST_FMT} | ${DURATION}"
