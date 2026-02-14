#!/bin/bash
# optimize-macos.sh - macOS performance + security hardening for Crane fleet machines
# Run with: sudo bash scripts/optimize-macos.sh
set -euo pipefail

echo "=== macOS Performance + Security Hardening (sudo required) ==="

# ─── Performance Tuning ──────────────────────────────────────────────

# --- Step 1/11: Reduce visual effects ---
echo ""
echo "[1/11] Reducing visual effects..."
defaults write com.apple.universalaccess reduceTransparency -bool true
defaults write com.apple.universalaccess reduceMotion -bool true
echo "  ✓ Reduce Transparency enabled"
echo "  ✓ Reduce Motion enabled"

# --- Step 2/11: Increase kernel file descriptor limits ---
echo ""
echo "[2/11] Increasing kernel file descriptor limits..."

sysctl -w kern.maxfiles=524288
sysctl -w kern.maxfilesperproc=131072

# Persist across reboots
PLIST="/Library/LaunchDaemons/com.crane.sysctl.plist"
cat > "$PLIST" << 'PLISTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.crane.sysctl</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/sbin/sysctl</string>
        <string>kern.maxfiles=524288</string>
        <string>kern.maxfilesperproc=131072</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
PLISTEOF

launchctl load "$PLIST" 2>/dev/null || true
echo "  ✓ kern.maxfiles=524288"
echo "  ✓ kern.maxfilesperproc=131072"
echo "  ✓ LaunchDaemon installed at $PLIST"

# --- Step 3/11: Power management ---
echo ""
echo "[3/11] Configuring power management for battery..."
pmset -b powernap 0
pmset -b lowpowermode 1
echo "  ✓ Power Nap disabled on battery"
echo "  ✓ Low power mode enabled on battery"

# --- Step 4/11: Exclude dev directories from Spotlight ---
echo ""
echo "[4/11] Excluding dev directories from Spotlight..."
touch "$HOME/dev/.metadata_never_index"
touch "$HOME/Library/Caches/.metadata_never_index"
mdutil -i off "$HOME/dev" 2>/dev/null || true
echo "  ✓ ~/dev excluded from Spotlight"
echo "  ✓ ~/Library/Caches excluded from Spotlight"

# --- Step 5/11: Kill orphaned crane processes ---
echo ""
echo "[5/11] Cleaning up orphaned processes..."
CRANE_PID=$(pgrep -f "crane --version" 2>/dev/null || true)
if [ -n "$CRANE_PID" ]; then
    kill $CRANE_PID 2>/dev/null || true
    echo "  ✓ Killed orphaned crane process (PID: $CRANE_PID)"
else
    echo "  - No orphaned crane process found"
fi

# ─── Security Hardening ──────────────────────────────────────────────

# --- Step 6/11: Enable macOS Firewall + Stealth Mode ---
echo ""
echo "[6/11] Enabling macOS Firewall + Stealth Mode..."
/usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
/usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on
/usr/libexec/ApplicationFirewall/socketfilterfw --setallowsigned on
/usr/libexec/ApplicationFirewall/socketfilterfw --setallowsignedapp on
echo "  ✓ Firewall enabled"
echo "  ✓ Stealth mode enabled"
echo "  ✓ Signed apps allowed"

# --- Step 7/11: Disable AirPlay Receiver ---
echo ""
echo "[7/11] Disabling AirPlay Receiver (closes ports 5000/7000)..."
defaults write com.apple.controlcenter "NSStatusItem Visible AirplayReceiver" -bool false
defaults -currentHost write com.apple.airplay allowAirPlayReceiver -bool false
echo "  ✓ AirPlay Receiver disabled"

# --- Step 8/11: AirDrop → Contacts Only ---
echo ""
echo "[8/11] Restricting AirDrop to Contacts Only..."
defaults write com.apple.sharingd DiscoverableMode -string "Contacts Only"
killall sharingd 2>/dev/null || true
echo "  ✓ AirDrop set to Contacts Only"

# --- Step 9/11: Smart DNS (Tailscale-aware) ---
echo ""
echo "[9/11] Configuring DNS..."
if tailscale status &>/dev/null; then
    echo "  Tailscale active - DNS routed through encrypted tunnel (100.100.100.100)"
    echo "  Setting Cloudflare as system fallback for when Tailscale is disconnected"
fi
networksetup -setdnsservers Wi-Fi 1.1.1.1 1.0.0.1 2606:4700:4700::1111 2606:4700:4700::1001
echo "  ✓ Cloudflare DNS set as fallback (1.1.1.1 / 1.0.0.1 + IPv6)"

# --- Step 10/11: Safari privacy defaults ---
echo ""
echo "[10/11] Setting Safari privacy defaults..."
defaults write com.apple.Safari SendDoNotTrackHTTPHeader -bool true 2>/dev/null || true
defaults write com.apple.Safari com.apple.Safari.ContentPageGroupIdentifier.WebKit2StorageBlockingPolicy -int 1 2>/dev/null || true
defaults write com.apple.Safari WarnAboutFraudulentWebsites -bool true 2>/dev/null || true
defaults write com.apple.Safari UniversalSearchEnabled -bool false 2>/dev/null || true
defaults write com.apple.Safari SuppressSearchSuggestions -bool true 2>/dev/null || true
echo "  ✓ Do Not Track enabled"
echo "  ✓ Cross-site tracking limited"
echo "  ✓ Fraudulent website warning enabled"
echo "  ✓ Search suggestions suppressed"

# --- Step 11/11: Disable analytics sharing ---
echo ""
echo "[11/11] Disabling analytics sharing with Apple..."
defaults write "/Library/Application Support/CrashReporter/DiagnosticMessagesHistory" AutoSubmit -bool false
defaults write com.apple.SoftwareUpdate SendSystemInfoToApple -bool false
echo "  ✓ Diagnostic auto-submit disabled"
echo "  ✓ Software update telemetry disabled"

echo ""
echo "=== Done! ==="
echo ""
echo "Manual steps remaining:"
echo "  1. killall Dock && killall Finder"
echo "  2. Safari > Settings > Privacy: toggle \"Hide IP address from trackers\""
echo "  3. Safari > Settings > Privacy: toggle \"Require HTTPS\" (if available)"
echo "  4. System Settings > General > Sharing > Remote Login > ON"
echo ""
echo "Verify with:"
echo "  /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate"
echo "  /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode"
echo "  sysctl kern.maxfiles kern.maxfilesperproc"
echo "  networksetup -getdnsservers Wi-Fi"
echo "  pmset -g | grep -E '(powernap|lowpowermode)'"
echo "  defaults read com.apple.Safari SendDoNotTrackHTTPHeader"
