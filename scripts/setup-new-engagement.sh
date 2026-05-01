#!/bin/bash
#
# Setup a New SS Engagement with Crane Infrastructure
#
# Wires a new engagement under an existing SS client into the launcher and
# Infisical. Mirrors scripts/setup-new-venture.sh in shape but operates one
# tier down (engagement, not venture).
#
# Usage: ./scripts/setup-new-engagement.sh <client-slug> <engagement-slug> "<display-name>"
# Example: ./scripts/setup-new-engagement.sh acme website "Acme Co Website"
#
# Prerequisites (one-time, manual — see docs/process/new-engagement-setup-checklist.md):
# - smdservices-clients GitHub org exists
# - smdservices-platform GitHub App installed on the org
# - INFISICAL_MANAGEMENT_TOKEN set as a secret on crane-context (staging + prod)
# - smdservices-clients/engagement-template repo exists (branch-protected, CODEOWNERS)
# - The client must already exist (run /new-client first)
#
# Provision-first ordering: Infisical folder is created BEFORE ventures.json is
# mutated, so a transient Infisical failure can't leave the registry ahead of
# reality. After ventures.json is mutated, an ERR trap restores the backup.

set -e
set -o pipefail

# ============================================================================
# Colors
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# Setup
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLIENT_SLUG="${1:-}"
ENGAGEMENT_SLUG="${2:-}"
DISPLAY_NAME="${3:-}"
DRY_RUN="${DRY_RUN:-false}"

VENTURES_JSON="$REPO_ROOT/config/ventures.json"
SLUG_REGEX='^[a-z][a-z0-9-]{1,31}$'

# ============================================================================
# Validation
# ============================================================================

if [ -z "$CLIENT_SLUG" ] || [ -z "$ENGAGEMENT_SLUG" ] || [ -z "$DISPLAY_NAME" ]; then
  echo -e "${RED}Error: missing required arguments${NC}"
  echo "  Usage: $0 <client-slug> <engagement-slug> \"<display-name>\""
  exit 1
fi

if ! [[ "$CLIENT_SLUG" =~ $SLUG_REGEX ]]; then
  echo -e "${RED}Error: client-slug must match $SLUG_REGEX${NC}"
  exit 1
fi

if ! [[ "$ENGAGEMENT_SLUG" =~ $SLUG_REGEX ]]; then
  echo -e "${RED}Error: engagement-slug must match $SLUG_REGEX${NC}"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo -e "${RED}Error: jq is required${NC}"
  echo "  Install: brew install jq"
  exit 1
fi

if ! command -v gh &> /dev/null; then
  echo -e "${RED}Error: gh CLI is required${NC}"
  exit 1
fi

if ! gh auth status &> /dev/null 2>&1; then
  echo -e "${RED}Error: gh CLI not authenticated${NC}"
  exit 1
fi

if [ ! -f "$VENTURES_JSON" ]; then
  echo -e "${RED}Error: $VENTURES_JSON not found${NC}"
  exit 1
fi

# Verify client exists in ventures.json
if ! jq -e ".ventures[] | select(.code == \"ss\") | .clients[]? | select(.slug == \"$CLIENT_SLUG\")" \
    "$VENTURES_JSON" > /dev/null; then
  echo -e "${RED}Error: client '$CLIENT_SLUG' not found in ventures.json${NC}"
  echo "  Run /new-client first."
  exit 1
fi

# Verify engagement slug is unique within the client
if jq -e ".ventures[] | select(.code == \"ss\") | .clients[] | select(.slug == \"$CLIENT_SLUG\") | .engagements[]? | select(.slug == \"$ENGAGEMENT_SLUG\")" \
    "$VENTURES_JSON" > /dev/null; then
  echo -e "${RED}Error: engagement '$ENGAGEMENT_SLUG' already exists for client '$CLIENT_SLUG'${NC}"
  exit 1
fi

# Resolve client's githubOrg (defaults to smdservices-clients)
CLIENT_GITHUB_ORG=$(jq -r ".ventures[] | select(.code == \"ss\") | .clients[] | select(.slug == \"$CLIENT_SLUG\") | .githubOrg // \"smdservices-clients\"" "$VENTURES_JSON")
REPO_NAME="${CLIENT_SLUG}-${ENGAGEMENT_SLUG}"
FULL_REPO="${CLIENT_GITHUB_ORG}/${REPO_NAME}"
INFISICAL_PATH="/ss/clients/${CLIENT_SLUG}/${ENGAGEMENT_SLUG}"
LOCAL_PATH="$HOME/dev/ss/${CLIENT_SLUG}/${ENGAGEMENT_SLUG}"

# Resolve crane-context URL + admin key from launcher env (must be in env)
CONTEXT_URL="${CRANE_CONTEXT_URL:-https://crane-context.automation-ab6.workers.dev}"
if [ -z "${CRANE_ADMIN_KEY:-}" ]; then
  echo -e "${RED}Error: CRANE_ADMIN_KEY not in env${NC}"
  echo "  Run inside an SS launcher session (crane ss) so secrets are injected."
  exit 1
