#!/bin/bash
#
# Deploy crane-mcp to Dev Machine Fleet
#
# Updates crane-mcp on all enterprise dev machines after testing locally.
# Run this after making changes to crane-mcp and verifying on machine23.
#
# Usage: ./scripts/deploy-crane-mcp.sh
#
# What it does:
#   1. SSH to each machine
#   2. Stash any local changes
#   3. Pull latest from origin/main
#   4. Run npm run build
#
# Environment Variables:
#   DRY_RUN=true     Preview actions without executing
#   MACHINES         Override default machine list (space-separated)
#

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DRY_RUN="${DRY_RUN:-false}"

# Default machine list (excludes machine23 since that's where we develop/test)
DEFAULT_MACHINES=(
  "smdmbp27"
  "smdThink"
  "ubuntu"
)

if [ -n "$MACHINES" ]; then
  IFS=' ' read -ra MACHINE_LIST <<< "$MACHINES"
else
  MACHINE_LIST=("${DEFAULT_MACHINES[@]}")
fi

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Deploy crane-mcp to Fleet${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

# Check local crane-console status first
echo -e "${BLUE}Local crane-console status:${NC}"
LOCAL_COMMIT=$(cd ~/dev/crane-console && git rev-parse --short HEAD)
LOCAL_BRANCH=$(cd ~/dev/crane-console && git branch --show-current)
echo "  Branch: $LOCAL_BRANCH"
echo "  Commit: $LOCAL_COMMIT"
echo ""

# Verify we're on main and pushed
if [ "$LOCAL_BRANCH" != "main" ]; then
  echo -e "${YELLOW}Warning: Local crane-console is on branch '$LOCAL_BRANCH', not 'main'${NC}"
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check if local is ahead of origin
LOCAL_AHEAD=$(cd ~/dev/crane-console && git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
if [ "$LOCAL_AHEAD" -gt 0 ]; then
  echo -e "${RED}Error: Local crane-console has $LOCAL_AHEAD unpushed commit(s)${NC}"
  echo "Push your changes first: cd ~/dev/crane-console && git push"
  exit 1
fi

SUCCESS_COUNT=0
FAIL_COUNT=0
declare -a FAILED_MACHINES=()

for SSH_HOST in "${MACHINE_LIST[@]}"; do
  echo -e "${BLUE}-------------------------------------------${NC}"
  echo -e "${BLUE}Machine: $SSH_HOST${NC}"
  echo ""

  if [ "$DRY_RUN" = "true" ]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} Would SSH to $SSH_HOST and:"
    echo -e "    1. cd ~/dev/crane-console"
    echo -e "    2. git stash (if needed)"
    echo -e "    3. git pull origin main"
    echo -e "    4. cd packages/crane-mcp && npm run build && npm link"
    echo ""
    ((SUCCESS_COUNT++))
    continue
  fi

  REMOTE_CMD=$(cat <<'EOF'
set -e
cd ~/dev/crane-console || { echo "crane-console not found at ~/dev/crane-console"; exit 1; }

# Stash local changes if any
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Stashing local changes..."
  git stash
fi

# Pull latest
echo "Pulling latest..."
git fetch origin
git checkout main 2>/dev/null || true
git pull origin main

# Build crane-mcp from monorepo
echo "Building crane-mcp..."
cd packages/crane-mcp
npm run build

# Re-link to ensure fleet uses monorepo location
echo "Linking crane-mcp..."
npm link

# Report
echo ""
cd ~/dev/crane-console
echo "Updated to: $(git rev-parse --short HEAD)"
echo "Build complete."
EOF
)

  echo -e "  ${BLUE}Connecting...${NC}"

  if ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_HOST" "$REMOTE_CMD" 2>&1 | sed 's/^/  /'; then
    echo -e "  ${GREEN}Success${NC}"
    ((SUCCESS_COUNT++))
  else
    echo -e "  ${RED}Failed${NC}"
    FAILED_MACHINES+=("$SSH_HOST")
    ((FAIL_COUNT++))
  fi

  echo ""
done

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Deployment Summary${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${GREEN}Succeeded:${NC} $SUCCESS_COUNT"
echo -e "${RED}Failed:${NC}    $FAIL_COUNT"
echo ""

if [ ${#FAILED_MACHINES[@]} -gt 0 ]; then
  echo -e "${RED}Failed machines:${NC}"
  for machine in "${FAILED_MACHINES[@]}"; do
    echo "  - $machine"
  done
  echo ""
fi

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi

echo -e "${GREEN}Fleet updated to commit $LOCAL_COMMIT${NC}"
