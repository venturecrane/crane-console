#!/bin/bash
#
# Setup Full-Mesh SSH Access for Dev Fleet
#
# Establishes bidirectional SSH between all 4 dev machines.
# Manages ~/.ssh/config.d/crane-mesh on each machine (never overwrites ~/.ssh/config).
# Safe to re-run -- idempotent key distribution and config deployment.
#
# Usage: ./scripts/setup-ssh-mesh.sh
#
# Environment Variables:
#   DRY_RUN=true          Preview actions without writing
#   SKIP=alias[,alias]    Skip unreachable machines (e.g. SKIP=smdThink)
#   SMDTHINK_IP=<ip>      Override smdThink Tailscale IP discovery
#

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DRY_RUN="${DRY_RUN:-false}"

# ─── Machine Registry ───────────────────────────────────────────────
# Format: alias|tailscale_ip|user|type
#   type: local = this machine, remote = SSH target
#   DISCOVER = resolved at runtime (smdThink)
MACHINES=(
    "mac|100.115.75.103|scottdurgan|local"
    "ubuntu|100.105.134.85|smdurgan|remote"
    "smdmbp27|100.73.218.64|scottdurgan|remote"
    "smdThink|DISCOVER|scottdurgan|remote"
)

# ubuntu also reachable on LAN
UBUNTU_LOCAL_IP="10.0.4.36"

# ─── Parse machine registry ─────────────────────────────────────────
declare -A MACHINE_IP MACHINE_USER MACHINE_TYPE
declare -a MACHINE_ALIASES=()

for entry in "${MACHINES[@]}"; do
    IFS='|' read -r alias ip user type <<< "$entry"
    MACHINE_ALIASES+=("$alias")
    MACHINE_IP["$alias"]="$ip"
    MACHINE_USER["$alias"]="$user"
    MACHINE_TYPE["$alias"]="$type"
done

# ─── Parse SKIP list ────────────────────────────────────────────────
declare -A SKIP_SET
if [ -n "$SKIP" ]; then
    IFS=',' read -ra SKIP_ARRAY <<< "$SKIP"
    for s in "${SKIP_ARRAY[@]}"; do
        SKIP_SET["$s"]=1
    done
fi

# ─── Tracking ───────────────────────────────────────────────────────
declare -A REACHABLE   # alias -> 1 if reachable
declare -A PUBKEYS     # alias -> public key content
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ─── Helpers ─────────────────────────────────────────────────────────

log_info()  { echo -e "${BLUE}$*${NC}"; }
log_ok()    { echo -e "${GREEN}$*${NC}"; }
log_warn()  { echo -e "${YELLOW}$*${NC}"; }
log_err()   { echo -e "${RED}$*${NC}"; }

ssh_cmd() {
    local host="$1"; shift
    ssh -o ConnectTimeout=5 -o BatchMode=yes "$host" "$@"
}

banner() {
    echo ""
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}==========================================${NC}"
    echo ""
}

section() {
    echo ""
    echo -e "${BLUE}--- $1 ---${NC}"
    echo ""
}

# ─── Header ──────────────────────────────────────────────────────────

banner "SSH Mesh Setup"

if [ "$DRY_RUN" = "true" ]; then
    log_warn "DRY RUN MODE - No changes will be made"
    echo ""
fi

if [ -n "$SKIP" ]; then
    log_warn "Skipping machines: $SKIP"
    echo ""
fi

# ═════════════════════════════════════════════════════════════════════
# Phase 1: Preflight
# ═════════════════════════════════════════════════════════════════════

section "Phase 1: Preflight"

# 1a. Verify running on machine23
HOSTNAME=$(hostname)
if [[ "$HOSTNAME" != *"Machine23"* && "$HOSTNAME" != *"machine23"* ]]; then
    log_err "This script must be run from machine23 (current: $HOSTNAME)"
    exit 1
fi
log_ok "Running on machine23 ($HOSTNAME)"

# 1b. Verify local SSH key exists
if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
    log_err "Missing local SSH key: ~/.ssh/id_ed25519"
    echo "  Generate one: ssh-keygen -t ed25519 -C \"$(whoami)@$(hostname)\""
    exit 1
fi
log_ok "Local SSH key exists"

# 1c. Check macOS Remote Login (ssh to localhost)
echo -n "  Checking macOS Remote Login... "
if ssh -o ConnectTimeout=3 -o BatchMode=yes localhost whoami &>/dev/null; then
    log_ok "OK"
else
    log_warn "FAILED"
    echo "  macOS Remote Login is not enabled."
    echo "  Enable: System Settings > General > Sharing > Remote Login > ON"
    echo "  Then verify: ssh localhost whoami"
    echo ""
    echo "  Continuing without localhost -- mac will not be reachable from other machines."
    echo ""
fi

