#!/bin/bash
#
# Sync Enterprise Skills/Commands to Venture Repos
#
# Single-source: .claude/commands/*.md files are the canonical source.
# This script generates Gemini TOML and Codex SKILL.md from CC markdown,
# then copies all three formats to every local ~/dev/*-console/ repo.
#
# Manual commands (sprint, orchestrate) maintain separate files per agent
# because their execution models fundamentally differ.
#
# Usage: ./scripts/sync-commands.sh [--dry-run] [--fleet] [--check] [--generate-only]
#
# Flags:
#   --dry-run        Preview changes without writing files
#   --fleet          Also sync to remote fleet machines via SSH
#   --check          Verify generated files match committed files (CI mode)
#   --generate-only  Generate Gemini/Codex files in crane-console only, skip repo sync
#
# Examples:
#   ./scripts/sync-commands.sh --check            # CI: verify no drift
#   ./scripts/sync-commands.sh --generate-only    # Regenerate local files only
#   ./scripts/sync-commands.sh --dry-run          # Preview local changes
#   ./scripts/sync-commands.sh                    # Sync to local repos
#   ./scripts/sync-commands.sh --fleet            # Sync local + remote machines
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
CHECK=false
GENERATE_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)       DRY_RUN=true ;;
    --fleet)         FLEET=true ;;
    --check)         CHECK=true ;;
    --generate-only) GENERATE_ONLY=true ;;
    *)
      echo -e "${RED}Unknown flag: $arg${NC}"
      echo "Usage: $0 [--dry-run] [--fleet] [--check] [--generate-only]"
      exit 1
      ;;
  esac
done

# Fleet machines (SSH hosts)
FLEET_MACHINES=(mbp27 think mini m16)
CURRENT_HOST=$(hostname -s)

# Global-only skills that stay in crane-console (cross-venture tools).
# Single source of truth: config/skill-exclusions.json
# Read JSON array into bash array (jq strips quotes, one name per line)
EXCLUDE_SKILLS=()
EXCLUSION_FILE="$REPO_ROOT/config/skill-exclusions.json"
if [ -f "$EXCLUSION_FILE" ]; then
  while IFS= read -r name; do
    EXCLUDE_SKILLS+=("$name")
  done < <(jq -r '.[]' "$EXCLUSION_FILE")
else
  echo "Warning: $EXCLUSION_FILE not found, using empty exclusion list"
fi

