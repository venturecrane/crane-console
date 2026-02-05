#!/bin/bash
# Per-machine health assessment for Crane Console dev boxes
# Runs locally or over SSH. Outputs machine-readable key=value line.
#
# Usage: bash scripts/machine-health.sh [--quick]
#   --quick  skips preflight and git sync, only runs system checks
#
# Exit codes: 0 = all passed, 1 = at least one failure, 2 = warnings only
#
# Compatible with bash 3.2+ (macOS default) and bash 5 (Linux).
# No `timeout`, no `grep -P`, no `stat`, no `declare -A`.

set -o pipefail

QUICK=false
if [ "$1" = "--quick" ]; then
    QUICK=true
fi

OS=$(uname -s)
REPO_DIR="$HOME/dev/crane-console"

# Result tracking
FAILURES=0
WARNINGS=0

# Result values (defaults)
R_DNS="ok"
R_PREFLIGHT="n/a"
R_DISK="0%"
R_UPDATES="n/a"
R_REBOOT="n/a"
R_CRANE="ok"
R_BEHIND="n/a"

# ─── Check 1: DNS resolution ──────────────────────────────────────────

dns_ok=true
if host -W 3 github.com >/dev/null 2>&1; then
    R_DNS="ok"
else
    R_DNS="fail"
    dns_ok=false
    FAILURES=$((FAILURES + 1))
fi

# ─── Check 2: Preflight ───────────────────────────────────────────────

if [ "$QUICK" = false ] && [ "$dns_ok" = true ]; then
    if [ -f "$REPO_DIR/scripts/preflight-check.sh" ]; then
        bash "$REPO_DIR/scripts/preflight-check.sh" >/dev/null 2>&1
        preflight_exit=$?
        if [ "$preflight_exit" -eq 0 ]; then
            R_PREFLIGHT="ok"
        elif [ "$preflight_exit" -eq 2 ]; then
            R_PREFLIGHT="warn"
            WARNINGS=$((WARNINGS + 1))
        else
            R_PREFLIGHT="fail"
            FAILURES=$((FAILURES + 1))
        fi
    else
        R_PREFLIGHT="fail"
        FAILURES=$((FAILURES + 1))
    fi
fi

# ─── Check 3: Disk space ──────────────────────────────────────────────

disk_line=$(df -P -h / 2>/dev/null | tail -1)
if [ -n "$disk_line" ]; then
    # Column 5 is capacity (e.g. "45%")
    capacity=$(echo "$disk_line" | awk '{print $5}')
    R_DISK="$capacity"
    # Strip % for numeric comparison
    capacity_num=$(echo "$capacity" | sed 's/%//')
    if [ "$capacity_num" -gt 90 ] 2>/dev/null; then
        WARNINGS=$((WARNINGS + 1))
    fi
else
    R_DISK="fail"
    FAILURES=$((FAILURES + 1))
fi

# ─── Check 4: System updates (Linux only) ─────────────────────────────

if [ "$OS" = "Linux" ]; then
    R_UPDATES="0"
    if [ -f /var/lib/update-notifier/updates-available ]; then
        update_count=$(grep -Eo '^[0-9]+' /var/lib/update-notifier/updates-available 2>/dev/null | head -1)
        if [ -n "$update_count" ]; then
            R_UPDATES="$update_count"
            if [ "$update_count" -gt 0 ] 2>/dev/null; then
                WARNINGS=$((WARNINGS + 1))
            fi
        fi
    fi

    if [ -f /var/run/reboot-required ]; then
        R_REBOOT="yes"
        WARNINGS=$((WARNINGS + 1))
    else
        R_REBOOT="no"
    fi
fi

# ─── Check 5: crane-mcp status ────────────────────────────────────────

if command -v crane >/dev/null 2>&1; then
    R_CRANE="ok"
else
    R_CRANE="fail"
    FAILURES=$((FAILURES + 1))
fi

# Also check dist/index.js exists
if [ ! -f "$REPO_DIR/packages/crane-mcp/dist/index.js" ]; then
    R_CRANE="fail"
    FAILURES=$((FAILURES + 1))
fi

# ─── Check 6: Git sync ────────────────────────────────────────────────

if [ "$QUICK" = false ] && [ "$dns_ok" = true ]; then
    if [ -d "$REPO_DIR/.git" ]; then
        if git -C "$REPO_DIR" fetch --quiet 2>/dev/null; then
            behind=$(git -C "$REPO_DIR" rev-list HEAD..origin/main --count 2>/dev/null)
            if [ -n "$behind" ]; then
                R_BEHIND="$behind"
                if [ "$behind" -gt 0 ] 2>/dev/null; then
                    WARNINGS=$((WARNINGS + 1))
                fi
            else
                R_BEHIND="fail"
                FAILURES=$((FAILURES + 1))
            fi
        else
            R_BEHIND="fail"
            FAILURES=$((FAILURES + 1))
        fi
    else
        R_BEHIND="fail"
        FAILURES=$((FAILURES + 1))
    fi
fi

# ─── Output ───────────────────────────────────────────────────────────

echo "preflight=$R_PREFLIGHT disk=$R_DISK updates=$R_UPDATES reboot=$R_REBOOT crane=$R_CRANE behind=$R_BEHIND dns=$R_DNS"

# ─── Exit code ────────────────────────────────────────────────────────

if [ "$FAILURES" -gt 0 ]; then
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    exit 2
else
    exit 0
fi
