#!/bin/bash
#
# Seed Machine Registry
#
# One-time script to register existing dev machines from machine-inventory.md.
# Run from mac23 after deploying the machines migration.
#
# Usage:
#   CRANE_CONTEXT_KEY=<key> bash scripts/seed-machines.sh
#
# Reads SSH pubkeys from reachable machines. Safe to re-run (upsert).
#

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*"; }

API_URL="${CRANE_CONTEXT_API:-https://crane-context.automation-ab6.workers.dev}"

if [ -z "$CRANE_CONTEXT_KEY" ]; then
    log_err "CRANE_CONTEXT_KEY is required"
    echo "  Usage: CRANE_CONTEXT_KEY=<key> bash $0"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Seed Machine Registry${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Machine definitions from docs/infra/machine-inventory.md
# Format: hostname|tailscale_ip|user|os|arch|role
SEED_MACHINES=(
    "mac23|100.115.75.103|scottdurgan|darwin|arm64|dev"
    "mini|100.105.134.85|smdurgan|linux|x86_64|server"
    "mbp27|100.73.218.64|scottdurgan|linux|x86_64|dev"
    "think||scottdurgan|linux|x86_64|dev"
)

register_machine() {
    local hostname="$1"
    local ip="$2"
    local user="$3"
    local os="$4"
    local arch="$5"
    local role="$6"
    local pubkey="$7"

    echo -n "  Registering $hostname... "

    if [ -z "$ip" ]; then
        log_warn "SKIPPED (no Tailscale IP -- discover at runtime)"
        return
    fi

    local body="{
        \"hostname\": \"$hostname\",
        \"tailscale_ip\": \"$ip\",
        \"user\": \"$user\",
        \"os\": \"$os\",
        \"arch\": \"$arch\",
        \"role\": \"$role\""

    if [ -n "$pubkey" ]; then
        body="$body, \"pubkey\": \"$pubkey\""
    fi

    body="$body}"

    local response
    response=$(curl -sf "$API_URL/machines/register" \
        -H "Content-Type: application/json" \
        -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
        -d "$body" 2>/dev/null || true)

    if [ -n "$response" ]; then
        local created
        created=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('created', ''))" 2>/dev/null || echo "")
        if [ "$created" = "True" ] || [ "$created" = "true" ]; then
            log_ok "registered (new)"
        else
            log_ok "updated (existing)"
        fi
    else
        log_err "FAILED"
    fi
}

# Collect pubkeys from reachable machines
collect_pubkey() {
    local hostname="$1"
    local ip="$2"
    local user="$3"

    # Local machine
    if [ "$hostname" = "$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/\.local$//')" ]; then
        if [ -f "$HOME/.ssh/id_ed25519.pub" ]; then
            cat "$HOME/.ssh/id_ed25519.pub"
            return
        fi
    fi

    # Remote machine
    if [ -n "$ip" ]; then
        ssh -o ConnectTimeout=5 -o BatchMode=yes "${user}@${ip}" \
            'cat ~/.ssh/id_ed25519.pub 2>/dev/null' 2>/dev/null || true
    fi
}

for entry in "${SEED_MACHINES[@]}"; do
    IFS='|' read -r hostname ip user os arch role <<< "$entry"

    log_info "Processing $hostname..."

    # Try to collect pubkey
    pubkey=""
    if [ -n "$ip" ]; then
        pubkey=$(collect_pubkey "$hostname" "$ip" "$user")
        if [ -n "$pubkey" ]; then
            log_ok "  Collected pubkey"
        else
            log_warn "  Could not collect pubkey (machine unreachable?)"
        fi
    fi

    register_machine "$hostname" "$ip" "$user" "$os" "$arch" "$role" "$pubkey"
    echo ""
done

echo ""
log_info "Verifying registration..."
echo ""

# List all registered machines
MACHINES_RESPONSE=$(curl -sf "$API_URL/machines" \
    -H "X-Relay-Key: $CRANE_CONTEXT_KEY" 2>/dev/null || true)

if [ -n "$MACHINES_RESPONSE" ]; then
    echo "$MACHINES_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
machines = data.get('machines', [])
print(f'Registered machines: {len(machines)}')
print()
print(f'{\"Hostname\":<12} {\"IP\":<18} {\"User\":<14} {\"OS\":<8} {\"Arch\":<8} {\"Role\":<8} {\"Last Seen\":<20}')
print('-' * 90)
for m in machines:
    print(f'{m[\"hostname\"]:<12} {m[\"tailscale_ip\"]:<18} {m[\"user\"]:<14} {m[\"os\"]:<8} {m[\"arch\"]:<8} {m[\"role\"]:<8} {m[\"last_seen_at\"][:19]:<20}')
" 2>/dev/null
else
    log_err "Failed to list machines from API"
fi

echo ""
log_ok "Seed complete"
