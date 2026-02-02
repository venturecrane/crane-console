#!/bin/bash
#
# ai-spool-flush.sh - Standalone flush command for spooled requests
#
# Processes all pending offline requests and replays them to the API.
#
# Usage: ai-spool-flush
#
# Exit codes:
#   0 - All requests processed successfully (or no requests pending)
#   1 - Some requests still pending or failed
#

set -o pipefail

# Find and source the spool library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Try multiple locations for the library
if [ -f "$SCRIPT_DIR/ai-spool-lib.sh" ]; then
  source "$SCRIPT_DIR/ai-spool-lib.sh"
elif [ -f "$HOME/.local/bin/ai-spool-lib.sh" ]; then
  source "$HOME/.local/bin/ai-spool-lib.sh"
else
  echo "Error: ai-spool-lib.sh not found" >&2
  echo "Expected locations:" >&2
  echo "  $SCRIPT_DIR/ai-spool-lib.sh" >&2
  echo "  $HOME/.local/bin/ai-spool-lib.sh" >&2
  exit 1
fi

# Check for required environment variable
if [ -z "${CRANE_CONTEXT_KEY:-}" ]; then
  echo "Error: CRANE_CONTEXT_KEY not set" >&2
  echo "" >&2
  echo "Set the key in your shell config:" >&2
  echo "  export CRANE_CONTEXT_KEY=\"your-key\"" >&2
  exit 1
fi

# Show current spool status
SPOOL_COUNT=$(_ai_spool_count)

if [ "$SPOOL_COUNT" -eq 0 ]; then
  echo "No spooled requests to process."
  exit 0
fi

echo "Found $SPOOL_COUNT spooled request(s)"
echo ""

# Flush the spool
ai_spool_flush
exit $?
