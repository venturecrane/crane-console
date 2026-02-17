#!/bin/bash
#
# Block Cloudflare Web Analytics beacon to exclude this machine's traffic.
#
# The RUM beacon (static.cloudflareinsights.com) is auto-injected by
# Cloudflare Pages. Blocking it at /etc/hosts prevents analytics data
# from being sent, giving us clean visitor metrics.
#
# Idempotent - safe to re-run.
#

BEACON_DOMAIN="static.cloudflareinsights.com"

if grep -q "$BEACON_DOMAIN" /etc/hosts 2>/dev/null; then
    echo "Already blocked: $BEACON_DOMAIN"
else
    echo "0.0.0.0 $BEACON_DOMAIN" | sudo tee -a /etc/hosts >/dev/null
    echo "Blocked: $BEACON_DOMAIN"
fi
