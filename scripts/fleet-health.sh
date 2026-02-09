#!/bin/bash
# Fleet Health Check - Orchestrates machine-health.sh across all dev machines
#
# Usage: bash scripts/fleet-health.sh
#
# Environment Variables:
#   SKIP=alias[,alias]    Skip unreachable machines (e.g. SKIP=think)
#
# Runs machine-health.sh locally and on each remote machine via SSH.
# Displays per-check results for each machine.
#
# Compatible with bash 3.2+ (macOS default).
# No `declare -A`, no `timeout`.

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Machine list — keep in sync with docs/infra/machine-inventory.md
MACHINES=(
    "local"      # mac23
    "mbp27"      # MacBook Pro (Xubuntu)
    "mini"       # Mac mini (Ubuntu Server)
    "think"      # ThinkPad (Xubuntu)
    "m16"        # MacBook Air (field)
)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Parse SKIP list (space-delimited string) ─────────────────────────

SKIP_LIST=" "
if [ -n "$SKIP" ]; then
    IFS=',' read -ra _skip_arr <<< "$SKIP"
    for s in "${_skip_arr[@]}"; do
        SKIP_LIST="${SKIP_LIST}${s} "
    done
fi

is_skipped() { [[ "$SKIP_LIST" == *" $1 "* ]]; }

# ─── Result storage (parallel arrays, bash 3.2 compatible) ────────────

RES_MACHINE=()
RES_STATUS=()
RES_OUTPUT=()

# ─── Counters ─────────────────────────────────────────────────────────

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ─── Header ───────────────────────────────────────────────────────────

echo ""
echo "Fleet Health Check"
echo "=================="
echo ""

# ─── Phase 1: Parallel SSH reachability ────────────────────────────────

# Background SSH probes for remote machines
SSH_PIDS=()
SSH_MACHINES=()

for machine in "${MACHINES[@]}"; do
    if [ "$machine" = "local" ]; then
        continue
    fi

    if is_skipped "$machine"; then
        continue
    fi

    # Background SSH check, write result to temp file
    (
        if ssh -o ConnectTimeout=5 -o BatchMode=yes "$machine" "echo ok" >/dev/null 2>&1; then
            echo "ok" > "/tmp/fleet-ssh-$machine"
        else
            echo "fail" > "/tmp/fleet-ssh-$machine"
        fi
    ) &
    SSH_PIDS+=($!)
    SSH_MACHINES+=("$machine")
done

# Wait for all SSH probes
for pid in "${SSH_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# Read SSH results into a space-delimited string
REACHABLE_LIST=" local "
for machine in "${SSH_MACHINES[@]}"; do
    result=$(cat "/tmp/fleet-ssh-$machine" 2>/dev/null || echo "fail")
    rm -f "/tmp/fleet-ssh-$machine"
    if [ "$result" = "ok" ]; then
        REACHABLE_LIST="${REACHABLE_LIST}${machine} "
    fi
done

is_reachable() { [[ "$REACHABLE_LIST" == *" $1 "* ]]; }

# ─── Phase 2: Run machine-health.sh on each machine ───────────────────

for machine in "${MACHINES[@]}"; do
    if is_skipped "$machine"; then
        RES_MACHINE+=("$machine")
        RES_STATUS+=("SKIP")
        RES_OUTPUT+=("(skipped)")
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
    fi

    if [ "$machine" != "local" ] && ! is_reachable "$machine"; then
        RES_MACHINE+=("$machine")
        RES_STATUS+=("SKIP")
        RES_OUTPUT+=("(unreachable)")
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
    fi

    if [ "$machine" = "local" ]; then
        # Run locally
        output=$(bash "$SCRIPT_DIR/machine-health.sh" 2>/dev/null)
        exit_code=$?
    else
        # Run remotely via SSH
        output=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$machine" \
            "cd ~/dev/crane-console && bash scripts/machine-health.sh" 2>/dev/null)
        exit_code=$?
    fi

    RES_MACHINE+=("$machine")
    RES_OUTPUT+=("$output")

    if [ "$exit_code" -eq 0 ]; then
        RES_STATUS+=("PASS")
        PASS_COUNT=$((PASS_COUNT + 1))
    elif [ "$exit_code" -eq 2 ]; then
        RES_STATUS+=("WARN")
        WARN_COUNT=$((WARN_COUNT + 1))
    else
        RES_STATUS+=("FAIL")
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

# ─── Display results ──────────────────────────────────────────────────

echo "Machine Checks:"
for (( i=0; i<${#RES_MACHINE[@]}; i++ )); do
    machine="${RES_MACHINE[$i]}"
    status="${RES_STATUS[$i]}"
    output="${RES_OUTPUT[$i]}"

    case "$status" in
        PASS)
            printf "  [%-6s] ${GREEN}%-4s${NC}  %s\n" "$machine" "PASS" "$output"
            ;;
        WARN)
            printf "  [%-6s] ${YELLOW}%-4s${NC}  %s\n" "$machine" "WARN" "$output"
            ;;
        FAIL)
            printf "  [%-6s] ${RED}%-4s${NC}  %s\n" "$machine" "FAIL" "$output"
            ;;
        SKIP)
            printf "  [%-6s] ${YELLOW}%-4s${NC}  %s\n" "$machine" "SKIP" "$output"
            ;;
    esac
done

# ─── Summary ──────────────────────────────────────────────────────────

echo ""
PARTS=""
if [ "$PASS_COUNT" -gt 0 ]; then
    PARTS="${PASS_COUNT} pass"
fi
if [ "$WARN_COUNT" -gt 0 ]; then
    [ -n "$PARTS" ] && PARTS="$PARTS, "
    PARTS="${PARTS}${WARN_COUNT} warn"
fi
if [ "$FAIL_COUNT" -gt 0 ]; then
    [ -n "$PARTS" ] && PARTS="$PARTS, "
    PARTS="${PARTS}${FAIL_COUNT} fail"
fi
if [ "$SKIP_COUNT" -gt 0 ]; then
    [ -n "$PARTS" ] && PARTS="$PARTS, "
    PARTS="${PARTS}${SKIP_COUNT} skip"
fi
echo "Summary: $PARTS"

# ─── Exit code ────────────────────────────────────────────────────────

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    exit 2
else
    exit 0
fi