# Commands where the execution model fundamentally differs between agents.
# These maintain separate hand-written files per agent format.
# CC markdown is NOT auto-converted for these; existing Gemini/Codex files are used as-is.
MANUAL_COMMANDS=(
  sprint
  orchestrate
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

# Helper: check if a command is manual (separate files per agent)
is_manual() {
  local name="$1"
  for manual in "${MANUAL_COMMANDS[@]}"; do
    if [ "$name" = "$manual" ]; then
      return 0
    fi
  done
  return 1
}

# ============================================================================
# Conversion Functions: CC Markdown -> Gemini TOML / Codex SKILL.md
# ============================================================================

# Convert a CC markdown command to Gemini TOML format.
# Args: $1 = path to .claude/commands/{name}.md, $2 = output path
convert_to_toml() {
  local src="$1"
  local dst="$2"

  # Extract description from first non-empty line (strip "# /name - " prefix)
  local description
  description=$(head -1 "$src" | sed 's/^# *//' | sed 's/^\/[a-z_-]* - //' | sed 's/^\/[a-z_-]* //')

  # Get the full content (skip the first heading line for the prompt body)
  local content
  content=$(tail -n +2 "$src")

  # Write TOML
  {
    printf 'description = "%s"\n\n' "$description"
    printf 'prompt = """\n'
    printf '%s\n' "$content"
    printf '"""\n'
  } > "$dst"
}

# Convert a CC markdown command to Codex SKILL.md format.
# Args: $1 = path to .claude/commands/{name}.md, $2 = output directory
convert_to_skill() {
  local src="$1"
  local dst_dir="$2"
  local skill_name
  skill_name=$(basename "$src" .md)

  mkdir -p "$dst_dir"

  # Extract description from first non-empty line
  local description
  description=$(head -1 "$src" | sed 's/^# *//' | sed 's/^\/[a-z_-]* - //' | sed 's/^\/[a-z_-]* //')

  # Get the full content
  local content
  content=$(cat "$src")

  # Write SKILL.md with YAML frontmatter
  {
    printf -- '---\n'
    printf 'name: %s\n' "$skill_name"
    printf 'description: %s\n' "$description"
    printf -- '---\n\n'
    printf '%s\n' "$content"
  } > "$dst_dir/SKILL.md"
}

# ============================================================================
# Generation: CC -> Gemini TOML + Codex SKILL.md
# ============================================================================

generate_from_cc() {
  local target_gemini="$1"
  local target_codex="$2"
  local gen_count=0

  for src_file in "$CLAUDE_SOURCE"/*.md; do
    [ -f "$src_file" ] || continue

    local filename
    filename=$(basename "$src_file")
    local skill_name="${filename%.md}"

    # Skip manual commands (separate files per agent)
    if is_manual "$skill_name"; then
      continue
    fi

    # Generate Gemini TOML
    convert_to_toml "$src_file" "$target_gemini/${skill_name}.toml"

    # Generate Codex SKILL.md
    convert_to_skill "$src_file" "$target_codex/${skill_name}"

    ((gen_count++)) || true
  done

  echo "$gen_count"
}

# ============================================================================
# Check Mode: verify generated files match committed files
# ============================================================================

if [ "$CHECK" = true ]; then
  echo -e "${CYAN}==========================================${NC}"
  echo -e "${CYAN}  Checking Generated Files (CI Mode)${NC}"
  echo -e "${CYAN}==========================================${NC}"
  echo ""

  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT

  mkdir -p "$TMPDIR/gemini" "$TMPDIR/codex"
  gen_count=$(generate_from_cc "$TMPDIR/gemini" "$TMPDIR/codex")
  echo -e "${BLUE}Generated $gen_count commands to temp dir${NC}"

  DRIFT_COUNT=0

  # Check Gemini TOML files
  for gen_file in "$TMPDIR/gemini"/*.toml; do
    [ -f "$gen_file" ] || continue
    local_name=$(basename "$gen_file")
    committed="$GEMINI_SOURCE/$local_name"

    if [ ! -f "$committed" ]; then
      echo -e "  ${RED}MISSING${NC}  gemini  $local_name (not committed)"
      ((DRIFT_COUNT++)) || true
    elif ! diff -q "$gen_file" "$committed" > /dev/null 2>&1; then
      echo -e "  ${RED}DRIFT${NC}    gemini  $local_name"
      diff --unified=3 "$committed" "$gen_file" | head -20
      ((DRIFT_COUNT++)) || true
    else
      echo -e "  ${GREEN}OK${NC}       gemini  $local_name"
    fi
  done

  # Check Codex SKILL.md files
  for gen_dir in "$TMPDIR/codex"/*/; do
    [ -d "$gen_dir" ] || continue
    local_name=$(basename "$gen_dir")
    gen_file="${gen_dir}SKILL.md"
    committed="$CODEX_SOURCE/$local_name/SKILL.md"

    if [ ! -f "$committed" ]; then
      echo -e "  ${RED}MISSING${NC}  codex   $local_name/SKILL.md (not committed)"
      ((DRIFT_COUNT++)) || true
    elif ! diff -q "$gen_file" "$committed" > /dev/null 2>&1; then
      echo -e "  ${RED}DRIFT${NC}    codex   $local_name/SKILL.md"
      diff --unified=3 "$committed" "$gen_file" | head -20
      ((DRIFT_COUNT++)) || true
    else
      echo -e "  ${GREEN}OK${NC}       codex   $local_name/SKILL.md"
    fi
  done

  echo ""
  if [ "$DRIFT_COUNT" -gt 0 ]; then
    echo -e "${RED}$DRIFT_COUNT file(s) have drifted from CC source.${NC}"
    echo -e "Run: ${YELLOW}./scripts/sync-commands.sh --generate-only${NC} to regenerate."
    exit 1
  else
    echo -e "${GREEN}All generated files match committed files.${NC}"
    exit 0
  fi
fi

# ============================================================================
# Generate: update Gemini/Codex files in crane-console from CC source
# ============================================================================

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Generating Gemini/Codex from CC Source${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY RUN - skipping generation${NC}"
  echo ""
  GEN_COUNT=0
else
  GEN_COUNT=$(generate_from_cc "$GEMINI_SOURCE" "$CODEX_SOURCE")
  echo -e "${GREEN}Generated $GEN_COUNT commands (Gemini TOML + Codex SKILL.md)${NC}"
  echo -e "${BLUE}Manual commands (not generated):${NC} ${MANUAL_COMMANDS[*]}"
  echo ""
fi

if [ "$GENERATE_ONLY" = true ]; then
  echo -e "${GREEN}Done (--generate-only). Skipping repo sync.${NC}"
  exit 0
fi

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

REMOVED_COUNT=0
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

  # Remove stale Claude commands (files in target that no longer exist in source)
  if [ -d "$CLAUDE_TARGET" ]; then
    for target_file in "$CLAUDE_TARGET"/*.md; do
      [ -f "$target_file" ] || continue
      filename=$(basename "$target_file")
      if [ ! -f "$CLAUDE_SOURCE/$filename" ]; then
        echo -e "  ${RED}- stale${NC}    claude  $filename"
        ((REMOVED_COUNT++)) || true
        repo_changed=true
        if [ "$DRY_RUN" = false ]; then
          rm "$target_file"
        fi
      fi
    done
  fi

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

    # Remove stale Codex skills (dirs in target that no longer exist in source)
    if [ -d "$CODEX_TARGET" ]; then
      for target_dir in "$CODEX_TARGET"/*/; do
        [ -d "$target_dir" ] || continue
        skill_name=$(basename "$target_dir")
        if [ ! -d "$CODEX_SOURCE/$skill_name" ]; then
          echo -e "  ${RED}- stale${NC}    codex   $skill_name/"
          ((REMOVED_COUNT++)) || true
          repo_changed=true
          if [ "$DRY_RUN" = false ]; then
            rm -rf "$target_dir"
          fi
        fi
      done
    fi
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

    # Remove stale Gemini commands (files in target that no longer exist in source)
    if [ -d "$GEMINI_TARGET" ]; then
      for target_file in "$GEMINI_TARGET"/*.toml; do
        [ -f "$target_file" ] || continue
        filename=$(basename "$target_file")
        if [ ! -f "$GEMINI_SOURCE/$filename" ]; then
          echo -e "  ${RED}- stale${NC}    gemini  $filename"
          ((REMOVED_COUNT++)) || true
          repo_changed=true
          if [ "$DRY_RUN" = false ]; then
            rm "$target_file"
          fi
        fi
      done
    fi
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
echo -e "${RED}Removed stale:${NC}  $REMOVED_COUNT"
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
