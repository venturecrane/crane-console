#!/bin/bash
#
# Sync Enterprise Slash Commands to Venture Repos
#
# Copies all .claude/commands/*.md from crane-console to every local
# ~/dev/*-console/ repo. Additive merge: enterprise files are copied/overwritten,
# venture-specific commands are preserved.
#
# Usage: ./scripts/sync-commands.sh [--dry-run] [--fleet]
#
# Flags:
#   --dry-run   Preview changes without writing files
#   --fleet     Also sync to remote fleet machines via SSH
#
# Examples:
#   ./scripts/sync-commands.sh --dry-run        # Preview local changes
#   ./scripts/sync-commands.sh                  # Sync to local repos
#   ./scripts/sync-commands.sh --fleet          # Sync local + remote machines
#   ./scripts/sync-commands.sh --fleet --dry-run # Preview fleet sync
#

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/.claude/commands"

# Parse flags
DRY_RUN=false
FLEET=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --fleet)   FLEET=true ;;
    *)
      echo -e "${RED}Unknown flag: $arg${NC}"
      echo "Usage: $0 [--dry-run] [--fleet]"
      exit 1
      ;;
  esac
done

# Fleet machines (SSH hosts)
FLEET_MACHINES=(mbp27 think mini m16)
CURRENT_HOST=$(hostname -s)

# ============================================================================
# Validation
# ============================================================================

if [ ! -d "$SOURCE_DIR" ]; then
  echo -e "${RED}Error: Source directory not found: $SOURCE_DIR${NC}"
  exit 1
fi

