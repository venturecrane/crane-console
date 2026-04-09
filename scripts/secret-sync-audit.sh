#!/usr/bin/env bash
# scripts/secret-sync-audit.sh
#
# Plan v3.1 §D.4. Detects secret drift across three planes:
#   1. Infisical (source of truth)
#   2. Wrangler staging (crane-context worker)
#   3. Wrangler production (crane-context worker)
#
# Primary mode is hash-based: compute sha256(value || nonce) in each
# plane and compare. Values never cross the plane boundary in cleartext.
#
# Rotation-age mode is supplementary: checks Infisical updatedAt and
# warns if any shared secret is > 30 days old (fails if > 60 days).
#
# CI-safe: only hashes and updatedAt timestamps are logged.
#
# Usage:
#   bash scripts/secret-sync-audit.sh --mode=hash            # default
#   bash scripts/secret-sync-audit.sh --mode=rotation-age
#   bash scripts/secret-sync-audit.sh --mode=all             # runs both
#   bash scripts/secret-sync-audit.sh --ci                   # exit 1 on drift
#   bash scripts/secret-sync-audit.sh --json                 # structured output

set -uo pipefail

MODE="hash"
JSON=0
CI=0
for a in "$@"; do
  case "$a" in
    --mode=hash) MODE="hash" ;;
    --mode=rotation-age) MODE="rotation-age" ;;
    --mode=all) MODE="all" ;;
    --json) JSON=1 ;;
    --ci) CI=1 ;;
    --help|-h)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown arg '$a'" >&2
      echo "usage: $0 [--mode=hash|rotation-age|all] [--json] [--ci]" >&2
      exit 2
      ;;
  esac
done

# Keys to verify via hash-based comparison. Must match the allowlist in
# workers/crane-context/src/endpoints/admin-secret-hash.ts.
HASH_KEYS=("CONTEXT_RELAY_KEY" "CONTEXT_ADMIN_KEY")

# Keys to check for rotation age (WARN at 30 days, FAIL at 60 days).
# These are the critical secrets that MUST be rotated periodically.
ROTATION_KEYS=("CLOUDFLARE_API_TOKEN" "CONTEXT_RELAY_KEY" "CONTEXT_ADMIN_KEY" "CRANE_ADMIN_KEY")

STAGING_URL="https://crane-context-staging.automation-ab6.workers.dev"
PROD_URL="https://crane-context.automation-ab6.workers.dev"

FAIL=0
FINDINGS=()

record() {
  # record SEVERITY PLANE KEY MESSAGE
  FINDINGS+=("$1|$2|$3|$4")
  if [ "$1" = "error" ]; then FAIL=1; fi
}

# ---- Preflight ----
if ! command -v infisical >/dev/null 2>&1; then
  echo "error: infisical CLI not found in PATH" >&2
  exit 2
fi
if ! command -v shasum >/dev/null 2>&1; then
  echo "error: shasum not found in PATH" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl not found in PATH" >&2
  exit 2
fi

# Need the admin key to call /admin/secret-hash. Pulled from Infisical so
# the script can run without requiring it to be pre-exported.
CRANE_ADMIN_KEY=$(infisical secrets get CRANE_ADMIN_KEY --path /vc --env prod --plain 2>/dev/null)
if [ -z "$CRANE_ADMIN_KEY" ]; then
  echo "error: could not fetch CRANE_ADMIN_KEY from Infisical /vc" >&2
  exit 2
fi

# ---- Hash mode ----
run_hash_mode() {
  echo "# Hash-based secret sync audit" >&2

  for key in "${HASH_KEYS[@]}"; do
    # Generate a per-key nonce (32 random hex chars)
    NONCE=$(openssl rand -hex 16)

    # Plane 1: Infisical
    INFISICAL_VALUE=$(infisical secrets get "$key" --path /vc --env prod --plain 2>/dev/null)
    if [ -z "$INFISICAL_VALUE" ]; then
      record "error" "infisical" "$key" "Not set in Infisical /vc"
      continue
    fi
    INFISICAL_HASH=$(printf '%s%s' "$INFISICAL_VALUE" "$NONCE" | shasum -a 256 | cut -d' ' -f1)

    # Plane 2: wrangler staging
    STAGING_RESP=$(curl -sf "$STAGING_URL/admin/secret-hash?key=$key&nonce=$NONCE" \
      -H "X-Admin-Key: $CRANE_ADMIN_KEY" 2>/dev/null) || {
      record "error" "wrangler-staging" "$key" "Endpoint call failed (status != 200)"
      continue
    }
    STAGING_HASH=$(echo "$STAGING_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin).get('hash',''))" 2>/dev/null)
    if [ -z "$STAGING_HASH" ]; then
      record "error" "wrangler-staging" "$key" "Response missing 'hash' field"
      continue
    fi

    # Plane 3: wrangler prod
    PROD_RESP=$(curl -sf "$PROD_URL/admin/secret-hash?key=$key&nonce=$NONCE" \
      -H "X-Admin-Key: $CRANE_ADMIN_KEY" 2>/dev/null) || {
      record "error" "wrangler-prod" "$key" "Endpoint call failed (status != 200)"
      continue
    }
    PROD_HASH=$(echo "$PROD_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin).get('hash',''))" 2>/dev/null)
    if [ -z "$PROD_HASH" ]; then
      record "error" "wrangler-prod" "$key" "Response missing 'hash' field"
      continue
    fi

    # Compare
    if [ "$INFISICAL_HASH" = "$STAGING_HASH" ] && [ "$INFISICAL_HASH" = "$PROD_HASH" ]; then
      record "info" "all-planes" "$key" "In sync across Infisical, staging, prod"
    else
      MSG="DRIFT — infisical=${INFISICAL_HASH:0:12}"
      if [ "$INFISICAL_HASH" != "$STAGING_HASH" ]; then
        MSG="$MSG staging=${STAGING_HASH:0:12}"
      else
        MSG="$MSG staging=MATCH"
      fi
      if [ "$INFISICAL_HASH" != "$PROD_HASH" ]; then
        MSG="$MSG prod=${PROD_HASH:0:12}"
      else
        MSG="$MSG prod=MATCH"
      fi
      record "error" "multi-plane" "$key" "$MSG"
    fi
  done
}