# 1d. Discover smdThink IP
echo -n "  Discovering smdThink IP... "
SMDTHINK_RESOLVED=""
if [ -n "$SMDTHINK_IP" ]; then
    SMDTHINK_RESOLVED="$SMDTHINK_IP"
    log_ok "$SMDTHINK_RESOLVED (from SMDTHINK_IP env var)"
elif [ -z "${SKIP_SET[smdThink]+x}" ]; then
    # Try SSH to discover
    SMDTHINK_RESOLVED=$(ssh -o ConnectTimeout=5 -o BatchMode=yes smdThink 'tailscale ip -4' 2>/dev/null || true)
    if [ -n "$SMDTHINK_RESOLVED" ]; then
        log_ok "$SMDTHINK_RESOLVED (discovered via SSH)"
    else
        SMDTHINK_RESOLVED="smdthink"
        log_warn "Discovery failed, falling back to MagicDNS hostname: smdthink"
    fi
else
    echo "SKIPPED"
fi

if [ -n "$SMDTHINK_RESOLVED" ]; then
    MACHINE_IP["smdThink"]="$SMDTHINK_RESOLVED"
fi

# 1e. Test SSH to each remote machine
section "Testing SSH connectivity"
for alias in "${MACHINE_ALIASES[@]}"; do
    if [ "${MACHINE_TYPE[$alias]}" = "local" ]; then
        REACHABLE["$alias"]=1
        continue
    fi

    if [ -n "${SKIP_SET[$alias]+x}" ]; then
        log_warn "  $alias: SKIPPED (user request)"
        ((SKIP_COUNT++))
        continue
    fi

    ip="${MACHINE_IP[$alias]}"
    user="${MACHINE_USER[$alias]}"

    echo -n "  $alias ($user@$ip)... "
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "${user}@${ip}" whoami &>/dev/null; then
        log_ok "OK"
        REACHABLE["$alias"]=1
    else
        log_warn "UNREACHABLE (excluded from remaining phases)"
        ((SKIP_COUNT++))
    fi
done

REACHABLE_COUNT=0
for alias in "${MACHINE_ALIASES[@]}"; do
    [ -n "${REACHABLE[$alias]+x}" ] && ((REACHABLE_COUNT++))
done
echo ""
log_info "Reachable machines: $REACHABLE_COUNT / ${#MACHINE_ALIASES[@]}"

if [ "$REACHABLE_COUNT" -lt 2 ]; then
    log_err "Need at least 2 reachable machines to form a mesh"
    exit 1
fi

# ═════════════════════════════════════════════════════════════════════
# Phase 2: Collect Public Keys
# ═════════════════════════════════════════════════════════════════════

section "Phase 2: Collect Public Keys"

for alias in "${MACHINE_ALIASES[@]}"; do
    [ -z "${REACHABLE[$alias]+x}" ] && continue

    ip="${MACHINE_IP[$alias]}"
    user="${MACHINE_USER[$alias]}"

    echo -n "  $alias: "

    if [ "${MACHINE_TYPE[$alias]}" = "local" ]; then
        # Local machine
        PUBKEYS["$alias"]=$(cat "$HOME/.ssh/id_ed25519.pub")
        log_ok "collected (local)"
    else
        # Remote: ensure key exists, then collect
        ssh_cmd "${user}@${ip}" \
            'test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)" -f ~/.ssh/id_ed25519 -N ""' \
            &>/dev/null || true

        pubkey=$(ssh_cmd "${user}@${ip}" 'cat ~/.ssh/id_ed25519.pub' 2>/dev/null)
        if [ -n "$pubkey" ]; then
            PUBKEYS["$alias"]="$pubkey"
            log_ok "collected"
        else
            log_err "FAILED to collect key"
            unset REACHABLE["$alias"]
        fi
    fi
done

echo ""
log_info "Keys collected: ${#PUBKEYS[@]}"

# ═════════════════════════════════════════════════════════════════════
# Phase 3: Distribute authorized_keys
# ═════════════════════════════════════════════════════════════════════

section "Phase 3: Distribute authorized_keys"