SOURCE_FILES=("$SOURCE_DIR"/*.md)
if [ ! -f "${SOURCE_FILES[0]}" ]; then
  echo -e "${RED}Error: No .md files found in $SOURCE_DIR${NC}"
  exit 1
fi

# ============================================================================
# Local Sync
# ============================================================================

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Sync Enterprise Commands${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${BLUE}Source:${NC}   $SOURCE_DIR"
echo -e "${BLUE}Files:${NC}    ${#SOURCE_FILES[@]} enterprise commands"
echo -e "${BLUE}Dry Run:${NC} $DRY_RUN"
echo -e "${BLUE}Fleet:${NC}   $FLEET"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

REPO_COUNT=0
NEW_COUNT=0
UPDATED_COUNT=0
UNCHANGED_COUNT=0
declare -a CHANGED_REPOS=()

for repo_dir in "$HOME"/dev/*-console; do
  # Skip non-directories
  [ -d "$repo_dir" ] || continue

  # Skip crane-console (source) and smd-console
  repo_name=$(basename "$repo_dir")
  case "$repo_name" in
    crane-console|smd-console) continue ;;
  esac

  # Skip non-git directories
  [ -d "$repo_dir/.git" ] || continue

  ((REPO_COUNT++)) || true
  echo -e "${BLUE}-------------------------------------------${NC}"
  echo -e "${BLUE}Repo: $repo_name${NC}"

  TARGET_DIR="$repo_dir/.claude/commands"

  if [ "$DRY_RUN" = false ]; then
    mkdir -p "$TARGET_DIR"
  fi

  repo_changed=false

  for src_file in "${SOURCE_FILES[@]}"; do
    filename=$(basename "$src_file")
    target_file="$TARGET_DIR/$filename"

    if [ ! -f "$target_file" ]; then
      # New file
      echo -e "  ${GREEN}+ new${NC}      $filename"
      ((NEW_COUNT++)) || true
      repo_changed=true
      if [ "$DRY_RUN" = false ]; then
        cp "$src_file" "$target_file"
      fi
    elif ! diff -q "$src_file" "$target_file" > /dev/null 2>&1; then
      # Updated file (content differs)
      echo -e "  ${YELLOW}~ updated${NC}  $filename"
      ((UPDATED_COUNT++)) || true
      repo_changed=true
      if [ "$DRY_RUN" = false ]; then
        cp "$src_file" "$target_file"
      fi
    else
      ((UNCHANGED_COUNT++)) || true
    fi
  done

  if [ "$repo_changed" = true ]; then
    CHANGED_REPOS+=("$repo_name")
  else
    echo -e "  ${GREEN}(all files up to date)${NC}"
  fi

  echo ""
done

# ============================================================================
# Local Summary
# ============================================================================

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Local Sync Summary${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${BLUE}Repos scanned:${NC}  $REPO_COUNT"
echo -e "${GREEN}New files:${NC}      $NEW_COUNT"
echo -e "${YELLOW}Updated files:${NC}  $UPDATED_COUNT"
echo -e "Unchanged:      $UNCHANGED_COUNT"
echo ""

if [ ${#CHANGED_REPOS[@]} -gt 0 ]; then
  echo -e "${YELLOW}Repos with uncommitted changes:${NC}"
  for repo in "${CHANGED_REPOS[@]}"; do
    echo "  - $repo"
  done
  echo ""
  echo -e "${YELLOW}Review and commit changes in each repo as needed.${NC}"
  echo ""
fi

# ============================================================================
# Fleet Sync
# ============================================================================

if [ "$FLEET" = true ]; then
  echo -e "${CYAN}==========================================${NC}"
  echo -e "${CYAN}  Fleet Sync${NC}"
  echo -e "${CYAN}==========================================${NC}"
  echo ""

  FLEET_SUCCESS=0
  FLEET_FAIL=0
  declare -a FLEET_FAILED=()

  for machine in "${FLEET_MACHINES[@]}"; do
    # Skip current machine
    if [ "$machine" = "$CURRENT_HOST" ]; then
      echo -e "${BLUE}Skipping $machine (current host)${NC}"
      echo ""
      continue
    fi

    echo -e "${BLUE}-------------------------------------------${NC}"
    echo -e "${BLUE}Machine: $machine${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
      echo -e "  ${YELLOW}[DRY RUN]${NC} Would SSH to $machine and:"
      echo -e "    1. Pull crane-console (get latest commands + script)"
      echo -e "    2. Pull all *-console venture repos"
      echo -e "    3. Run sync-commands.sh locally"
      echo ""
      ((FLEET_SUCCESS++)) || true
      continue
    fi

    REMOTE_CMD=$(cat <<'REMOTEOF'
set -e

# Pull crane-console first (get latest commands + sync script)
if [ -d ~/dev/crane-console/.git ]; then
  echo "Pulling crane-console..."
  cd ~/dev/crane-console && git pull --ff-only
else
  echo "crane-console not found, skipping"
  exit 1
fi

# Pull all venture repos to prevent syncing into stale repos
echo ""
echo "Pulling venture repos..."
for d in ~/dev/*-console; do
  [ -d "$d/.git" ] || continue
  repo=$(basename "$d")
  [ "$repo" = "crane-console" ] && continue
  echo "  Pulling $repo..."
  cd "$d" && git pull --ff-only 2>/dev/null || echo "  (pull failed for $repo, skipping)"
done

# Run local sync
echo ""
echo "Running sync-commands.sh..."
bash ~/dev/crane-console/scripts/sync-commands.sh
REMOTEOF
)

    echo -e "  ${BLUE}Connecting...${NC}"

    if ssh -o ConnectTimeout=10 -o BatchMode=yes "$machine" "$REMOTE_CMD" 2>&1; then
      echo -e "  ${GREEN}Success${NC}"
      ((FLEET_SUCCESS++)) || true
    else
      echo -e "  ${RED}Failed${NC}"
      FLEET_FAILED+=("$machine")
      ((FLEET_FAIL++)) || true
    fi

    echo ""
  done

  # Fleet summary
  echo -e "${CYAN}==========================================${NC}"
  echo -e "${CYAN}  Fleet Summary${NC}"
  echo -e "${CYAN}==========================================${NC}"
  echo ""
  echo -e "${GREEN}Succeeded:${NC} $FLEET_SUCCESS"
  echo -e "${RED}Failed:${NC}    $FLEET_FAIL"
  echo ""

  if [ ${#FLEET_FAILED[@]} -gt 0 ]; then
    echo -e "${RED}Failed machines:${NC}"
    for machine in "${FLEET_FAILED[@]}"; do
      echo "  - $machine"
    done
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  1. Check SSH connectivity: ssh <machine> echo 'connected'"
    echo "  2. Check Tailscale status: tailscale status"
    echo "  3. Verify crane-console exists on target machine"
    echo ""
  fi
fi