# ---- Rotation-age mode ----
run_rotation_age_mode() {
  echo "# Secret rotation-age audit" >&2

  now_epoch=$(date +%s)

  for key in "${ROTATION_KEYS[@]}"; do
    # infisical secrets list --format=json returns [{name, updatedAt, ...}]
    # Newer CLIs may use different flag names; fall back gracefully.
    UPDATED_AT=$(infisical secrets list --path /vc --env prod --format=json 2>/dev/null \
      | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for row in data:
        if row.get('name') == '$key' or row.get('secretKey') == '$key':
            print(row.get('updatedAt') or row.get('_updatedAt') or '')
            break
except Exception:
    pass
" 2>/dev/null)

    if [ -z "$UPDATED_AT" ]; then
      record "warning" "infisical" "$key" "Could not determine updatedAt"
      continue
    fi

    # Parse ISO8601 → epoch (macOS and Linux differ here)
    if date -j -f "%Y-%m-%dT%H:%M:%S" "${UPDATED_AT%%.*}" +%s >/dev/null 2>&1; then
      UPDATED_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${UPDATED_AT%%.*}" +%s)
    else
      UPDATED_EPOCH=$(date -d "$UPDATED_AT" +%s 2>/dev/null || echo 0)
    fi

    if [ "$UPDATED_EPOCH" -eq 0 ]; then
      record "warning" "infisical" "$key" "Could not parse updatedAt: $UPDATED_AT"
      continue
    fi

    age_days=$(( (now_epoch - UPDATED_EPOCH) / 86400 ))
    if [ "$age_days" -ge 60 ]; then
      record "error" "infisical" "$key" "Age ${age_days}d (>= 60d rotation fail threshold)"
    elif [ "$age_days" -ge 30 ]; then
      record "warning" "infisical" "$key" "Age ${age_days}d (>= 30d rotation warn threshold)"
    else
      record "info" "infisical" "$key" "Age ${age_days}d (fresh)"
    fi
  done
}

# ---- Dispatch ----
case "$MODE" in
  hash)         run_hash_mode ;;
  rotation-age) run_rotation_age_mode ;;
  all)          run_hash_mode; run_rotation_age_mode ;;
esac

# ---- Output ----
if [ "$JSON" -eq 1 ]; then
  printf '{"mode":"%s","status":"%s","findings":[' \
    "$MODE" "$([ $FAIL -eq 0 ] && echo "pass" || echo "fail")"
  first=1
  for f in "${FINDINGS[@]}"; do
    sev="${f%%|*}"; rest="${f#*|}"
    plane="${rest%%|*}"; rest="${rest#*|}"
    key="${rest%%|*}"; msg="${rest#*|}"
    if [ $first -eq 0 ]; then printf ','; fi
    printf '{"severity":"%s","plane":"%s","key":"%s","message":"%s"}' \
      "$sev" "$plane" "$key" "$msg"
    first=0
  done
  printf ']}\n'
else
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
  if [ ${#FINDINGS[@]} -eq 0 ]; then
    echo -e "${GREEN}secret-sync-audit: no findings${NC}"
  else
    err_count=0; warn_count=0; info_count=0
    for f in "${FINDINGS[@]}"; do
      sev="${f%%|*}"; rest="${f#*|}"
      plane="${rest%%|*}"; rest="${rest#*|}"
      key="${rest%%|*}"; msg="${rest#*|}"
      case "$sev" in
        error)
          echo -e "  ${RED}[ERROR]${NC} $plane $key: $msg"
          err_count=$((err_count + 1)) ;;
        warning)
          echo -e "  ${YELLOW}[WARN]${NC}  $plane $key: $msg"
          warn_count=$((warn_count + 1)) ;;
        info)
          echo -e "  ${BLUE}[INFO]${NC}  $plane $key: $msg"
          info_count=$((info_count + 1)) ;;
      esac
    done
    echo ""
    echo "secret-sync-audit: $err_count errors, $warn_count warnings, $info_count info"
  fi
fi

if [ "$CI" -eq 1 ] && [ $FAIL -eq 1 ]; then
  exit 1
fi
exit 0