fi

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  New SS Engagement${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${BLUE}Client:${NC}           $CLIENT_SLUG"
echo -e "${BLUE}Engagement:${NC}       $ENGAGEMENT_SLUG"
echo -e "${BLUE}Display Name:${NC}     $DISPLAY_NAME"
echo -e "${BLUE}Repo:${NC}             $FULL_REPO"
echo -e "${BLUE}Infisical Path:${NC}   $INFISICAL_PATH"
echo -e "${BLUE}Local Path:${NC}       $LOCAL_PATH"
echo -e "${BLUE}Dry Run:${NC}          $DRY_RUN"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

# ============================================================================
# Helper Functions
# ============================================================================

run_cmd() {
  local desc="$1"
  shift

  echo -e "${BLUE}$desc${NC}"

  if [ "$DRY_RUN" = "true" ]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} $*"
    return 0
  fi

  if "$@"; then
    echo -e "  ${GREEN}Done${NC}"
    return 0
  else
    echo -e "  ${RED}Failed${NC}"
    return 1
  fi
}

# ============================================================================
# Step 1: Provision Infisical (BEFORE registry mutation, so a failure here
# leaves nothing behind)
# ============================================================================

echo -e "${CYAN}### Step 1: Provision Infisical Folder${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} POST $CONTEXT_URL/admin/provision-engagement"
  echo -e "  ${YELLOW}[DRY RUN]${NC} body: {client_slug: $CLIENT_SLUG, engagement_slug: $ENGAGEMENT_SLUG}"
else
  HTTP_CODE=$(curl -sS -o /tmp/provision-engagement.out -w "%{http_code}" -X POST \
    "$CONTEXT_URL/admin/provision-engagement" \
    -H "X-Admin-Key: $CRANE_ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"client_slug\":\"$CLIENT_SLUG\",\"engagement_slug\":\"$ENGAGEMENT_SLUG\"}")
  if [ "$HTTP_CODE" != "200" ]; then
    echo -e "  ${RED}Failed (HTTP $HTTP_CODE):${NC}"
    cat /tmp/provision-engagement.out
    exit 1
  fi
  echo -e "  ${GREEN}Provisioned $INFISICAL_PATH${NC}"
fi

echo ""

# ============================================================================
# Step 2: Create GitHub Repository (idempotent: existing repo treated as success)
# ============================================================================

echo -e "${CYAN}### Step 2: Create GitHub Repository${NC}"
echo ""

if gh repo view "$FULL_REPO" &> /dev/null 2>&1; then
  echo -e "${YELLOW}Repository $FULL_REPO already exists - skipping creation${NC}"
else
  TEMPLATE_REPO="${CLIENT_GITHUB_ORG}/engagement-template"
  run_cmd "Creating repository $FULL_REPO from $TEMPLATE_REPO..." \
    gh repo create "$FULL_REPO" --template "$TEMPLATE_REPO" --private \
      --description "$DISPLAY_NAME"
fi

echo ""

# ============================================================================
# Step 3: Mutate ventures.json (with backup + ERR trap rollback)
# ============================================================================

echo -e "${CYAN}### Step 3: Update ventures.json${NC}"
echo ""

VENTURES_BAK="${VENTURES_JSON}.bak"

restore_ventures_json() {
  if [ -f "$VENTURES_BAK" ]; then
    echo -e "${YELLOW}Restoring ventures.json from backup...${NC}"
    mv "$VENTURES_BAK" "$VENTURES_JSON"
  fi
}
trap restore_ventures_json ERR

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} jq append engagement to ventures.json"
else
  cp "$VENTURES_JSON" "$VENTURES_BAK"

  # Ensure clients[] exists, then ensure target client's engagements[] exists,
  # then append the new engagement object.
  jq --arg client "$CLIENT_SLUG" \
     --arg slug "$ENGAGEMENT_SLUG" \
     --arg name "$DISPLAY_NAME" \
     --arg repo "$FULL_REPO" \
     --arg path "$INFISICAL_PATH" '
    (.ventures[] | select(.code == "ss") | .clients) //= [] |
    (.ventures[] | select(.code == "ss") | .clients[] | select(.slug == $client) | .engagements) //= [] |
    (.ventures[] | select(.code == "ss") | .clients[] | select(.slug == $client) | .engagements) += [{
      "slug": $slug,
      "displayName": $name,
      "repo": $repo,
      "infisicalPath": $path
    }]
  ' "$VENTURES_JSON" > "${VENTURES_JSON}.tmp"

  if ! jq empty "${VENTURES_JSON}.tmp" > /dev/null 2>&1; then
    rm -f "${VENTURES_JSON}.tmp"
    echo -e "  ${RED}jq produced invalid JSON - aborting${NC}"
    exit 1
  fi

  mv "${VENTURES_JSON}.tmp" "$VENTURES_JSON"
  echo -e "  ${GREEN}Appended engagement to ventures.json${NC}"
fi

echo ""

