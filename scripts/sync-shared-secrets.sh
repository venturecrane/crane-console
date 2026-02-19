#!/bin/bash
#
# Sync shared secrets across all venture Infisical paths.
#
# Reads the shared secrets declaration from config/ventures.json and ensures
# every venture path has the required secrets. Source of truth is /vc.
#
# Usage:
#   bash scripts/sync-shared-secrets.sh              # Audit mode (report only)
#   bash scripts/sync-shared-secrets.sh --fix        # Fix missing secrets
#   bash scripts/sync-shared-secrets.sh --venture ke # Check one venture only
#   bash scripts/sync-shared-secrets.sh --env dev    # Target dev environment
#
# Exit codes:
#   0 - All secrets present (or all fixed in --fix mode)
#   1 - Missing secrets found (audit mode)
#   2 - Configuration or auth error

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/config/ventures.json"

# Defaults
FIX_MODE=false
TARGET_VENTURE=""
TARGET_ENV="prod"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fix)
      FIX_MODE=true
      shift
      ;;
    --venture)
      TARGET_VENTURE="$2"
      shift 2
      ;;
    --env)
      TARGET_ENV="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--fix] [--venture <code>] [--env prod|dev]"
      echo ""
      echo "Options:"
      echo "  --fix              Fix missing secrets (default: audit only)"
      echo "  --venture <code>   Only check/fix one venture"
      echo "  --env <env>        Target environment (default: prod)"
      echo ""
      echo "Examples:"
      echo "  $0                 # Audit all ventures"
      echo "  $0 --fix           # Fix all missing secrets"
      echo "  $0 --venture dfg   # Check only DFG"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      exit 2
      ;;
  esac
done

# Validate dependencies
if ! command -v jq &>/dev/null; then
  echo -e "${RED}Error: jq is required but not installed${NC}"
  echo "  Install: brew install jq"
  exit 2
fi

if ! command -v infisical &>/dev/null; then
  echo -e "${RED}Error: infisical CLI is required but not installed${NC}"
  echo "  Install: brew install infisical/get-cli/infisical"
  exit 2
fi

# Validate config file
if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "${RED}Error: Config file not found: $CONFIG_FILE${NC}"
  exit 2
fi

# Read config
SOURCE_PATH=$(jq -r '.sharedSecrets.source' "$CONFIG_FILE")
SHARED_KEYS=$(jq -r '.sharedSecrets.keys[]' "$CONFIG_FILE")
VENTURE_CODES=$(jq -r '.ventures[].code' "$CONFIG_FILE")

if [ -z "$SOURCE_PATH" ] || [ "$SOURCE_PATH" = "null" ]; then
  echo -e "${RED}Error: sharedSecrets.source not defined in $CONFIG_FILE${NC}"
  exit 2
fi

if [ -z "$SHARED_KEYS" ]; then
  echo -e "${RED}Error: sharedSecrets.keys is empty in $CONFIG_FILE${NC}"
  exit 2
fi

# Validate Infisical auth by reading from source
echo -e "${BLUE}Validating Infisical access...${NC}"
if ! infisical export --path "$SOURCE_PATH" --env "$TARGET_ENV" --format=json --silent >/dev/null 2>&1; then
  echo -e "${RED}Error: Cannot read from Infisical path '$SOURCE_PATH' (env: $TARGET_ENV)${NC}"
  echo "  Check: infisical login"
  exit 2
fi
echo -e "  ${GREEN}Authenticated${NC}"
echo ""

# Read source values into a temp file (bash 3 compatible - no associative arrays)
SOURCE_CACHE=$(mktemp -d)/source-secrets
mkdir -p "$SOURCE_CACHE"
MISSING_SOURCE=false

for key in $SHARED_KEYS; do
  value=$(infisical secrets get "$key" --path "$SOURCE_PATH" --env "$TARGET_ENV" --plain 2>/dev/null || echo "")
  if [ -z "$value" ] || [[ "$value" =~ ^[[:space:]]*$ ]]; then
    echo -e "${RED}Error: $key is empty or missing in source path $SOURCE_PATH${NC}"
    MISSING_SOURCE=true
  else
    printf '%s' "$value" > "$SOURCE_CACHE/$key"
  fi
done

if [ "$MISSING_SOURCE" = true ]; then
  rm -rf "$(dirname "$SOURCE_CACHE")"
  echo -e "${RED}Cannot proceed - source secrets are incomplete${NC}"
  exit 2
fi

