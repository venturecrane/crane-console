#!/usr/bin/env bash
# hermes-env-sync.sh — materialize Infisical secrets into ~/.hermes/.env
#
# Runs on the target host (typically mini). Requires infisical CLI authed.
# Ensures the hermes-gateway systemd service has the secrets it needs, without
# duplicating secret values in the repo or relying on manual .env edits.
#
# Re-run after secret rotation:
#   ./scripts/hermes-env-sync.sh && systemctl --user restart hermes-gateway
set -euo pipefail
set -o pipefail

# Keys pulled from /vc (Telegram + crane-context + ops)
MAIN_KEYS=(
  TELEGRAM_BOT_TOKEN
  TELEGRAM_ALLOWED_USERS
  CRANE_CONTEXT_KEY
  CRANE_ADMIN_KEY
  GH_TOKEN
)

# Keys pulled from /vc/vault (longer-lived / higher-sensitivity)
VAULT_KEYS=(
  ANTHROPIC_API_KEY
)

# Ollama routing + identity — static, not secret
STATIC=(
  "CRANE_VENTURE_CODE=vc"
  "CRANE_ENV=prod"
  "LLM_MODEL=qwen2.5-coder:7b"
  "OPENAI_BASE_URL=http://localhost:11434/v1"
  "OPENAI_API_KEY=ollama"
)

ENV_FILE="$HOME/.hermes/.env"

command -v infisical >/dev/null || { echo "infisical CLI not on PATH" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq not on PATH — install with: sudo apt install jq" >&2; exit 1; }

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

export_keys() {
  local path=$1; shift
  local keys=("$@")
  local json
  json=$(infisical export --format=json --silent --path "$path" --env prod)
  [[ -n "$json" && "$json" != "{}" && "$json" != "null" ]] \
    || { echo "infisical export returned empty for $path" >&2; exit 1; }
  local filter
  filter=$(printf '%s\n' "${keys[@]}" | jq -R . | jq -sc .)
  jq -r --argjson keys "$filter" \
    'to_entries | map(select(.key as $k | $keys | index($k))) | .[] | "\(.key)=\(.value)"' \
    <<<"$json"
}

{
  export_keys /vc       "${MAIN_KEYS[@]}"
  export_keys /vc/vault "${VAULT_KEYS[@]}"
  printf '%s\n' "${STATIC[@]}"
} > "$tmp"

# Per-key presence + non-empty assertions
for k in "${MAIN_KEYS[@]}" "${VAULT_KEYS[@]}"; do
  grep -qE "^${k}=.+" "$tmp" || {
    echo "MISSING OR EMPTY in Infisical: $k" >&2
    exit 1
  }
done

install -m 600 "$tmp" "$ENV_FILE"
echo "-> wrote $ENV_FILE ($(wc -l < "$ENV_FILE") vars, mode 600)"
