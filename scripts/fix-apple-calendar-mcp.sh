#!/bin/bash
#
# Fix path bug in mcp-apple-calendar's list-events.js
#
# The npm package has a bug where dist/tools/list-events.js references
# join(__dirname, "helpers", ...) but the helpers directory is at
# dist/helpers/, not dist/tools/helpers/. This patches it to use
# join(__dirname, "..", "helpers", ...) instead.
#
# Idempotent - safe to re-run. No-ops if already patched or not installed.
#
# Usage:
#   bash scripts/fix-apple-calendar-mcp.sh
#

set -e
set -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*"; }

NPX_CACHE="$HOME/.npm/_npx"

if [ ! -d "$NPX_CACHE" ]; then
    log_warn "npx cache not found at $NPX_CACHE - run 'npx --yes mcp-apple-calendar --version' first"
    exit 1
fi

# Warm the npx cache to ensure we have the latest version
log_info "Warming npx cache..."
npx --yes mcp-apple-calendar --version 2>/dev/null || true

# Find all list-events.js files across all cached versions
TARGETS=()
while IFS= read -r f; do
    TARGETS+=("$f")
done < <(find "$NPX_CACHE" -path "*/mcp-apple-calendar/dist/tools/list-events.js" 2>/dev/null)

if [ ${#TARGETS[@]} -eq 0 ]; then
    log_warn "mcp-apple-calendar not found in npx cache"
    exit 1
fi

if [ ${#TARGETS[@]} -gt 1 ]; then
    log_warn "Found ${#TARGETS[@]} cached versions of mcp-apple-calendar - patching all"
fi

PATCHED=0
ALREADY=0

for target in "${TARGETS[@]}"; do
    if grep -q 'join(__dirname, "helpers"' "$target" 2>/dev/null; then
        # Bug present - apply patch
        sed -i '' 's|join(__dirname, "helpers"|join(__dirname, "..", "helpers"|g' "$target"
        log_ok "Patched: $target"
        ((PATCHED++)) || true
    elif grep -q 'join(__dirname, "..", "helpers"' "$target" 2>/dev/null; then
        log_ok "Already patched: $target"
        ((ALREADY++)) || true
    else
        log_warn "Unexpected content in $target - skipping"
    fi
done

# Verify patch by calling the helper binary directly
HELPER_DIR=$(dirname "${TARGETS[0]}")/../helpers
HELPER_BIN="$HELPER_DIR/calendar-events"

if [ -x "$HELPER_BIN" ]; then
    log_info "Verifying helper binary..."
    TODAY=$(date +%Y-%m-%d)
    TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "+1 day" +%Y-%m-%d 2>/dev/null || echo "")

    if [ -n "$TOMORROW" ]; then
        OUTPUT=$("$HELPER_BIN" "$TODAY" "$TOMORROW" 2>/dev/null || true)
        if echo "$OUTPUT" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
            log_ok "Helper binary produces valid JSON"
        else
            log_warn "Helper binary output is not valid JSON - calendar permissions may need granting"
        fi
    else
        log_warn "Could not compute tomorrow's date for verification - skipping"
    fi
else
    log_warn "Helper binary not found at $HELPER_BIN - may need recompilation"
fi

log_ok "Done: $PATCHED patched, $ALREADY already patched"
