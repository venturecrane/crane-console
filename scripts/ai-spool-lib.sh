#!/bin/bash
#
# ai-spool-lib.sh - Core spool functions for offline resilience
#
# Source this file to use spool functions:
#   source ai-spool-lib.sh
#
# Key functions:
#   _ai_spool_dir        - Returns/creates spool directory
#   _ai_generate_idempotency_key - Deterministic key for safe replay
#   _ai_post_or_spool    - Try API call, spool on failure
#   _ai_spool_request    - Save failed request to spool directory
#   _ai_spool_count      - Return count of pending files
#   ai_spool_flush       - Process all pending requests

# ============================================================================
# Configuration
# ============================================================================

AI_SPOOL_DIR="${AI_SPOOL_DIR:-$HOME/.ai_spool}"
AI_SPOOL_MAX_RETRIES="${AI_SPOOL_MAX_RETRIES:-10}"
AI_SPOOL_LOCK_TIMEOUT="${AI_SPOOL_LOCK_TIMEOUT:-300}"  # 5 minutes

# Colors for output
_SPOOL_RED='\033[0;31m'
_SPOOL_GREEN='\033[0;32m'
_SPOOL_YELLOW='\033[1;33m'
_SPOOL_NC='\033[0m'

# ============================================================================
# Core Functions
# ============================================================================

# Returns the spool directory path, creating it if needed
_ai_spool_dir() {
  mkdir -p "$AI_SPOOL_DIR"
  echo "$AI_SPOOL_DIR"
}

# Generate a deterministic idempotency key for safe replay
# Format: endpoint:session_id:date
# Server has 1-hour TTL for idempotency keys
_ai_generate_idempotency_key() {
  local endpoint="$1"
  local session_id="$2"
  local date_str
  date_str=$(date -u +%Y-%m-%dT%H)  # Hour granularity for 1-hour TTL
  echo "${endpoint}:${session_id}:${date_str}"
}

# Count pending spool files
_ai_spool_count() {
  local spool_dir
  spool_dir=$(_ai_spool_dir)
  find "$spool_dir" -maxdepth 1 -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' '
}

# Save a failed request to the spool directory
# Arguments: endpoint, session_id, body
_ai_spool_request() {
  local endpoint="$1"
  local session_id="$2"
  local body="$3"
  local spool_dir
  local timestamp
  local filename
  local spool_file

  spool_dir=$(_ai_spool_dir)
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  filename="$(date +%s)-$(echo "$endpoint" | tr '/' '-')-${session_id:0:8}.json"
  spool_file="$spool_dir/$filename"

  # Create spool file with request details
  cat > "$spool_file" << EOF
{
  "endpoint": "$endpoint",
  "session_id": "$session_id",
  "body": $body,
  "spooled_at": "$timestamp",
  "retry_count": 0
}
EOF

  echo "$spool_file"
}

# Try to make an API call, spool on failure
# Arguments: endpoint, session_id, body
# Returns: 0 on success, 1 on failure (spooled)
_ai_post_or_spool() {
  local endpoint="$1"
  local session_id="$2"
  local body="$3"
  local max_attempts=3
  local attempt=1
  local delay=2
  local result
  local http_code
  local api_url="${CRANE_CONTEXT_URL:-https://crane-context.automation-ab6.workers.dev}"
  local relay_key="${CRANE_CONTEXT_KEY:-}"
  local idempotency_key

  # Generate idempotency key for safe replay
  idempotency_key=$(_ai_generate_idempotency_key "$endpoint" "$session_id")

  # Try API call with exponential backoff
  while [ $attempt -le $max_attempts ]; do
    # Make the request and capture both response and HTTP code
    http_code=$(curl -sS --max-time 15 -w "%{http_code}" -o /tmp/ai_spool_response.$$ \
      "${api_url}${endpoint}" \
      -H "X-Relay-Key: $relay_key" \
      -H "Content-Type: application/json" \
      -H "X-Idempotency-Key: $idempotency_key" \
      -X POST \
      -d "$body" 2>/dev/null) || http_code="000"

    result=$(cat /tmp/ai_spool_response.$$ 2>/dev/null || echo "")
    rm -f /tmp/ai_spool_response.$$

    # Check for success (2xx status codes)
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
      echo "$result"
      return 0
    fi

    # Check for client errors (4xx) - don't retry these
    if [[ "$http_code" =~ ^4[0-9][0-9]$ ]]; then
      echo "$result"
      return 2  # Client error, don't spool
    fi

    if [ $attempt -lt $max_attempts ]; then
      sleep $delay
      delay=$((delay * 2))
    fi
    ((attempt++))
  done

  # All attempts failed - spool the request
  local spool_file
  spool_file=$(_ai_spool_request "$endpoint" "$session_id" "$body")

  echo -e "${_SPOOL_YELLOW}Offline - queued for later: $spool_file${_SPOOL_NC}" >&2
  return 1
}

