#!/bin/bash
# Creates a wrapper script for the Tailscale CLI on macOS.
# The app binary can't be symlinked (bundle ID check fails),
# but works fine when exec'd from a wrapper script.
#
# Usage: sudo bash scripts/fix-tailscale-cli.sh

set -e

WRAPPER="/opt/homebrew/bin/tailscale"

cat > "$WRAPPER" << 'EOF'
#!/bin/bash
exec /Applications/Tailscale.app/Contents/MacOS/Tailscale "$@"
EOF

chmod +x "$WRAPPER"
echo "Wrote $WRAPPER"
