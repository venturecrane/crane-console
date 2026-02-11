#!/bin/bash
#
# Crane Console Switcher (ccs)
# Quickly switch between venture repositories
#
# Fetches venture list from crane-context API with caching and fallback.
# Source this file to add the `ccs` function to your shell.
#
# Usage:
#   source scripts/ccs.sh
#   ccs              # Show menu and switch
#   ccs <number>     # Switch directly to numbered option
#

# ============================================================================
# Configuration
# ============================================================================

CCS_API_URL="${CRANE_CONTEXT_URL:-https://crane-context.automation-ab6.workers.dev}"
CCS_CACHE_FILE="/tmp/crane-ventures.json"
CCS_CACHE_TTL=86400  # 24 hours in seconds
CCS_PROJECTS_DIR="${CRANE_PROJECTS_DIR:-$HOME/Documents/SMDurgan LLC/Projects}"

# ============================================================================
# Embedded Fallback (used if API and cache both unavailable)
# ============================================================================

# Try to read from config file if available (relative to this script)
CCS_CONFIG_FILE="${CCS_CONFIG_FILE:-$(dirname "${BASH_SOURCE[0]}")/../config/ventures.json}"
if [ -f "$CCS_CONFIG_FILE" ] && command -v jq >/dev/null 2>&1; then
  CCS_FALLBACK_VENTURES=$(jq -c '.ventures' "$CCS_CONFIG_FILE" 2>/dev/null)
fi

# If config file read failed, use embedded fallback
if [ -z "$CCS_FALLBACK_VENTURES" ]; then
  CCS_FALLBACK_VENTURES='[
    {"code":"vc","name":"Venture Crane","org":"venturecrane"},
    {"code":"sc","name":"Silicon Crane","org":"venturecrane"},
    {"code":"dfg","name":"Durgan Field Guide","org":"venturecrane"},
    {"code":"ke","name":"Kid Expenses","org":"venturecrane"},
    {"code":"smd","name":"SMD Ventures","org":"venturecrane"},
    {"code":"dc","name":"Draft Crane","org":"venturecrane"}
  ]'
fi

# ============================================================================
# Helper Functions
# ============================================================================

_ccs_cache_valid() {
  if [ ! -f "$CCS_CACHE_FILE" ]; then
    return 1
  fi

  local cache_age
  local now
  now=$(date +%s)

  if [[ "$OSTYPE" == "darwin"* ]]; then
    cache_age=$(stat -f %m "$CCS_CACHE_FILE" 2>/dev/null || echo 0)
  else
    cache_age=$(stat -c %Y "$CCS_CACHE_FILE" 2>/dev/null || echo 0)
  fi

  if [ $((now - cache_age)) -lt $CCS_CACHE_TTL ]; then
    return 0
  fi
  return 1
}

_ccs_fetch_ventures() {
  local response

  # Try API first
  if response=$(curl -sS --max-time 5 "$CCS_API_URL/ventures" 2>/dev/null); then
    if echo "$response" | jq -e '.ventures' > /dev/null 2>&1; then
      # Cache the response
      echo "$response" | jq '.ventures' > "$CCS_CACHE_FILE" 2>/dev/null
      echo "$response" | jq -c '.ventures'
      return 0
    fi
  fi

  # Try cache
  if _ccs_cache_valid; then
    cat "$CCS_CACHE_FILE" | jq -c '.'
    return 0
  fi

  # Use embedded fallback
  echo "$CCS_FALLBACK_VENTURES" | jq -c '.'
  return 0
}

_ccs_find_repo() {
  local org="$1"
  local dir remote

  # Look for directories that match org name patterns
  for dir in "$CCS_PROJECTS_DIR"/*; do
    if [ -d "$dir/.git" ]; then
      remote=$(git -C "$dir" remote get-url origin 2>/dev/null) || continue
      case "$remote" in
        *github.com[:/]"$org"/*|*github.com[:/]"$org".git)
          printf '%s' "$dir"
          return 0
          ;;
      esac
    fi
  done
}

# ============================================================================
# Main Function
# ============================================================================

ccs() {
  local ventures count i selection idx
  local target_org target_name repo_dir org name num

  ventures=$(_ccs_fetch_ventures)

  if [ -z "$ventures" ]; then
    echo "Error: Could not load venture list" >&2
    return 1
  fi

  count=$(echo "$ventures" | jq 'length')

  if [ "$count" -eq 0 ]; then
    echo "Error: No ventures found" >&2
    return 1
  fi

  # If argument provided, use it directly
  if [ -n "$1" ]; then
    selection="$1"
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "$count" ]; then
      echo "Invalid selection: $selection (must be 1-$count)" >&2
      return 1
    fi

    idx=$((selection - 1))
    target_org=$(echo "$ventures" | jq -r ".[$idx].org")
    target_name=$(echo "$ventures" | jq -r ".[$idx].name")
    repo_dir=$(_ccs_find_repo "$target_org")

    if [ -n "$repo_dir" ]; then
      echo "Switching to $target_name ($target_org)"
      cd "$repo_dir" || return 1
    else
      echo "No local repo found for $target_org" >&2
      echo "Looking in: $CCS_PROJECTS_DIR" >&2
      return 1
    fi
    return 0
  fi

  # Display menu
  echo "Crane Console Switcher"
  echo "======================"
  echo ""

  i=0
  while [ "$i" -lt "$count" ]; do
    num=$((i + 1))
    org=$(echo "$ventures" | jq -r ".[$i].org")
    name=$(echo "$ventures" | jq -r ".[$i].name")
    repo_dir=$(_ccs_find_repo "$org")

    if [ -n "$repo_dir" ]; then
      printf "  %d) %-20s [%s]\n" "$num" "$name" "$org"
    else
      printf "  %d) %-20s [%s] (not found)\n" "$num" "$name" "$org"
    fi
    i=$((i + 1))
  done

  echo ""
  printf "Select (1-%d): " "$count"
  read -r selection

  if [ -z "$selection" ]; then
    echo "Cancelled"
    return 0
  fi

  if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "$count" ]; then
    echo "Invalid selection" >&2
    return 1
  fi

  idx=$((selection - 1))
  target_org=$(echo "$ventures" | jq -r ".[$idx].org")
  target_name=$(echo "$ventures" | jq -r ".[$idx].name")
  repo_dir=$(_ccs_find_repo "$target_org")

  if [ -n "$repo_dir" ]; then
    echo "Switching to $target_name ($target_org)"
    cd "$repo_dir" || return 1
  else
    echo "No local repo found for $target_org" >&2
    echo "Looking in: $CCS_PROJECTS_DIR" >&2
    return 1
  fi
}

# Make function available when sourced (works in both bash and zsh)
