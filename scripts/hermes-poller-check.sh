#!/usr/bin/env bash
# hermes-poller-check.sh — Telegram polling state check for gateway failover.
#
# One bot token = one active poller. Use this before starting a second hermes
# gateway to confirm nothing else is polling. If pending_update_count is > 0
# and climbing, no one is polling — safe to start a new gateway. If it stays
# at 0, something else is consuming updates — investigate before starting.
#
# Requires TELEGRAM_BOT_TOKEN in env, or an argument.
#
# Usage:
#   TELEGRAM_BOT_TOKEN=... ./scripts/hermes-poller-check.sh
#   ./scripts/hermes-poller-check.sh <token>
set -euo pipefail

TOKEN=${1:-${TELEGRAM_BOT_TOKEN:-}}
if [[ -z "$TOKEN" ]]; then
  if [[ -r "$HOME/.hermes/.env" ]]; then
    TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2-)
  fi
fi
[[ -n "$TOKEN" ]] || { echo "need TELEGRAM_BOT_TOKEN via env or arg" >&2; exit 1; }

command -v curl >/dev/null || { echo "curl not on PATH" >&2; exit 1; }
command -v jq   >/dev/null || { echo "jq not on PATH"   >&2; exit 1; }

info=$(curl -fsS "https://api.telegram.org/bot${TOKEN}/getWebhookInfo")
pending=$(jq -r '.result.pending_update_count // 0' <<<"$info")
url=$(jq -r '.result.url // ""' <<<"$info")

me=$(curl -fsS "https://api.telegram.org/bot${TOKEN}/getMe")
username=$(jq -r '.result.username // "?"' <<<"$me")

if [[ -n "$url" && "$url" != "null" ]]; then
  echo "bot @${username} is WEBHOOK-MODE, url=$url"
  echo "pending updates at webhook endpoint: $pending"
elif [[ "$pending" -gt 0 ]]; then
  echo "bot @${username} is LONG-POLL, pending=${pending} (no one is polling right now)"
else
  echo "bot @${username} is LONG-POLL, pending=0 (polled recently; OR no updates yet)"
  echo "HINT: if you expect another gateway to be running, it's likely active."
fi
