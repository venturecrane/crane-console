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
#   SKIP=alias[,alias]    Skip unreachable machines (e.g. SKIP=think)
#
# Compatible with bash 3.2+ (macOS default).
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
#   All IPs are Tailscale IPs (stable)
MACHINES=(
    "mac23|100.115.75.103|scottdurgan|local"
    "mini|100.105.134.85|smdurgan|remote"
    "mbp27|100.73.218.64|scottdurgan|remote"
    "think|100.69.57.3|scottdurgan|remote"
    "mba|100.64.15.100|scottdurgan|remote"
)

# mini also reachable on LAN
MINI_LOCAL_IP="10.0.4.36"

# ─── Parse machine registry (bash 3.2 compatible -- indexed arrays) ──
M_ALIAS=()
M_IP=()
M_USER=()
M_TYPE=()

for entry in "${MACHINES[@]}"; do
    IFS='|' read -r _alias _ip _user _type <<< "$entry"
    M_ALIAS+=("$_alias")
    M_IP+=("$_ip")
    M_USER+=("$_user")
    M_TYPE+=("$_type")
done

MACHINE_COUNT=${#M_ALIAS[@]}

# ─── Index lookup helper ────────────────────────────────────────────
get_idx() {
    local needle="$1"
    local i
    for (( i=0; i<MACHINE_COUNT; i++ )); do
        if [ "${M_ALIAS[$i]}" = "$needle" ]; then
            echo "$i"
            return 0
        fi
    done
    return 1
}

# ─── Set helpers (space-delimited strings) ───────────────────────────
SKIP_LIST=" "
if [ -n "$SKIP" ]; then
    IFS=',' read -ra _skip_arr <<< "$SKIP"
    for s in "${_skip_arr[@]}"; do
        SKIP_LIST="${SKIP_LIST}${s} "
    done
fi

is_skipped() { [[ "$SKIP_LIST" == *" $1 "* ]]; }

REACHABLE_LIST=" "
mark_reachable()  { REACHABLE_LIST="${REACHABLE_LIST}${1} "; }
is_reachable()    { [[ "$REACHABLE_LIST" == *" $1 "* ]]; }
unmark_reachable() { REACHABLE_LIST="${REACHABLE_LIST/ $1 / }"; }

# ─── Pubkey storage (parallel arrays) ───────────────────────────────
PK_ALIAS=()
PK_VALUE=()

set_pubkey() {
    PK_ALIAS+=("$1")
    PK_VALUE+=("$2")
}

get_pubkey() {
    local needle="$1" i
    for (( i=0; i<${#PK_ALIAS[@]}; i++ )); do
        if [ "${PK_ALIAS[$i]}" = "$needle" ]; then
            echo "${PK_VALUE[$i]}"
            return 0
        fi
    done
    return 1
}

has_pubkey() {
    local needle="$1" i
    for (( i=0; i<${#PK_ALIAS[@]}; i++ )); do
        [ "${PK_ALIAS[$i]}" = "$needle" ] && return 0
    done
    return 1
}

# ─── Result storage (parallel arrays) ───────────────────────────────
RES_KEY=()
RES_VALUE=()

set_result() {
    RES_KEY+=("$1")
    RES_VALUE+=("$2")
}

get_result() {
    local needle="$1" i
    for (( i=0; i<${#RES_KEY[@]}; i++ )); do
        if [ "${RES_KEY[$i]}" = "$needle" ]; then
            echo "${RES_VALUE[$i]}"
            return 0
        fi
    done
    echo "SKIP"
}

# ─── Tracking ───────────────────────────────────────────────────────
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

# 1a. Verify running on mac23
THIS_HOSTNAME=$(hostname)
THIS_HOSTNAME_LOWER=$(echo "$THIS_HOSTNAME" | tr '[:upper:]' '[:lower:]')
if [[ "$THIS_HOSTNAME_LOWER" != *"mac23"* && "$THIS_HOSTNAME_LOWER" != *"machine23"* ]]; then
    log_err "This script must be run from mac23 (current: $THIS_HOSTNAME)"
    exit 1
fi
log_ok "Running on mac23 ($THIS_HOSTNAME)"

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

# 1d. Test SSH to each remote machine
section "Testing SSH connectivity"
for (( i=0; i<MACHINE_COUNT; i++ )); do
    a="${M_ALIAS[$i]}"

    if [ "${M_TYPE[$i]}" = "local" ]; then
        mark_reachable "$a"
        continue
    fi

    if is_skipped "$a"; then
        log_warn "  $a: SKIPPED (user request)"
        ((SKIP_COUNT++)) || true
        continue
    fi

    ip="${M_IP[$i]}"
    user="${M_USER[$i]}"

    echo -n "  $a ($user@$ip)... "
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "${user}@${ip}" whoami &>/dev/null; then
        log_ok "OK"
        mark_reachable "$a"
    else
        log_warn "UNREACHABLE (excluded from remaining phases)"
        ((SKIP_COUNT++)) || true
    fi
done

REACHABLE_COUNT=0
for (( i=0; i<MACHINE_COUNT; i++ )); do
    is_reachable "${M_ALIAS[$i]}" && ((REACHABLE_COUNT++)) || true
done
echo ""
log_info "Reachable machines: $REACHABLE_COUNT / $MACHINE_COUNT"

if [ "$REACHABLE_COUNT" -lt 2 ]; then
    log_err "Need at least 2 reachable machines to form a mesh"
    exit 1
fi

# ═════════════════════════════════════════════════════════════════════
# Phase 2: Collect Public Keys
# ═════════════════════════════════════════════════════════════════════

section "Phase 2: Collect Public Keys"

for (( i=0; i<MACHINE_COUNT; i++ )); do
    a="${M_ALIAS[$i]}"
    is_reachable "$a" || continue

    ip="${M_IP[$i]}"
    user="${M_USER[$i]}"

    echo -n "  $a: "

    if [ "${M_TYPE[$i]}" = "local" ]; then
        set_pubkey "$a" "$(cat "$HOME/.ssh/id_ed25519.pub")"
        log_ok "collected (local)"
    else
        # Remote: ensure key exists, then collect
        ssh_cmd "${user}@${ip}" \
            'test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)" -f ~/.ssh/id_ed25519 -N ""' \
            &>/dev/null || true

        pubkey=$(ssh_cmd "${user}@${ip}" 'cat ~/.ssh/id_ed25519.pub' 2>/dev/null || true)
        if [ -n "$pubkey" ]; then
            set_pubkey "$a" "$pubkey"
            log_ok "collected"
        else
            log_err "FAILED to collect key"
            unmark_reachable "$a"
        fi
    fi
done

echo ""
log_info "Keys collected: ${#PK_ALIAS[@]}"

# ═════════════════════════════════════════════════════════════════════
# Phase 3: Distribute authorized_keys
# ═════════════════════════════════════════════════════════════════════

section "Phase 3: Distribute authorized_keys"

for (( ti=0; ti<MACHINE_COUNT; ti++ )); do
    target="${M_ALIAS[$ti]}"
    is_reachable "$target" || continue

    echo "  $target:"

    for (( si=0; si<MACHINE_COUNT; si++ )); do
        source="${M_ALIAS[$si]}"
        is_reachable "$source" || continue
        [ "$source" = "$target" ] && continue
        has_pubkey "$source" || continue

        pubkey=$(get_pubkey "$source")
        # Extract the key portion (type + base64) for fingerprint matching
        key_fingerprint=$(echo "$pubkey" | awk '{print $2}')

        echo -n "    + $source key... "

        if [ "$DRY_RUN" = "true" ]; then
            log_warn "[DRY RUN] would add to authorized_keys"
            continue
        fi

        if [ "${M_TYPE[$ti]}" = "local" ]; then
            mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
            if grep -q "$key_fingerprint" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
                echo "already present"
            else
                echo "$pubkey" >> "$HOME/.ssh/authorized_keys"
                chmod 600 "$HOME/.ssh/authorized_keys"
                log_ok "added"
            fi
        else
            ip="${M_IP[$ti]}"
            user="${M_USER[$ti]}"
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
    local is_mac="$2"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    echo "# Managed by scripts/setup-ssh-mesh.sh -- do not edit manually"
    echo "# Last updated: $timestamp"
    echo ""

    local pi
    for (( pi=0; pi<MACHINE_COUNT; pi++ )); do
        local peer="${M_ALIAS[$pi]}"
        [ "$peer" = "$self_alias" ] && continue
        is_reachable "$peer" || continue

        local peer_ip="${M_IP[$pi]}"
        local peer_user="${M_USER[$pi]}"

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

    # mac23 also gets mini-local alias
    if [ "$is_mac" = "true" ]; then
        cat <<HOSTBLOCK

Host mini-local
    HostName $MINI_LOCAL_IP
    User smdurgan
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
HOSTBLOCK
    fi
}

deploy_config_to_machine() {
    local a="$1"
    local is_mac="$2"
    local idx
    idx=$(get_idx "$a")
    local fragment
    fragment=$(generate_config_fragment "$a" "$is_mac")

    echo "  $a:"

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "    [DRY RUN] Would write ~/.ssh/config.d/crane-mesh:"
        echo "$fragment" | sed 's/^/    | /'
        echo ""
        return
    fi

    if [ "${M_TYPE[$idx]}" = "local" ]; then
        mkdir -p "$HOME/.ssh/config.d"
        echo "$fragment" > "$HOME/.ssh/config.d/crane-mesh"
        chmod 600 "$HOME/.ssh/config.d/crane-mesh"

        # Ensure Include directive in main config
        if [ ! -f "$HOME/.ssh/config" ]; then
            echo "Include config.d/*" > "$HOME/.ssh/config"
            chmod 600 "$HOME/.ssh/config"
            log_ok "    Created ~/.ssh/config with Include directive"
        elif ! grep -q "Include config.d/\*" "$HOME/.ssh/config"; then
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
        local ip="${M_IP[$idx]}"
        local user="${M_USER[$idx]}"

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

for (( i=0; i<MACHINE_COUNT; i++ )); do
    a="${M_ALIAS[$i]}"
    is_reachable "$a" || continue

    is_mac="false"
    [ "$a" = "mac23" ] && is_mac="true"

    deploy_config_to_machine "$a" "$is_mac"
done

# ═════════════════════════════════════════════════════════════════════
# Phase 5: Verify Mesh
# ═════════════════════════════════════════════════════════════════════

if [ "$DRY_RUN" = "true" ]; then
    section "Phase 5: Verify Mesh (SKIPPED - dry run)"
else
    section "Phase 5: Verify Mesh"

    for (( si=0; si<MACHINE_COUNT; si++ )); do
        source="${M_ALIAS[$si]}"
        for (( ti=0; ti<MACHINE_COUNT; ti++ )); do
            target="${M_ALIAS[$ti]}"
            [ "$source" = "$target" ] && continue

            # Both must be reachable
            if ! is_reachable "$source" || ! is_reachable "$target"; then
                set_result "${source}|${target}" "SKIP"
                continue
            fi

            target_ip="${M_IP[$ti]}"
            target_user="${M_USER[$ti]}"

            echo -n "  $source -> $target... "

            if [ "${M_TYPE[$si]}" = "local" ]; then
                if ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
                    "${target_user}@${target_ip}" whoami &>/dev/null; then
                    set_result "${source}|${target}" "OK"
                    log_ok "OK"
                    ((SUCCESS_COUNT++)) || true
                else
                    set_result "${source}|${target}" "FAIL"
                    log_err "FAIL"
                    ((FAIL_COUNT++)) || true
                fi
            else
                source_ip="${M_IP[$si]}"
                source_user="${M_USER[$si]}"

                if ssh -o ConnectTimeout=5 -o BatchMode=yes "${source_user}@${source_ip}" \
                    "ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${target_user}@${target_ip} whoami" \
                    &>/dev/null; then
                    set_result "${source}|${target}" "OK"
                    log_ok "OK"
                    ((SUCCESS_COUNT++)) || true
                else
                    set_result "${source}|${target}" "FAIL"
                    log_err "FAIL"
                    ((FAIL_COUNT++)) || true
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
    for (( i=0; i<MACHINE_COUNT; i++ )); do
        printf "| %-9s" "${M_ALIAS[$i]}"
    done
    echo ""

    # Separator
    printf "%-12s" "------------"
    for (( i=0; i<MACHINE_COUNT; i++ )); do
        printf "|%-10s" "----------"
    done
    echo ""

    # Data rows
    for (( si=0; si<MACHINE_COUNT; si++ )); do
        source="${M_ALIAS[$si]}"
        printf "%-12s" "$source"
        for (( ti=0; ti<MACHINE_COUNT; ti++ )); do
            target="${M_ALIAS[$ti]}"
            if [ "$source" = "$target" ]; then
                printf "| %-9s" "--"
            else
                r=$(get_result "${source}|${target}")
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