# ============================================================================
# Step 4: Clone engagement repo to ~/dev/ss/<client>/<engagement>/
# ============================================================================

echo -e "${CYAN}### Step 4: Clone Repository${NC}"
echo ""

if [ -d "$LOCAL_PATH/.git" ]; then
  echo -e "${YELLOW}Already cloned at $LOCAL_PATH - skipping${NC}"
else
  if [ "$DRY_RUN" = "true" ]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} mkdir -p $(dirname "$LOCAL_PATH"); gh repo clone $FULL_REPO $LOCAL_PATH"
  else
    mkdir -p "$(dirname "$LOCAL_PATH")"
    gh repo clone "$FULL_REPO" "$LOCAL_PATH"
    echo -e "  ${GREEN}Cloned to $LOCAL_PATH${NC}"
  fi
fi

echo ""

# ============================================================================
# Step 5: Drop scaffold files (.infisical.json, .claude/settings.json)
# ============================================================================

echo -e "${CYAN}### Step 5: Drop Engagement Scaffold${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} write .infisical.json + .claude/settings.json"
else
  if [ -d "$LOCAL_PATH" ]; then
    # .infisical.json - copy from crane-console root
    if [ ! -f "$LOCAL_PATH/.infisical.json" ] && [ -f "$REPO_ROOT/.infisical.json" ]; then
      cp "$REPO_ROOT/.infisical.json" "$LOCAL_PATH/.infisical.json"
      echo -e "  ${GREEN}Copied .infisical.json${NC}"
    fi

    # .claude/settings.json - additionalDirectories locked to engagement path ONLY
    mkdir -p "$LOCAL_PATH/.claude"
    if [ ! -f "$LOCAL_PATH/.claude/settings.json" ]; then
      cat > "$LOCAL_PATH/.claude/settings.json" <<EOF
{
  "additionalDirectories": ["~/dev/ss/${CLIENT_SLUG}/${ENGAGEMENT_SLUG}"]
}
EOF
      echo -e "  ${GREEN}Wrote .claude/settings.json (engagement-scoped)${NC}"
    fi

    # Commit + push if scaffold added new files
    cd "$LOCAL_PATH"
    if [ -n "$(git status --porcelain)" ]; then
      git add .infisical.json .claude/settings.json 2>/dev/null || true
      git commit -m "chore: initialize engagement scaffold" || true
      git push origin HEAD || true
    fi
    cd "$REPO_ROOT"
  fi
fi

echo ""

# ============================================================================
# Step 6: Rebuild crane-mcp (so launcher INFISICAL_PATHS picks up new path)
# ============================================================================

echo -e "${CYAN}### Step 6: Rebuild crane-mcp${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} cd packages/crane-mcp && npm run build"
else
  (
    cd "$REPO_ROOT/packages/crane-mcp"
    npm run build > /tmp/crane-mcp-build.log 2>&1
  ) || {
    echo -e "  ${YELLOW}crane-mcp build failed - see /tmp/crane-mcp-build.log${NC}"
  }
  echo -e "  ${GREEN}Rebuilt crane-mcp${NC}"
fi

echo ""

# ============================================================================
# Step 7: Redeploy crane-context (so the worker sees new ventures.json)
# ============================================================================

echo -e "${CYAN}### Step 7: Redeploy crane-context${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} cd workers/crane-context && npm run deploy"
  echo -e "  ${YELLOW}[DRY RUN]${NC} cd workers/crane-context && npm run deploy:prod"
else
  (
    cd "$REPO_ROOT/workers/crane-context"
    npm run deploy > /tmp/crane-context-staging.log 2>&1
  ) && echo -e "  ${GREEN}Deployed crane-context (staging)${NC}" \
    || echo -e "  ${YELLOW}staging deploy failed - see /tmp/crane-context-staging.log${NC}"

  (
    cd "$REPO_ROOT/workers/crane-context"
    npm run deploy:prod > /tmp/crane-context-prod.log 2>&1
  ) && echo -e "  ${GREEN}Deployed crane-context (production)${NC}" \
    || echo -e "  ${YELLOW}prod deploy failed - see /tmp/crane-context-prod.log${NC}"
fi

echo ""

# Clean up backup once everything past the registry mutation succeeded
if [ -f "$VENTURES_BAK" ]; then
  rm -f "$VENTURES_BAK"
fi
trap - ERR

# ============================================================================
# Summary
# ============================================================================

echo -e "${CYAN}==========================================${NC}"
echo -e "${GREEN}  Engagement setup complete${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "Launch with: ${CYAN}crane ss/${CLIENT_SLUG}/${ENGAGEMENT_SLUG}${NC}"
echo ""
echo -e "${BLUE}Next:${NC}"
echo "  1. cd $REPO_ROOT && git add config/ventures.json && git commit -m 'chore(ss): add engagement $CLIENT_SLUG/$ENGAGEMENT_SLUG' && git push"
echo "  2. crane ss/${CLIENT_SLUG}/${ENGAGEMENT_SLUG} --debug  # verify launcher resolves"
echo ""