for target in "${MACHINE_ALIASES[@]}"; do
    [ -z "${REACHABLE[$target]+x}" ] && continue

    echo "  $target:"

    for source in "${MACHINE_ALIASES[@]}"; do
        [ -z "${REACHABLE[$source]+x}" ] && continue
        [ "$source" = "$target" ] && continue
        [ -z "${PUBKEYS[$source]+x}" ] && continue

        pubkey="${PUBKEYS[$source]}"
        # Extract the key portion (type + base64) for fingerprint matching
        key_fingerprint=$(echo "$pubkey" | awk '{print $2}')

        echo -n "    + $source key... "

        if [ "$DRY_RUN" = "true" ]; then
            log_warn "[DRY RUN] would add to authorized_keys"
            continue
        fi

        if [ "${MACHINE_TYPE[$target]}" = "local" ]; then
            # Local
            mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
            if grep -q "$key_fingerprint" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
                echo "already present"
            else
                echo "$pubkey" >> "$HOME/.ssh/authorized_keys"
                chmod 600 "$HOME/.ssh/authorized_keys"
                log_ok "added"
            fi
        else
            # Remote
            ip="${MACHINE_IP[$target]}"
            user="${MACHINE_USER[$target]}"
            ssh_cmd "${user}@${ip}" bash -s <<AUTHEOF
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
if grep -q "$key_fingerprint" ~/.ssh/authorized_keys 2>/dev/null; then
    echo "already present"
else
    echo "$pubkey" >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    echo "added"
fi
AUTHEOF
        fi
    done
done

# ═════════════════════════════════════════════════════════════════════
# Phase 4: Deploy SSH Config Fragment
# ═════════════════════════════════════════════════════════════════════

section "Phase 4: Deploy SSH Config Fragments"

generate_config_fragment() {
    local self_alias="$1"
    local is_mac="$2"  # "true" if this is machine23
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    echo "# Managed by scripts/setup-ssh-mesh.sh -- do not edit manually"
    echo "# Last updated: $timestamp"
    echo ""

    for peer in "${MACHINE_ALIASES[@]}"; do
        [ "$peer" = "$self_alias" ] && continue
        [ -z "${REACHABLE[$peer]+x}" ] && continue

        local peer_ip="${MACHINE_IP[$peer]}"
        local peer_user="${MACHINE_USER[$peer]}"

        cat <<HOSTBLOCK

Host $peer
    HostName $peer_ip
    User $peer_user
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking accept-new
    ServerAliveInterval 60
    ServerAliveCountMax 3
HOSTBLOCK
    done

    # machine23 also gets ubuntu-local alias
    if [ "$is_mac" = "true" ]; then
        cat <<HOSTBLOCK

Host ubuntu-local
    HostName $UBUNTU_LOCAL_IP
    User smdurgan
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
HOSTBLOCK
    fi
}

deploy_config_to_machine() {
    local alias="$1"
    local is_mac="$2"
    local fragment
    fragment=$(generate_config_fragment "$alias" "$is_mac")

    echo "  $alias:"

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "    [DRY RUN] Would write ~/.ssh/config.d/crane-mesh:"
        echo "$fragment" | sed 's/^/    | /'
        echo ""
        return
    fi

    if [ "${MACHINE_TYPE[$alias]}" = "local" ]; then
        # Local
        mkdir -p "$HOME/.ssh/config.d"
        echo "$fragment" > "$HOME/.ssh/config.d/crane-mesh"
        chmod 600 "$HOME/.ssh/config.d/crane-mesh"

        # Ensure Include directive in main config
        if [ ! -f "$HOME/.ssh/config" ]; then
            echo "Include config.d/*" > "$HOME/.ssh/config"
            chmod 600 "$HOME/.ssh/config"
            log_ok "    Created ~/.ssh/config with Include directive"
        elif ! grep -q "Include config.d/\*" "$HOME/.ssh/config"; then
            # Prepend Include to top of file
            local tmp
            tmp=$(mktemp)
            echo "Include config.d/*" > "$tmp"
            echo "" >> "$tmp"
            cat "$HOME/.ssh/config" >> "$tmp"
            mv "$tmp" "$HOME/.ssh/config"
            chmod 600 "$HOME/.ssh/config"
            log_ok "    Added Include directive to ~/.ssh/config"
        else
            echo "    Include directive already present"
        fi

        log_ok "    Wrote ~/.ssh/config.d/crane-mesh"
    else
        # Remote
        local ip="${MACHINE_IP[$alias]}"
        local user="${MACHINE_USER[$alias]}"

        ssh_cmd "${user}@${ip}" bash -s <<CONFIGEOF
mkdir -p ~/.ssh/config.d

cat > ~/.ssh/config.d/crane-mesh <<'FRAGMENT'
$fragment
FRAGMENT
chmod 600 ~/.ssh/config.d/crane-mesh

# Ensure Include directive
if [ ! -f ~/.ssh/config ]; then
    echo "Include config.d/*" > ~/.ssh/config
    chmod 600 ~/.ssh/config
    echo "    Created ~/.ssh/config with Include directive"
elif ! grep -q "Include config.d/\*" ~/.ssh/config; then
    tmp=\$(mktemp)
    echo "Include config.d/*" > "\$tmp"
    echo "" >> "\$tmp"
    cat ~/.ssh/config >> "\$tmp"
    mv "\$tmp" ~/.ssh/config
    chmod 600 ~/.ssh/config
    echo "    Added Include directive to ~/.ssh/config"
else
    echo "    Include directive already present"
fi

echo "    Wrote ~/.ssh/config.d/crane-mesh"
CONFIGEOF
    fi
}

