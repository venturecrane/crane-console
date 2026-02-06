#!/usr/bin/env bash
#
# bootstrap-infisical-ua.sh - One-time setup for Infisical Universal Auth
#
# Creates ~/.infisical-ua with Machine Identity credentials for SSH sessions.
# Run this once on each machine that will be accessed via SSH.
#
# Usage: bash scripts/bootstrap-infisical-ua.sh

set -euo pipefail

UA_FILE="$HOME/.infisical-ua"

echo ""
echo "Infisical Universal Auth Setup"
echo "=============================="
echo ""
echo "This creates ~/.infisical-ua for SSH session authentication."
echo "You need a Machine Identity from app.infisical.com first."
echo ""
echo "Steps to create one (if you haven't already):"
echo "  1. Go to app.infisical.com > Organization Settings > Machine Identities"
echo "  2. Create identity named 'crane-fleet'"
echo "  3. Add Universal Auth method (TTL: 2592000 = 30 days)"
echo "  4. Grant Developer access to the 'venture-crane' project"
echo "  5. Create a Client Secret, copy both Client ID and Client Secret"
echo ""

if [ -f "$UA_FILE" ]; then
  echo "Warning: $UA_FILE already exists."
  read -rp "Overwrite? (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

read -rp "Client ID: " client_id
if [ -z "$client_id" ]; then
  echo "Error: Client ID is required."
  exit 1
fi

read -rsp "Client Secret: " client_secret
echo ""
if [ -z "$client_secret" ]; then
  echo "Error: Client Secret is required."
  exit 1
fi

# Write credentials file
cat > "$UA_FILE" << EOF
# Infisical Universal Auth credentials for SSH sessions
# Created by bootstrap-infisical-ua.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Machine: $(hostname)
INFISICAL_UA_CLIENT_ID=$client_id
INFISICAL_UA_CLIENT_SECRET=$client_secret
EOF

chmod 600 "$UA_FILE"
echo ""
echo "Wrote $UA_FILE (chmod 600)"

# Verify credentials work
echo ""
echo "Verifying credentials..."
if infisical login --method=universal-auth \
  --client-id="$client_id" \
  --client-secret="$client_secret" \
  --plain --silent > /dev/null 2>&1; then
  echo "Success! Universal Auth login verified."
else
  echo "Warning: UA login failed. Check your credentials."
  echo "The file was written - you can edit ~/.infisical-ua and retry."
  exit 1
fi

echo ""
echo "Done. SSH sessions will now use Universal Auth for Infisical."
