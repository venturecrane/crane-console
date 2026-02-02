#!/bin/bash
#
# Deploy Repository to Dev Machine Fleet
#
# Clones or updates a repository on all enterprise dev machines via SSH.
# Ensures consistent repo state across the fleet for multi-machine development.
#
# Usage: ./scripts/deploy-to-fleet.sh <github-org> <repo-name>
# Example: ./scripts/deploy-to-fleet.sh smdurgan smd-console
#
# Environment Variables:
#   DRY_RUN=true     Preview actions without executing
#   MACHINES         Override default machine list (space-separated)
#
# Default Machines:
#   - smdmbp27   (Xubuntu, SSH: smdmbp27)
#   - smdThink   (Xubuntu, SSH: smdThink)
#   - smdmacmini (Ubuntu Server, SSH: ubuntu)
#

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
GITHUB_ORG="${1:-}"
REPO_NAME="${2:-}"
DRY_RUN="${DRY_RUN:-false}"

# Default machine list (SSH host -> dev directory path)
# Format: ssh_host:dev_path
DEFAULT_MACHINES=(
  "smdmbp27:~/dev"
  "smdThink:~/dev"
  "ubuntu:~/dev"
)

# Use environment override or defaults
if [ -n "$MACHINES" ]; then
  IFS=' ' read -ra MACHINE_LIST <<< "$MACHINES"
else
  MACHINE_LIST=("${DEFAULT_MACHINES[@]}")
fi

# ============================================================================
# Validation
# ============================================================================

print_usage() {
  echo "Usage: $0 <github-org> <repo-name>"
  echo ""
  echo "Arguments:"
  echo "  github-org    GitHub organization (e.g., smdurgan)"
  echo "  repo-name     Repository name (e.g., smd-console)"
  echo ""
  echo "Environment Variables:"
  echo "  DRY_RUN=true    Preview actions without executing"
  echo "  MACHINES=\"host1:path1 host2:path2\"  Override machine list"
  echo ""
  echo "Examples:"
  echo "  $0 smdurgan smd-console"
  echo "  DRY_RUN=true $0 venturecrane crane-console"
  echo ""
  echo "Default Machines:"
  for machine in "${DEFAULT_MACHINES[@]}"; do
    IFS=':' read -r host path <<< "$machine"
    echo "  - $host ($path)"
  done
}

if [ -z "$GITHUB_ORG" ] || [ -z "$REPO_NAME" ]; then
  echo -e "${RED}Error: Missing required arguments${NC}"
  echo ""
  print_usage
  exit 1
fi

REPO_URL="https://github.com/${GITHUB_ORG}/${REPO_NAME}.git"
FULL_REPO="${GITHUB_ORG}/${REPO_NAME}"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Deploy to Fleet: $REPO_NAME${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${BLUE}Repository:${NC}  $FULL_REPO"
echo -e "${BLUE}Dry Run:${NC}     $DRY_RUN"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

# ============================================================================
# Deploy to Each Machine
# ============================================================================

SUCCESS_COUNT=0
FAIL_COUNT=0
declare -a FAILED_MACHINES=()

for machine_def in "${MACHINE_LIST[@]}"; do
  IFS=':' read -r SSH_HOST DEV_PATH <<< "$machine_def"

  echo -e "${BLUE}-------------------------------------------${NC}"
  echo -e "${BLUE}Machine: $SSH_HOST${NC}"
  echo -e "${BLUE}Path:    $DEV_PATH/$REPO_NAME${NC}"
  echo ""

  if [ "$DRY_RUN" = "true" ]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} Would SSH to $SSH_HOST and:"
    echo -e "    1. Create $DEV_PATH if needed"
    echo -e "    2. Clone or pull $REPO_URL"
    echo ""
    ((SUCCESS_COUNT++))
    continue
  fi

  # Build the remote command
  REMOTE_CMD=$(cat <<EOF
set -e

# Ensure dev directory exists
mkdir -p $DEV_PATH

cd $DEV_PATH

if [ -d "$REPO_NAME/.git" ]; then
  # Repo exists - pull latest
  echo "Repository exists, pulling latest..."
  cd "$REPO_NAME"
  git fetch origin
  git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || echo "Pull failed (may be on different branch)"
  echo "Updated to: \$(git rev-parse --short HEAD)"
else
  # Clone fresh
  echo "Cloning repository..."
  git clone "$REPO_URL"
  cd "$REPO_NAME"
  echo "Cloned at: \$(git rev-parse --short HEAD)"
fi

echo "Done."
EOF
)

  # Execute on remote machine
  echo -e "  ${BLUE}Connecting...${NC}"

  if ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_HOST" "$REMOTE_CMD" 2>&1; then
    echo -e "  ${GREEN}Success${NC}"
    ((SUCCESS_COUNT++))
  else
    echo -e "  ${RED}Failed to deploy to $SSH_HOST${NC}"
    FAILED_MACHINES+=("$SSH_HOST")
    ((FAIL_COUNT++))
  fi

  echo ""
done

# ============================================================================
# Summary
# ============================================================================

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
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo "  1. Check SSH connectivity: ssh <machine> echo 'connected'"
  echo "  2. Check machine is online via Tailscale: tailscale status"
  echo "  3. Verify SSH keys are set up for passwordless login"
  echo ""
fi

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