for alias in "${MACHINE_ALIASES[@]}"; do
    [ -z "${REACHABLE[$alias]+x}" ] && continue

    is_mac="false"
    [ "$alias" = "mac" ] && is_mac="true"

    deploy_config_to_machine "$alias" "$is_mac"
done

# ═════════════════════════════════════════════════════════════════════
# Phase 5: Verify Mesh
# ═════════════════════════════════════════════════════════════════════

if [ "$DRY_RUN" = "true" ]; then
    section "Phase 5: Verify Mesh (SKIPPED - dry run)"
else
    section "Phase 5: Verify Mesh"

    # Build list of reachable aliases for the matrix
    declare -a REACHABLE_LIST=()
    for alias in "${MACHINE_ALIASES[@]}"; do
        [ -n "${REACHABLE[$alias]+x}" ] && REACHABLE_LIST+=("$alias")
    done

    # Results matrix: RESULT[source|target] = OK|FAIL
    declare -A RESULT

    for source in "${MACHINE_ALIASES[@]}"; do
        for target in "${MACHINE_ALIASES[@]}"; do
            [ "$source" = "$target" ] && continue

            # Both must be reachable
            if [ -z "${REACHABLE[$source]+x}" ] || [ -z "${REACHABLE[$target]+x}" ]; then
                RESULT["${source}|${target}"]="SKIP"
                continue
            fi

            target_ip="${MACHINE_IP[$target]}"
            target_user="${MACHINE_USER[$target]}"

            echo -n "  $source -> $target... "

            if [ "${MACHINE_TYPE[$source]}" = "local" ]; then
                # Direct from machine23
                if ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
                    "${target_user}@${target_ip}" whoami &>/dev/null; then
                    RESULT["${source}|${target}"]="OK"
                    log_ok "OK"
                    ((SUCCESS_COUNT++))
                else
                    RESULT["${source}|${target}"]="FAIL"
                    log_err "FAIL"
                    ((FAIL_COUNT++))
                fi
            else
                # Nested: SSH through source to target
                source_ip="${MACHINE_IP[$source]}"
                source_user="${MACHINE_USER[$source]}"

                if ssh -o ConnectTimeout=5 -o BatchMode=yes "${source_user}@${source_ip}" \
                    "ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${target_user}@${target_ip} whoami" \
                    &>/dev/null; then
                    RESULT["${source}|${target}"]="OK"
                    log_ok "OK"
                    ((SUCCESS_COUNT++))
                else
                    RESULT["${source}|${target}"]="FAIL"
                    log_err "FAIL"
                    ((FAIL_COUNT++))
                fi
            fi
        done
    done

    # Print matrix
    echo ""
    echo "SSH Mesh Verification"
    echo "=========================================="

    # Header row
    printf "%-12s" "From\\To"
    for target in "${MACHINE_ALIASES[@]}"; do
        printf "| %-9s" "$target"
    done
    echo ""

    # Separator
    printf "%-12s" "------------"
    for _ in "${MACHINE_ALIASES[@]}"; do
        printf "|%-10s" "----------"
    done
    echo ""

    # Data rows
    for source in "${MACHINE_ALIASES[@]}"; do
        printf "%-12s" "$source"
        for target in "${MACHINE_ALIASES[@]}"; do
            if [ "$source" = "$target" ]; then
                printf "| %-9s" "--"
            else
                r="${RESULT[${source}|${target}]:-SKIP}"
                case "$r" in
                    OK)   printf "| ${GREEN}%-9s${NC}" "OK" ;;
                    FAIL) printf "| ${RED}%-9s${NC}" "FAIL" ;;
                    SKIP) printf "| ${YELLOW}%-9s${NC}" "SKIP" ;;
                esac
            fi
        done
        echo ""
    done
fi

# ═════════════════════════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════════════════════════

banner "Summary"

if [ "$DRY_RUN" = "true" ]; then
    log_warn "DRY RUN -- no changes were made"
    echo ""
    echo "Reachable machines: $REACHABLE_COUNT"
    echo "Skipped machines:   $SKIP_COUNT"
    echo ""
    echo "Run without DRY_RUN=true to apply changes."
else
    echo -e "${GREEN}Passed:${NC}  $SUCCESS_COUNT"
    echo -e "${RED}Failed:${NC}  $FAIL_COUNT"
    echo -e "${YELLOW}Skipped:${NC} $SKIP_COUNT"
    echo ""

    if [ "$FAIL_COUNT" -gt 0 ]; then
        log_err "Some connections failed. Check machine connectivity."
        exit 1
    else
        log_ok "Full mesh established for all reachable machines."
    fi
fi
