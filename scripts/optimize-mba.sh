#!/bin/bash
# optimize-mba.sh — MBA (M1 8GB) performance optimizations requiring sudo
# Run with: sudo bash scripts/optimize-mba.sh
set -euo pipefail

echo "=== MBA Performance Optimization (sudo required) ==="

# --- Step 1: Reduce visual effects (accessibility settings) ---
echo ""
echo "[1/5] Reducing visual effects..."
defaults write com.apple.universalaccess reduceTransparency -bool true
defaults write com.apple.universalaccess reduceMotion -bool true
echo "  ✓ Reduce Transparency enabled"
echo "  ✓ Reduce Motion enabled"

# --- Step 3: Increase kernel file descriptor limits ---
echo ""
echo "[2/5] Increasing kernel file descriptor limits..."

# Increase for current session
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

# --- Step 4: Set DNS to Cloudflare ---
echo ""
echo "[3/5] Setting DNS to Cloudflare (1.1.1.1)..."
networksetup -setdnsservers Wi-Fi 1.1.1.1 1.0.0.1 2606:4700:4700::1111 2606:4700:4700::1001
echo "  ✓ DNS set to 1.1.1.1 / 1.0.0.1 (+ IPv6)"

# --- Step 7: Power management ---
echo ""
echo "[4/5] Configuring power management for battery..."
pmset -b powernap 0
pmset -b lowpowermode 1
echo "  ✓ Power Nap disabled on battery"
echo "  ✓ Low power mode enabled on battery"

# --- Step 5: Exclude dev directories from Spotlight ---
echo ""
echo "[5/6] Excluding dev directories from Spotlight..."
touch "$HOME/dev/.metadata_never_index"
touch "$HOME/Library/Caches/.metadata_never_index"
mdutil -i off "$HOME/dev" 2>/dev/null || true
echo "  ✓ ~/dev excluded from Spotlight"
echo "  ✓ ~/Library/Caches excluded from Spotlight"

# --- Step 6: Kill orphaned crane process ---
echo ""
echo "[6/6] Cleaning up orphaned processes..."
CRANE_PID=$(pgrep -f "crane --version" 2>/dev/null || true)
if [ -n "$CRANE_PID" ]; then
    kill $CRANE_PID 2>/dev/null || true
    echo "  ✓ Killed orphaned crane process (PID: $CRANE_PID)"
else
    echo "  - No orphaned crane process found"
fi

echo ""
echo "=== Done! ==="
echo ""
echo "Manual steps remaining:"
echo "  1. Restart Dock/Finder: killall Dock && killall Finder"
echo ""
echo "Verify with:"
echo "  sysctl kern.maxfiles kern.maxfilesperproc"
echo "  networksetup -getdnsservers Wi-Fi"
echo "  pmset -g | grep -E '(powernap|lowpowermode)'"
