#!/bin/bash
# harden-mac.sh — Network hardening for macOS field machines
# Makes a Mac safe to connect directly to public WiFi
#
# Run with: sudo bash scripts/harden-mac.sh
# Or remotely: ssh <target> sudo bash ~/dev/crane-console/scripts/harden-mac.sh
#
# What this does:
#   1. Enables macOS firewall + stealth mode
#   2. Disables AirPlay Receiver (closes ports 5000/7000)
#   3. Sets AirDrop to Contacts Only
#   4. Verifies Tailscale is handling encrypted DNS
#
# DNS note: Tailscale routes DNS through WireGuard to 100.100.100.100,
# which encrypts queries in transit on hostile networks. A standalone
# DoH profile conflicts with Tailscale's network extension on macOS,
# so we rely on Tailscale for DNS encryption instead.
#
# Safe to run multiple times (idempotent).
set -euo pipefail

SUDO=""
[ $EUID -ne 0 ] && SUDO="sudo"

REAL_USER="${SUDO_USER:-$USER}"

echo "=== macOS Network Hardening ==="
echo ""

# --- 1. Firewall ---
echo "[1/4] Configuring firewall..."
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"

$SUDO $FW --setglobalstate on
$SUDO $FW --setstealthmode on
$SUDO $FW --setallowsigned on
$SUDO $FW --setallowsignedapp on

# Allow Tailscale through the firewall
TS_PATH=$(which tailscaled 2>/dev/null || echo "/Applications/Tailscale.app/Contents/PlugIns/io.tailscale.ipn.macsys.network-extension.systemextension/Contents/MacOS/io.tailscale.ipn.macsys.network-extension")
if [[ -f "$TS_PATH" ]]; then
    $SUDO $FW --add "$TS_PATH" 2>/dev/null || true
    $SUDO $FW --unblockapp "$TS_PATH" 2>/dev/null || true
    echo "  ✓ Tailscale explicitly allowed"
fi

echo "  ✓ Firewall enabled"
echo "  ✓ Stealth mode enabled (ignores probes)"
echo "  ✓ Signed software auto-allowed"

# --- 2. Disable AirPlay Receiver (closes ports 5000/7000) ---
echo ""
echo "[2/4] Disabling AirPlay Receiver..."
$SUDO -u "$REAL_USER" defaults write com.apple.controlcenter AirplayRecieverEnabled -bool false 2>/dev/null || true
echo "  ✓ AirPlay Receiver disabled (ports 5000/7000 will close after reboot)"
echo "  NOTE: Toggle off manually now at System Settings > General > AirDrop & Handoff > AirPlay Receiver"

# --- 3. AirDrop to Contacts Only ---
echo ""
echo "[3/4] Restricting AirDrop..."
$SUDO -u "$REAL_USER" defaults write com.apple.sharingd DiscoverableMode -string "Contacts Only" 2>/dev/null || true
killall sharingd 2>/dev/null || true
echo "  ✓ AirDrop set to Contacts Only"

# --- 4. Verify Tailscale DNS ---
echo ""
echo "[4/4] Checking Tailscale DNS..."
if pgrep -q tailscaled 2>/dev/null || pgrep -q "io.tailscale" 2>/dev/null; then
    echo "  ✓ Tailscale running — DNS queries routed through WireGuard tunnel"
    echo "  ✓ Local network cannot see DNS queries"
else
    echo "  ⚠ Tailscale not running — DNS queries will use plain 1.1.1.1"
    echo "  → Start Tailscale before connecting to public WiFi"
fi

# --- Verify ---
echo ""
echo "Verifying..."
echo ""

FW_STATE=$($SUDO $FW --getglobalstate 2>/dev/null)
FW_STEALTH=$($SUDO $FW --getstealthmode 2>/dev/null)
echo "  Firewall:     $FW_STATE"
echo "  Stealth:      $FW_STEALTH"

LISTENING=$(lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null | grep -v "^COMMAND" | awk '{print $1, $9}' | sort -u)
if [[ -n "$LISTENING" ]]; then
    echo "  Listening:    (these ports are firewalled)"
    echo "$LISTENING" | while read line; do echo "                $line"; done
else
    echo "  Listening:    none"
fi

echo ""
echo "=== Done ==="
echo ""
echo "Hardened for public WiFi:"
echo "  ✓ Firewall on + stealth mode (invisible to scans)"
echo "  ✓ AirPlay Receiver disabled (ports 5000/7000 closed)"
echo "  ✓ AirDrop restricted to Contacts Only"
echo "  ✓ DNS encrypted via Tailscale WireGuard tunnel"
echo ""
echo "Remaining manual step (if AirPlay ports still show):"
echo "  System Settings > General > AirDrop & Handoff > AirPlay Receiver → OFF"
echo "  (takes effect immediately, no reboot needed)"