get_source_value() {
  cat "$SOURCE_CACHE/$1"
}

cleanup() { rm -rf "$(dirname "$SOURCE_CACHE")" 2>/dev/null; }
trap cleanup EXIT

echo -e "${BLUE}Shared secrets (source: $SOURCE_PATH, env: $TARGET_ENV):${NC}"
for key in $SHARED_KEYS; do
  echo -e "  $key  ${GREEN}present${NC}"
done
echo ""

# Filter ventures
if [ -n "$TARGET_VENTURE" ]; then
  # Validate the venture code exists
  if ! echo "$VENTURE_CODES" | grep -qx "$TARGET_VENTURE"; then
    echo -e "${RED}Error: Unknown venture code '$TARGET_VENTURE'${NC}"
    echo "  Available: $(echo $VENTURE_CODES | tr '\n' ' ')"
    exit 2
  fi
  VENTURE_CODES="$TARGET_VENTURE"
fi

# Audit/fix each venture
TOTAL_MISSING=0
TOTAL_FIXED=0

for code in $VENTURE_CODES; do
  venture_path="/$code"

  # Skip the source path itself
  if [ "$venture_path" = "$SOURCE_PATH" ]; then
    continue
  fi

  venture_name=$(jq -r ".ventures[] | select(.code == \"$code\") | .name" "$CONFIG_FILE")
  echo -e "${BLUE}$venture_name ($code) - path: $venture_path${NC}"

  venture_ok=true

  for key in $SHARED_KEYS; do
    current=$(infisical secrets get "$key" --path "$venture_path" --env "$TARGET_ENV" --plain 2>/dev/null || echo "")

    source_value=$(get_source_value "$key")

    if [ -z "$current" ] || [[ "$current" =~ ^[[:space:]]*$ ]]; then
      venture_ok=false
      TOTAL_MISSING=$((TOTAL_MISSING + 1))

      if [ "$FIX_MODE" = true ]; then
        echo -e "  $key  ${YELLOW}missing${NC} -> ${GREEN}fixing${NC}"
        if infisical secrets set "$key=${source_value}" --path "$venture_path" --env "$TARGET_ENV" >/dev/null 2>&1; then
          TOTAL_FIXED=$((TOTAL_FIXED + 1))
          echo -e "  $key  ${GREEN}synced${NC}"
        else
          echo -e "  $key  ${RED}failed to write${NC}"
        fi
      else
        echo -e "  $key  ${RED}MISSING${NC}"
      fi
    elif [ "$current" != "$source_value" ]; then
      venture_ok=false
      TOTAL_MISSING=$((TOTAL_MISSING + 1))

      if [ "$FIX_MODE" = true ]; then
        echo -e "  $key  ${YELLOW}DRIFT${NC} -> ${GREEN}fixing${NC}"
        if infisical secrets set "$key=${source_value}" --path "$venture_path" --env "$TARGET_ENV" >/dev/null 2>&1; then
          TOTAL_FIXED=$((TOTAL_FIXED + 1))
          echo -e "  $key  ${GREEN}synced${NC}"
        else
          echo -e "  $key  ${RED}failed to write${NC}"
        fi
      else
        echo -e "  $key  ${YELLOW}DRIFT${NC} (value differs from source)"
      fi
    else
      echo -e "  $key  ${GREEN}present${NC}"
    fi
  done

  if [ "$venture_ok" = true ]; then
    echo -e "  ${GREEN}All shared secrets present${NC}"
  fi
  echo ""
done

# Summary
if [ "$FIX_MODE" = true ]; then
  if [ "$TOTAL_MISSING" -eq 0 ]; then
    echo -e "${GREEN}All shared secrets are in sync.${NC}"
    exit 0
  else
    echo -e "${GREEN}Fixed $TOTAL_FIXED of $TOTAL_MISSING missing/drifted secrets.${NC}"
    if [ "$TOTAL_FIXED" -lt "$TOTAL_MISSING" ]; then
      echo -e "${RED}Some secrets could not be synced. Check errors above.${NC}"
      exit 1
    fi
    exit 0
  fi
else
  if [ "$TOTAL_MISSING" -eq 0 ]; then
    echo -e "${GREEN}All shared secrets are in sync.${NC}"
    exit 0
  else
    echo -e "${RED}$TOTAL_MISSING missing or drifted secret(s) found.${NC}"
    echo -e "Run with ${YELLOW}--fix${NC} to propagate from $SOURCE_PATH."
    exit 1
  fi
fi
