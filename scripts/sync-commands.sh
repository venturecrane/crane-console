#!/bin/bash
#
# Sync Enterprise Skills/Commands to Venture Repos
#
# Copies skills and commands from crane-console to every local ~/dev/*-console/
# repo for all three CLI agents:
#   - Claude Code: .claude/commands/*.md
#   - Codex CLI:   .agents/skills/*/SKILL.md
#   - Gemini CLI:  .gemini/commands/*.toml
#
# Additive merge: enterprise files are copied/overwritten, venture-specific
# commands are preserved. Global-only commands (cross-venture tools like
# content-scan, portfolio-review) are excluded via EXCLUDE_SKILLS.
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

# Source directories
CLAUDE_SOURCE="$REPO_ROOT/.claude/commands"
CODEX_SOURCE="$REPO_ROOT/.agents/skills"
GEMINI_SOURCE="$REPO_ROOT/.gemini/commands"

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

# Global-only skills that stay in crane-console (cross-venture tools).
# Keyed by skill name (no extension). Applied to all three CLIs.
EXCLUDE_SKILLS=(
  analytics
  content-scan
  enterprise-review
  new-venture
  portfolio-review
)

# Helper: check if a skill name is excluded
is_excluded() {
  local name="$1"
  for excluded in "${EXCLUDE_SKILLS[@]}"; do
    if [ "$name" = "$excluded" ]; then
      return 0
    fi
  done
  return 1
}

# ============================================================================
# Validation
# ============================================================================

if [ ! -d "$CLAUDE_SOURCE" ]; then
  echo -e "${RED}Error: Claude source not found: $CLAUDE_SOURCE${NC}"
  exit 1
fi

CLAUDE_FILES=("$CLAUDE_SOURCE"/*.md)
if [ ! -f "${CLAUDE_FILES[0]}" ]; then
  echo -e "${RED}Error: No .md files found in $CLAUDE_SOURCE${NC}"
  exit 1
fi

# Count source files per CLI
CODEX_SKILLS=()
if [ -d "$CODEX_SOURCE" ]; then
  for skill_dir in "$CODEX_SOURCE"/*/; do
    [ -f "${skill_dir}SKILL.md" ] && CODEX_SKILLS+=("$skill_dir")
  done
fi

GEMINI_FILES=()
if [ -d "$GEMINI_SOURCE" ]; then
  for toml_file in "$GEMINI_SOURCE"/*.toml; do
    [ -f "$toml_file" ] && GEMINI_FILES+=("$toml_file")
  done
fi

# ============================================================================
# Local Sync
# ============================================================================

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Sync Enterprise Skills & Commands${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${BLUE}Sources:${NC}"
echo -e "  Claude:  ${#CLAUDE_FILES[@]} commands"
echo -e "  Codex:   ${#CODEX_SKILLS[@]} skills"
echo -e "  Gemini:  ${#GEMINI_FILES[@]} commands"
echo -e "${BLUE}Excluded:${NC} ${#EXCLUDE_SKILLS[@]} global-only skills"
echo -e "${BLUE}Dry Run:${NC}  $DRY_RUN"
echo -e "${BLUE}Fleet:${NC}    $FLEET"
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

  repo_changed=false

  # ------------------------------------------------------------------
  # Claude Code: .claude/commands/*.md
  # ------------------------------------------------------------------
  CLAUDE_TARGET="$repo_dir/.claude/commands"

  if [ "$DRY_RUN" = false ]; then
    mkdir -p "$CLAUDE_TARGET"
  fi

  for src_file in "${CLAUDE_FILES[@]}"; do
    filename=$(basename "$src_file")
    skill_name="${filename%.md}"
    target_file="$CLAUDE_TARGET/$filename"

    if is_excluded "$skill_name"; then
      continue
    fi

    if [ ! -f "$target_file" ]; then
      echo -e "  ${GREEN}+ new${NC}      claude  $filename"
      ((NEW_COUNT++)) || true
      repo_changed=true
      if [ "$DRY_RUN" = false ]; then
        cp "$src_file" "$target_file"
      fi
    elif ! diff -q "$src_file" "$target_file" > /dev/null 2>&1; then
      echo -e "  ${YELLOW}~ updated${NC}  claude  $filename"
      ((UPDATED_COUNT++)) || true
      repo_changed=true
      if [ "$DRY_RUN" = false ]; then
        cp "$src_file" "$target_file"
      fi
    else
      ((UNCHANGED_COUNT++)) || true
    fi
  done

  # ------------------------------------------------------------------
  # Codex CLI: .agents/skills/*/SKILL.md
  # ------------------------------------------------------------------
  if [ ${#CODEX_SKILLS[@]} -gt 0 ]; then
    CODEX_TARGET="$repo_dir/.agents/skills"

    for skill_dir in "${CODEX_SKILLS[@]}"; do
      skill_name=$(basename "$skill_dir")
      src_file="${skill_dir}SKILL.md"
      target_dir="$CODEX_TARGET/$skill_name"
      target_file="$target_dir/SKILL.md"

      if is_excluded "$skill_name"; then
        continue
      fi

      if [ "$DRY_RUN" = false ]; then
        mkdir -p "$target_dir"
      fi

      if [ ! -f "$target_file" ]; then
        echo -e "  ${GREEN}+ new${NC}      codex   $skill_name/SKILL.md"
        ((NEW_COUNT++)) || true
        repo_changed=true
        if [ "$DRY_RUN" = false ]; then
          cp "$src_file" "$target_file"
        fi
      elif ! diff -q "$src_file" "$target_file" > /dev/null 2>&1; then
        echo -e "  ${YELLOW}~ updated${NC}  codex   $skill_name/SKILL.md"
        ((UPDATED_COUNT++)) || true
        repo_changed=true
        if [ "$DRY_RUN" = false ]; then
          cp "$src_file" "$target_file"
        fi
      else
        ((UNCHANGED_COUNT++)) || true
      fi
    done
  fi

  # ------------------------------------------------------------------
  # Gemini CLI: .gemini/commands/*.toml
  # ------------------------------------------------------------------
  if [ ${#GEMINI_FILES[@]} -gt 0 ]; then
    GEMINI_TARGET="$repo_dir/.gemini/commands"

    if [ "$DRY_RUN" = false ]; then
      mkdir -p "$GEMINI_TARGET"
    fi

    for src_file in "${GEMINI_FILES[@]}"; do
      filename=$(basename "$src_file")
      skill_name="${filename%.toml}"
      target_file="$GEMINI_TARGET/$filename"

      if is_excluded "$skill_name"; then
        continue
      fi

      if [ ! -f "$target_file" ]; then
        echo -e "  ${GREEN}+ new${NC}      gemini  $filename"
        ((NEW_COUNT++)) || true
        repo_changed=true
        if [ "$DRY_RUN" = false ]; then
          cp "$src_file" "$target_file"
        fi
      elif ! diff -q "$src_file" "$target_file" > /dev/null 2>&1; then
        echo -e "  ${YELLOW}~ updated${NC}  gemini  $filename"
        ((UPDATED_COUNT++)) || true
        repo_changed=true
        if [ "$DRY_RUN" = false ]; then
          cp "$src_file" "$target_file"
        fi
      else
        ((UNCHANGED_COUNT++)) || true
      fi
    done
  fi

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
      echo -e "    3. Run sync-commands.sh locally (syncs Claude, Codex, Gemini)"
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
