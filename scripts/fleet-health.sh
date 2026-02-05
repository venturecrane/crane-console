#!/bin/bash
# Fleet Health Check - Validates all known dev machines
#
# Usage: bash scripts/fleet-health.sh
#
# Checks each machine can:
# - Be reached (SSH for remote, direct for local)
# - Run preflight-check.sh successfully
# - Access crane-context worker

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Known machines (add new machines here)
MACHINES=(
    "local"      # Current machine (mac23)
    "mbp27"      # MacBook Pro
    "mini"       # Ubuntu server (mac mini)
    "think"      # ThinkPad (Xubuntu)
)

echo "========================================"
echo "        Fleet Health Check"
echo "========================================"
echo ""
echo "Checking ${#MACHINES[@]} machines..."
echo ""

TOTAL=0
PASSED=0
FAILED=0

for machine in "${MACHINES[@]}"; do
    ((TOTAL++))
    echo -n "[$machine] "

    if [[ "$machine" == "local" ]]; then
        # Local machine - run directly
        if bash scripts/preflight-check.sh > /tmp/fleet-check-local.txt 2>&1; then
            echo -e "${GREEN}PASS${NC}"
            ((PASSED++))
        else
            EXIT_CODE=$?
            if [[ $EXIT_CODE -eq 2 ]]; then
                echo -e "${YELLOW}WARN${NC} (warnings only)"
                ((PASSED++))
            else
                echo -e "${RED}FAIL${NC}"
                ((FAILED++))
                echo "    See /tmp/fleet-check-local.txt for details"
            fi
        fi
    else
        # Remote machine - run via SSH
        if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$machine" "echo ok" > /dev/null 2>&1; then
            echo -e "${RED}UNREACHABLE${NC}"
            ((FAILED++))
            continue
        fi

        # Extract and source env vars directly (bypasses non-interactive guards in bashrc)
        if ssh "$machine" "eval \$(grep -h '^export ' ~/.bashrc ~/.zshrc 2>/dev/null); cd ~/dev/crane-console 2>/dev/null && bash scripts/preflight-check.sh" > "/tmp/fleet-check-$machine.txt" 2>&1; then
            echo -e "${GREEN}PASS${NC}"
            ((PASSED++))
        else
            EXIT_CODE=$?
            if [[ $EXIT_CODE -eq 2 ]]; then
                echo -e "${YELLOW}WARN${NC} (warnings only)"
                ((PASSED++))
            else
                echo -e "${RED}FAIL${NC}"
                ((FAILED++))
                echo "    See /tmp/fleet-check-$machine.txt for details"
            fi
        fi
    fi
done

echo ""
echo "========================================"
echo "        Summary"
echo "========================================"
echo ""
echo "Total:  $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
if [[ $FAILED -gt 0 ]]; then
    echo -e "Failed: ${RED}$FAILED${NC}"
    echo ""
    echo "Run 'bash scripts/preflight-check.sh' on failed machines for details."
    echo "See docs/process/recovery-quickref.md for common fixes."
    exit 1
else
    echo "Failed: 0"
    echo ""
    echo -e "${GREEN}All machines healthy!${NC}"
    exit 0
fi