# Process all pending spooled requests
# Returns: 0 on success, 1 if some requests failed
ai_spool_flush() {
  local spool_dir
  local lock_file
  local processed=0
  local failed=0
  local archived=0
  local api_url="${CRANE_CONTEXT_URL:-https://crane-context.automation-ab6.workers.dev}"
  local relay_key="${CRANE_CONTEXT_KEY:-}"

  spool_dir=$(_ai_spool_dir)
  lock_file="$spool_dir/.flush.lock"

  # Check for stale lock (older than 5 minutes)
  if [ -f "$lock_file" ]; then
    local lock_age
    lock_age=$(($(date +%s) - $(stat -f %m "$lock_file" 2>/dev/null || stat -c %Y "$lock_file" 2>/dev/null || echo "0")))
    if [ "$lock_age" -lt "$AI_SPOOL_LOCK_TIMEOUT" ]; then
      echo -e "${_SPOOL_YELLOW}Flush already in progress (lock age: ${lock_age}s)${_SPOOL_NC}" >&2
      return 1
    fi
    echo -e "${_SPOOL_YELLOW}Removing stale lock file${_SPOOL_NC}" >&2
    rm -f "$lock_file"
  fi

  # Create lock file
  echo $$ > "$lock_file"
  trap 'rm -f "$lock_file"' EXIT

  # Process files in FIFO order (oldest first)
  local files
  files=$(find "$spool_dir" -maxdepth 1 -name "*.json" -type f 2>/dev/null | sort)

  if [ -z "$files" ]; then
    rm -f "$lock_file"
    return 0
  fi

  echo "Processing spooled requests..."

  for spool_file in $files; do
    [ -f "$spool_file" ] || continue

    local endpoint session_id body retry_count idempotency_key http_code result

    # Read spool file
    endpoint=$(jq -r '.endpoint' "$spool_file")
    session_id=$(jq -r '.session_id' "$spool_file")
    body=$(jq -c '.body' "$spool_file")
    retry_count=$(jq -r '.retry_count // 0' "$spool_file")

    # Generate idempotency key
    idempotency_key=$(_ai_generate_idempotency_key "$endpoint" "$session_id")

    # Try to replay the request
    http_code=$(curl -sS --max-time 15 -w "%{http_code}" -o /tmp/ai_spool_response.$$ \
      "${api_url}${endpoint}" \
      -H "X-Relay-Key: $relay_key" \
      -H "Content-Type: application/json" \
      -H "X-Idempotency-Key: $idempotency_key" \
      -X POST \
      -d "$body" 2>/dev/null) || http_code="000"

    result=$(cat /tmp/ai_spool_response.$$ 2>/dev/null || echo "")
    rm -f /tmp/ai_spool_response.$$

    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
      # Success - remove spool file
      rm -f "$spool_file"
      ((processed++))
      echo -e "  ${_SPOOL_GREEN}✓${_SPOOL_NC} $endpoint (session: ${session_id:0:8}...)"
    elif [[ "$http_code" =~ ^4[0-9][0-9]$ ]]; then
      # Client error - archive, don't retry
      mkdir -p "$spool_dir/.failed"
      mv "$spool_file" "$spool_dir/.failed/"
      ((archived++))
      echo -e "  ${_SPOOL_RED}✗${_SPOOL_NC} $endpoint - client error ($http_code), archived"
    else
      # Server/network error - update retry count
      ((retry_count++))
      if [ "$retry_count" -ge "$AI_SPOOL_MAX_RETRIES" ]; then
        # Max retries reached - archive
        mkdir -p "$spool_dir/.failed"
        mv "$spool_file" "$spool_dir/.failed/"
        ((archived++))
        echo -e "  ${_SPOOL_RED}✗${_SPOOL_NC} $endpoint - max retries ($AI_SPOOL_MAX_RETRIES), archived"
      else
        # Update retry count in spool file
        local tmp_file
        tmp_file=$(mktemp)
        jq --argjson count "$retry_count" '.retry_count = $count' "$spool_file" > "$tmp_file"
        mv "$tmp_file" "$spool_file"
        ((failed++))
        echo -e "  ${_SPOOL_YELLOW}↻${_SPOOL_NC} $endpoint - retry $retry_count/$AI_SPOOL_MAX_RETRIES"
      fi
    fi
  done

  rm -f "$lock_file"
  trap - EXIT

  # Summary
  echo ""
  echo "Flush complete: $processed succeeded, $failed pending, $archived archived"

  [ "$failed" -eq 0 ]
}

# ============================================================================
# Export functions for use in sourced scripts
# ============================================================================

export -f _ai_spool_dir
export -f _ai_generate_idempotency_key
export -f _ai_spool_count
export -f _ai_spool_request
export -f _ai_post_or_spool
export -f ai_spool_flush
