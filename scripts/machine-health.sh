#!/bin/bash
# Per-machine health assessment for Crane Console dev boxes.
# Runs locally or over SSH.
#
# Usage:
#   bash scripts/machine-health.sh [--quick] [--json]
#     --quick  skip preflight and git sync (only system checks)
#     --json   emit JSON on stdout instead of the legacy key=value line
#
# Legacy output (default): byte-identical single line
#   preflight=... disk=... updates=... reboot=... crane=... infisical=... behind=... dns=...
#
# JSON output (--json): full object with macOS + Linux host-patch fields
# consumed by the Hermes-on-mini fleet update orchestrator (#657):
#   { preflight, disk, os_updates, os_security, brew_outdated, reboot_required,
#     uptime_days, xcode_clt_outdated, crane, infisical, behind, dns }
#
# Exit codes: 0 = all passed, 1 = at least one failure, 2 = warnings only
#
# Compatible with bash 3.2+ (macOS default) and bash 5 (Linux).
# No `timeout`, no `grep -P`, no `stat`, no `declare -A`, no `jq`.

set -o pipefail

# ─── Parse flags ──────────────────────────────────────────────────────

QUICK=false
JSON=false
for arg in "$@"; do
    case "$arg" in
        --quick) QUICK=true ;;
        --json)  JSON=true ;;
        *) ;;  # ignore unknown for forward compat
    esac
done

OS=$(uname -s)
REPO_DIR="$HOME/dev/crane-console"

# Source env vars from shell profiles for non-interactive sessions (e.g. SSH)
# Shell profiles guard against non-interactive shells, so extract exports directly.
if [ -z "$CRANE_CONTEXT_KEY" ]; then
    eval "$(grep -h '^export ' "$HOME/.bashrc" "$HOME/.zshrc" 2>/dev/null)"
fi

# Result tracking
FAILURES=0
WARNINGS=0

# Result values (defaults)
R_DNS="ok"
R_PREFLIGHT="n/a"
R_DISK="0%"
R_UPDATES="n/a"         # legacy key=value alias for all-updates count
R_REBOOT="n/a"           # legacy reboot flag ('yes' | 'no' | 'n/a')
R_CRANE="ok"
R_INFISICAL="ok"
R_BEHIND="n/a"

# Extended fields (JSON mode only, but collected in both paths).
R_OS_UPDATES="0"           # total pending OS updates
R_OS_SECURITY="0"          # pending security-flagged updates
R_BREW_OUTDATED="0"        # macOS brew formulae outdated count (0 on Linux)
R_REBOOT_REQUIRED="false"  # bool
R_UPTIME_DAYS="0"
R_XCODE_CLT_OUTDATED="false"  # bool; macOS only

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

# ─── Check 4: System updates (OS-specific) ────────────────────────────

if [ "$OS" = "Linux" ]; then
    # Legacy path: total count from update-notifier (unchanged).
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
    R_OS_UPDATES="$R_UPDATES"

    # New: security-only subset. apt list --upgradable is reliable on
    # Ubuntu/Xubuntu; suppress stderr because the first invocation prints
    # a "WARNING: apt does not have a stable CLI" line to stderr.
    if command -v apt >/dev/null 2>&1; then
        sec_count=$(apt list --upgradable 2>/dev/null | grep -c '\-security' || echo 0)
        R_OS_SECURITY="$sec_count"
    fi

    # Reboot required (existing + bool mirror for JSON).
    if [ -f /var/run/reboot-required ]; then
        R_REBOOT="yes"
        R_REBOOT_REQUIRED="true"
        WARNINGS=$((WARNINGS + 1))
    else
        R_REBOOT="no"
        R_REBOOT_REQUIRED="false"
    fi

    # Uptime days from /proc/uptime (first field = seconds since boot).
    if [ -r /proc/uptime ]; then
        R_UPTIME_DAYS=$(awk '{print int($1/86400)}' /proc/uptime 2>/dev/null || echo 0)
    fi

