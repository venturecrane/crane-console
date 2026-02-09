#!/bin/bash
# field-mode.sh — Maximize macOS machine for standalone field dev work
#
# Usage: bash scripts/field-mode.sh [status|on|off]
#   status  — Show current memory/process state (default)
#   on      — Kill non-essential apps, free memory for CC
#   off     — (no-op, just reopen apps manually)
#
# This is NOT a sudo script. It manages user-level apps and processes.

set -euo pipefail

# Apps that are safe to kill for field dev work
KILLABLE_APPS=(
  "Safari"
  "Messages"
  "Stickies"
  "Mail"
  "Music"
  "Photos"
  "Preview"
  "System Settings"
  "Activity Monitor"
  "App Store"
  "FaceTime"
  "Maps"
  "News"
  "Reminders"
  "Stocks"
  "TV"
  "Weather"
)

# Apps we keep: Ghostty, Notes (MCP), Finder (required), Tailscale

show_status() {
  echo "=== Field Mode Status ==="
  echo ""

  # Memory overview
  local total_ram
  total_ram=$(( $(sysctl -n hw.memsize) / 1024 / 1024 ))
  local page_size
  page_size=$(vm_stat | head -1 | grep -o '[0-9]*')
  local free_pages
  free_pages=$(vm_stat | awk '/Pages free/ {gsub(/\./,"",$3); print $3}')
  local inactive_pages
  inactive_pages=$(vm_stat | awk '/Pages inactive/ {gsub(/\./,"",$3); print $3}')
  local free_mb=$(( (free_pages + inactive_pages) * page_size / 1024 / 1024 ))

  echo "Memory: ~${free_mb}MB available (free+inactive) of ${total_ram}MB"
  echo ""

  # Top memory consumers
  echo "Top processes by memory:"
  local top_procs
  top_procs=$(ps -eo rss,comm -m | awk 'NR>1 && NR<=11 {mb=int($1/1024); name=$2; gsub(/.*\//,"",name); printf "  %4dMB  %s\n", mb, name}')
  echo "$top_procs"
  echo ""

  # Claude Code sessions
  local cc_count
  cc_count=$(ps -eo comm | grep -c "^claude$" 2>/dev/null || echo "0")
  local cc_rss
  cc_rss=$(ps -eo rss,comm | awk '/claude$/ {sum+=$1} END {print int(sum/1024)}')
  echo "Claude Code: ${cc_count} session(s), ~${cc_rss:-0}MB total"
  echo ""

  # Recommendation
  if [ "${cc_count:-0}" -ge 2 ]; then
    echo "Recommendation: Close one CC session. 1 session + subagents is the sweet spot."
  elif [ "$free_mb" -lt $((total_ram * 18 / 100)) ]; then
    echo "Recommendation: Memory is tight. Run 'bash scripts/field-mode.sh on' to free up RAM."
  else
    echo "Status: Good shape for field work."
  fi
}

activate_field_mode() {
  echo "=== Activating Field Mode ==="
  echo ""

  local freed=0

  for app in "${KILLABLE_APPS[@]}"; do
    if pgrep -qf "/Applications/.*${app}" 2>/dev/null || \
       pgrep -qf "/System/Applications/.*${app}" 2>/dev/null; then
      osascript -e "tell application \"$app\" to quit" 2>/dev/null || true
      echo "  Closed: $app"
      freed=$((freed + 1))
    fi
  done

  if [ "$freed" -eq 0 ]; then
    echo "  No non-essential apps running."
  else
    echo ""
    echo "  Closed $freed app(s). Waiting for memory to settle..."
    sleep 2
  fi

  echo ""
  show_status
}

case "${1:-status}" in
  status) show_status ;;
  on)     activate_field_mode ;;
  off)    echo "Field mode off. Reopen apps as needed." ;;
  *)      echo "Usage: bash scripts/field-mode.sh [status|on|off]" ;;
esac