elif [ "$OS" = "Darwin" ]; then
    # macOS: softwareupdate -l lists pending updates. Parse the label
    # lines; count is our os_updates signal. Recommended flag indicates
    # security-critical updates — count those as os_security.
    if command -v softwareupdate >/dev/null 2>&1; then
        # --no-scan avoids hitting Apple's servers; returns cached state
        # which is refreshed by Apple's background SUHelper at least
        # weekly. Good enough for our cadence.
        su_output=$(softwareupdate -l --no-scan 2>&1 || true)

        # Total updates: count "Label:" lines.
        total_updates=$(echo "$su_output" | grep -c '^\s*\*\?\s*Label:' 2>/dev/null || echo 0)
        # Normalize — grep -c with no matches returns 0 but also sometimes
        # a blank. Ensure numeric.
        case "$total_updates" in
            ''|*[!0-9]*) total_updates=0 ;;
        esac
        R_OS_UPDATES="$total_updates"
        # Legacy R_UPDATES key mirrors the total (was n/a on macOS before).
        R_UPDATES="$total_updates"
        if [ "$total_updates" -gt 0 ] 2>/dev/null; then
            WARNINGS=$((WARNINGS + 1))
        fi

        # Security-flagged updates: plain text scan for "Recommended: YES"
        # on each block. Simpler and more portable than PlistBuddy.
        sec_count=$(echo "$su_output" | grep -c 'Recommended: *YES' 2>/dev/null || echo 0)
        case "$sec_count" in
            ''|*[!0-9]*) sec_count=0 ;;
        esac
        R_OS_SECURITY="$sec_count"

        # Xcode Command Line Tools freshness. Label contains "Command Line
        # Tools" when an update is available.
        if echo "$su_output" | grep -qi 'Command Line Tools'; then
            R_XCODE_CLT_OUTDATED="true"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi

    # Homebrew outdated count. brew outdated --quiet prints one formula
    # per line.
    if command -v brew >/dev/null 2>&1; then
        R_BREW_OUTDATED=$(brew outdated --quiet 2>/dev/null | wc -l | tr -d ' ' || echo 0)
        case "$R_BREW_OUTDATED" in
            ''|*[!0-9]*) R_BREW_OUTDATED=0 ;;
        esac
        if [ "$R_BREW_OUTDATED" -gt 20 ] 2>/dev/null; then
            WARNINGS=$((WARNINGS + 1))
        fi
    fi

    # macOS has no /var/run/reboot-required. We approximate reboot need
    # from "restart required" marker in softwareupdate output.
    if command -v softwareupdate >/dev/null 2>&1 && echo "${su_output:-}" | grep -qi 'restart'; then
        R_REBOOT="yes"
        R_REBOOT_REQUIRED="true"
        WARNINGS=$((WARNINGS + 1))
    else
        R_REBOOT="no"
        R_REBOOT_REQUIRED="false"
    fi

    # Uptime days from kern.boottime. Format:
    #   { sec = 1745434567, usec = 123 } Fri Apr 18 12:36:07 2025
    # Anchor the regex on the leading '{' so the greedy '.*' can't pull
    # 'usec' into the capture — previously returned the usec value and
    # computed uptimes in the tens of thousands of days.
    if command -v sysctl >/dev/null 2>&1; then
        boot_sec=$(sysctl -n kern.boottime 2>/dev/null | sed -E 's/^\{ sec = ([0-9]+),.*/\1/')
        now_sec=$(date +%s 2>/dev/null)
        if [ -n "$boot_sec" ] && [ -n "$now_sec" ] && [ "$boot_sec" -gt 0 ] 2>/dev/null; then
            R_UPTIME_DAYS=$(( (now_sec - boot_sec) / 86400 ))
        fi
    fi
fi

# ─── Check 5: crane-mcp status ────────────────────────────────────────

if command -v crane >/dev/null 2>&1 && [ -f "$REPO_DIR/packages/crane-mcp/dist/index.js" ]; then
    R_CRANE="ok"
else
    R_CRANE="fail"
    FAILURES=$((FAILURES + 1))
fi

# ─── Check 6: Infisical CLI ─────────────────────────────────────────

if command -v infisical >/dev/null 2>&1; then
    R_INFISICAL="ok"
else
    R_INFISICAL="fail"
    FAILURES=$((FAILURES + 1))
fi

# ─── Check 7: Git sync ────────────────────────────────────────────────

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

if [ "$JSON" = true ]; then
    # Hand-crafted JSON to avoid requiring jq on fleet machines.
    # Keep keys stable — consumed by the Hermes-on-mini orchestrator.
    # String fields are always quoted; numeric/bool emitted bare.
    printf '{"os":"%s","preflight":"%s","disk":"%s","os_updates":%s,"os_security":%s,"brew_outdated":%s,"reboot":"%s","reboot_required":%s,"uptime_days":%s,"xcode_clt_outdated":%s,"crane":"%s","infisical":"%s","behind":"%s","dns":"%s","failures":%s,"warnings":%s}\n' \
        "$OS" \
        "$R_PREFLIGHT" \
        "$R_DISK" \
        "$R_OS_UPDATES" \
        "$R_OS_SECURITY" \
        "$R_BREW_OUTDATED" \
        "$R_REBOOT" \
        "$R_REBOOT_REQUIRED" \
        "$R_UPTIME_DAYS" \
        "$R_XCODE_CLT_OUTDATED" \
        "$R_CRANE" \
        "$R_INFISICAL" \
        "$R_BEHIND" \
        "$R_DNS" \
        "$FAILURES" \
        "$WARNINGS"
else
    # Legacy key=value line — byte-identical to the pre-#657 format.
    # Do not add keys here; use --json for new fields.
    echo "preflight=$R_PREFLIGHT disk=$R_DISK updates=$R_UPDATES reboot=$R_REBOOT crane=$R_CRANE infisical=$R_INFISICAL behind=$R_BEHIND dns=$R_DNS"
fi

# ─── Exit code ────────────────────────────────────────────────────────

if [ "$FAILURES" -gt 0 ]; then
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    exit 2
else
    exit 0
fi
