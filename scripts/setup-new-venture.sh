#!/bin/bash
#
# Setup a New Venture with Crane Infrastructure
#
# This script automates the setup of a new venture with all Crane infrastructure:
# - Creates GitHub repo with template structure
# - Creates standard labels and project board
# - Updates crane-classifier with installation ID
# - Updates sod-universal.sh with venture mapping
# - Deploys to all dev machines
#
# Usage: ./scripts/setup-new-venture.sh <venture-code> <github-org> <installation-id>
# Example: ./scripts/setup-new-venture.sh xyz xyz-ventures 123456789
#
# Prerequisites:
# - gh CLI installed and authenticated
# - SSH access to dev machines (smdmbp27, smdThink, ubuntu)
# - GitHub App "Crane Relay" installed on org (get installation ID from settings)
#
# Manual Steps Required BEFORE Running:
# 1. Create GitHub organization (cannot be automated)
# 2. Install "Crane Relay" GitHub App on the org
# 3. Note the installation ID from app settings
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

# Script directory (for relative paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
VENTURE_CODE="${1:-}"
GITHUB_ORG="${2:-}"
INSTALLATION_ID="${3:-}"
DRY_RUN="${DRY_RUN:-false}"

# ============================================================================
# Validation
# ============================================================================

print_usage() {
  echo "Usage: $0 <venture-code> <github-org> <installation-id>"
  echo ""
  echo "Arguments:"
  echo "  venture-code     2-3 letter code (e.g., smd, dfg, ke)"
  echo "  github-org       GitHub organization name (e.g., smdurgan)"
  echo "  installation-id  GitHub App installation ID (from app settings)"
  echo ""
  echo "Environment Variables:"
  echo "  DRY_RUN=true     Preview actions without executing"
  echo ""
  echo "Example:"
  echo "  $0 xyz xyz-ventures 123456789"
  echo ""
  echo "Prerequisites:"
  echo "  1. Create GitHub org manually (cannot be automated)"
  echo "  2. Install 'Crane Relay' GitHub App on org"
  echo "  3. Get installation ID from GitHub App settings"
}

if [ -z "$VENTURE_CODE" ] || [ -z "$GITHUB_ORG" ] || [ -z "$INSTALLATION_ID" ]; then
  echo -e "${RED}Error: Missing required arguments${NC}"
  echo ""
  print_usage
  exit 1
fi

# Validate venture code format (2-3 lowercase letters)
if ! [[ "$VENTURE_CODE" =~ ^[a-z]{2,3}$ ]]; then
  echo -e "${RED}Error: Venture code must be 2-3 lowercase letters${NC}"
  echo "  Got: $VENTURE_CODE"
  exit 1
fi

# Validate installation ID format (numeric)
if ! [[ "$INSTALLATION_ID" =~ ^[0-9]+$ ]]; then
  echo -e "${RED}Error: Installation ID must be numeric${NC}"
  echo "  Got: $INSTALLATION_ID"
  exit 1
fi

# Check gh CLI
if ! command -v gh &> /dev/null; then
  echo -e "${RED}Error: gh CLI is required but not installed${NC}"
  echo "  Install: brew install gh"
  exit 1
fi

# Check gh authentication
if ! gh auth status &> /dev/null 2>&1; then
  echo -e "${RED}Error: gh CLI not authenticated${NC}"
  echo "  Run: gh auth login"
  exit 1
fi

# Derived values
CONSOLE_REPO="${VENTURE_CODE}-console"
FULL_REPO="${GITHUB_ORG}/${CONSOLE_REPO}"

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  New Venture Setup: ${VENTURE_CODE}${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${BLUE}Venture Code:${NC}     $VENTURE_CODE"
echo -e "${BLUE}GitHub Org:${NC}       $GITHUB_ORG"
echo -e "${BLUE}Console Repo:${NC}     $CONSOLE_REPO"
echo -e "${BLUE}Installation ID:${NC}  $INSTALLATION_ID"
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
# Step 1: Create GitHub Repository
# ============================================================================

echo -e "${CYAN}### Step 1: Create GitHub Repository${NC}"
echo ""

# Check if repo already exists
if gh repo view "$FULL_REPO" &> /dev/null 2>&1; then
  echo -e "${YELLOW}Repository $FULL_REPO already exists - skipping creation${NC}"
else
  run_cmd "Creating repository $FULL_REPO..." \
    gh repo create "$FULL_REPO" --public --description "Console for $VENTURE_CODE venture"
fi

echo ""

# ============================================================================
# Step 2: Initialize Repository Structure
# ============================================================================

echo -e "${CYAN}### Step 2: Initialize Repository Structure${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}[DRY RUN] Would create directory structure:${NC}"
  echo "  .claude/commands/"
  echo "  .github/ISSUE_TEMPLATE/"
  echo "  docs/adr/"
  echo "  docs/pm/"
  echo "  docs/process/"
  echo "  scripts/"
else
  # Clone the new repo temporarily
  TEMP_DIR=$(mktemp -d)
  echo -e "${BLUE}Cloning repo to initialize structure...${NC}"

  gh repo clone "$FULL_REPO" "$TEMP_DIR/$CONSOLE_REPO" 2>/dev/null || true
  cd "$TEMP_DIR/$CONSOLE_REPO"

  # Create directory structure
  mkdir -p .claude/commands
  mkdir -p .github/ISSUE_TEMPLATE
  mkdir -p docs/adr
  mkdir -p docs/pm
  mkdir -p docs/process
  mkdir -p scripts

  # Create basic CLAUDE.md
  cat > CLAUDE.md << EOF
# CLAUDE.md - ${VENTURE_CODE^^} Console

This file provides guidance for Claude Code agents working in this repository.

## About This Repository

${VENTURE_CODE^^} Console is the central infrastructure and documentation hub for the $VENTURE_CODE venture.

## Session Start

Always run \`/sod\` at the start of every session.

## Common Commands

\`\`\`bash
/sod                    # Start of day - load context
/eod                    # End of day - create handoff
/commit                 # Create commit with good message
\`\`\`

## Build Commands

TBD - add venture-specific build commands here.
EOF

  # Create basic README
  cat > README.md << EOF
# ${VENTURE_CODE^^} Console

Central infrastructure and documentation hub for the $VENTURE_CODE venture.

## Quick Start

\`\`\`bash
# Start a work session
/sod

# End a work session
/eod
\`\`\`

## Directory Structure

\`\`\`
${CONSOLE_REPO}/
├── .claude/commands/     # Claude Code slash commands
├── .github/              # Issue templates, workflows
├── docs/                 # Documentation
│   ├── adr/              # Architecture Decision Records
│   ├── pm/               # PM documents (PRD, specs)
│   └── process/          # Process documentation
└── scripts/              # Utility scripts
\`\`\`
EOF

  # Copy slash commands from crane-console
  if [ -f "$REPO_ROOT/.claude/commands/sod.md" ]; then
    cp "$REPO_ROOT/.claude/commands/sod.md" .claude/commands/
  fi
  if [ -f "$REPO_ROOT/.claude/commands/eod.md" ]; then
    cp "$REPO_ROOT/.claude/commands/eod.md" .claude/commands/
  fi
  if [ -f "$REPO_ROOT/.claude/commands/heartbeat.md" ]; then
    cp "$REPO_ROOT/.claude/commands/heartbeat.md" .claude/commands/
  fi
  if [ -f "$REPO_ROOT/.claude/commands/update.md" ]; then
    cp "$REPO_ROOT/.claude/commands/update.md" .claude/commands/
  fi
  if [ -f "$REPO_ROOT/.claude/commands/status.md" ]; then
    cp "$REPO_ROOT/.claude/commands/status.md" .claude/commands/
  fi

  # Copy sod-universal.sh
  if [ -f "$REPO_ROOT/scripts/sod-universal.sh" ]; then
    cp "$REPO_ROOT/scripts/sod-universal.sh" scripts/
  fi

  # Create .gitkeep files for empty directories
  touch docs/adr/.gitkeep
  touch docs/pm/.gitkeep
  touch docs/process/.gitkeep

  # Commit and push
  git add -A
  git commit -m "chore: initialize ${VENTURE_CODE} console structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" || true

  git push origin main || git push origin master || true

  cd "$REPO_ROOT"
  rm -rf "$TEMP_DIR"

  echo -e "  ${GREEN}Repository structure initialized${NC}"
fi

echo ""

# ============================================================================
# Step 3: Create Standard Labels
# ============================================================================

echo -e "${CYAN}### Step 3: Create Standard Labels${NC}"
echo ""

# Label definitions: name|color|description
LABELS=(
  "prio:P0|d73a4a|Drop everything - critical issue"
  "prio:P1|ff6b6b|High priority - address this week"
  "prio:P2|ffd93d|Medium priority - address this sprint"
  "prio:P3|6c757d|Low priority - backlog"
  "status:triage|c5def5|Needs triage and acceptance criteria"
  "status:ready|0e8a16|Ready for development"
  "status:in-progress|1d76db|Currently being worked on"
  "status:blocked|b60205|Blocked by external dependency"
  "status:qa|fbca04|Ready for QA verification"
  "status:done|0e8a16|Completed and verified"
  "type:feature|a2eeef|New feature or enhancement"
  "type:bug|d73a4a|Bug fix"
  "type:tech-debt|fef2c0|Technical debt cleanup"
  "type:docs|0075ca|Documentation"
  "qa:0|bfdadc|Automated only - CI/tests cover it"
  "qa:1|c2e0c6|CLI/API verifiable"
  "qa:2|fff3cd|Light visual spot-check"
  "qa:3|f8d7da|Full visual walkthrough"
  "automation:graded|ededed|Auto-classified by Crane"
)

for label_def in "${LABELS[@]}"; do
  IFS='|' read -r name color description <<< "$label_def"

  if [ "$DRY_RUN" = "true" ]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} Would create label: $name"
  else
    gh label create "$name" --repo "$FULL_REPO" --color "$color" --description "$description" 2>/dev/null || \
    gh label edit "$name" --repo "$FULL_REPO" --color "$color" --description "$description" 2>/dev/null || true
    echo -e "  ${GREEN}Created/updated:${NC} $name"
  fi
done

echo ""

# ============================================================================
# Step 4: Create Project Board
# ============================================================================

echo -e "${CYAN}### Step 4: Create Project Board${NC}"
echo ""

PROJECT_NAME="${VENTURE_CODE^^} Sprint Board"

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} Would create project: $PROJECT_NAME"
else
  # Check if project exists
  EXISTING_PROJECT=$(gh project list --owner "$GITHUB_ORG" --format json 2>/dev/null | jq -r ".projects[] | select(.title == \"$PROJECT_NAME\") | .number" 2>/dev/null || echo "")

  if [ -n "$EXISTING_PROJECT" ]; then
    echo -e "  ${YELLOW}Project '$PROJECT_NAME' already exists (#{$EXISTING_PROJECT})${NC}"
  else
    # Create project
    gh project create --owner "$GITHUB_ORG" --title "$PROJECT_NAME" 2>/dev/null && \
      echo -e "  ${GREEN}Created project: $PROJECT_NAME${NC}" || \
      echo -e "  ${YELLOW}Could not create project (may need manual setup)${NC}"
  fi
fi

echo ""

# ============================================================================
# Step 5: Update crane-classifier
# ============================================================================

echo -e "${CYAN}### Step 5: Update crane-classifier Configuration${NC}"
echo ""

WRANGLER_TOML="$REPO_ROOT/workers/crane-classifier/wrangler.toml"

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} Would add to GH_INSTALLATIONS_JSON: \"$GITHUB_ORG\":\"$INSTALLATION_ID\""
else
  # Read current installations JSON
  CURRENT_JSON=$(grep 'GH_INSTALLATIONS_JSON' "$WRANGLER_TOML" | sed "s/.*= '//;s/'$//")

  # Check if org already exists
  if echo "$CURRENT_JSON" | grep -q "\"$GITHUB_ORG\""; then
    echo -e "  ${YELLOW}$GITHUB_ORG already in wrangler.toml - updating installation ID${NC}"
    # Update existing entry
    NEW_JSON=$(echo "$CURRENT_JSON" | sed "s/\"$GITHUB_ORG\":\"[^\"]*\"/\"$GITHUB_ORG\":\"$INSTALLATION_ID\"/")
  else
    # Add new entry (before closing brace)
    NEW_JSON=$(echo "$CURRENT_JSON" | sed "s/}$/,\"$GITHUB_ORG\":\"$INSTALLATION_ID\"}/")
  fi

  # Update wrangler.toml
  sed -i.bak "s|GH_INSTALLATIONS_JSON = '.*'|GH_INSTALLATIONS_JSON = '$NEW_JSON'|" "$WRANGLER_TOML"
  rm -f "${WRANGLER_TOML}.bak"

  echo -e "  ${GREEN}Updated wrangler.toml${NC}"
fi

echo ""

# ============================================================================
# Step 6: Update crane-context VENTURE_CONFIG
# ============================================================================

echo -e "${CYAN}### Step 6: Update crane-context Venture Registry${NC}"
echo ""

CONSTANTS_FILE="$REPO_ROOT/workers/crane-context/src/constants.ts"

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} Would add to VENTURE_CONFIG: $VENTURE_CODE: { name: '...', org: '$GITHUB_ORG' }"
  echo -e "  ${YELLOW}[DRY RUN]${NC} Would add to VENTURES array: '$VENTURE_CODE'"
else
  # Check if venture already exists
  if grep -q "\"$VENTURE_CODE\":" "$CONSTANTS_FILE" || grep -q "'$VENTURE_CODE':" "$CONSTANTS_FILE"; then
    echo -e "  ${YELLOW}$VENTURE_CODE already in VENTURE_CONFIG${NC}"
  else
    # Add to VENTURE_CONFIG (before closing brace)
    # Convert venture code to title case for name
    VENTURE_NAME=$(echo "$GITHUB_ORG" | sed 's/.*/\u&/')
    sed -i.bak "s/} as const;/  $VENTURE_CODE: { name: '$VENTURE_NAME', org: '$GITHUB_ORG' },\n} as const;/" "$CONSTANTS_FILE"

    # Add to VENTURES array
    sed -i.bak "s/export const VENTURES = \[/export const VENTURES = ['$VENTURE_CODE', /" "$CONSTANTS_FILE"

    rm -f "${CONSTANTS_FILE}.bak"
    echo -e "  ${GREEN}Added $VENTURE_CODE to VENTURE_CONFIG${NC}"
  fi
fi

echo ""

# ============================================================================
# Step 7: Update upload-doc-to-context-worker.sh
# ============================================================================

echo -e "${CYAN}### Step 7: Update upload-doc-to-context-worker.sh${NC}"
echo ""

UPLOAD_SCRIPT="$REPO_ROOT/scripts/upload-doc-to-context-worker.sh"

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} Would add scope: *$GITHUB_ORG/${CONSOLE_REPO}*) SCOPE=\"$VENTURE_CODE\""
else
  # Check if mapping already exists
  if grep -q "$GITHUB_ORG/$CONSOLE_REPO" "$UPLOAD_SCRIPT"; then
    echo -e "  ${YELLOW}$GITHUB_ORG already in upload-doc-to-context-worker.sh${NC}"
  else
    # Add new case before the wildcard
    sed -i.bak "s|        \*)|\*$GITHUB_ORG/$CONSOLE_REPO\*)\n          SCOPE=\"$VENTURE_CODE\"\n          ;;\n        *)|" "$UPLOAD_SCRIPT"
    rm -f "${UPLOAD_SCRIPT}.bak"
    echo -e "  ${GREEN}Added scope mapping${NC}"
  fi
fi

echo ""

# ============================================================================
# Step 8: Deploy Cloudflare Workers
# ============================================================================

echo -e "${CYAN}### Step 8: Deploy Cloudflare Workers${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "  ${YELLOW}[DRY RUN]${NC} Would deploy crane-context"
  echo -e "  ${YELLOW}[DRY RUN]${NC} Would deploy crane-classifier"
else
  # Deploy crane-context first (venture registry)
  cd "$REPO_ROOT/workers/crane-context"
  echo -e "${BLUE}Deploying crane-context...${NC}"
  if npx wrangler deploy 2>&1; then
    echo -e "  ${GREEN}crane-context deployed${NC}"
  else
    echo -e "  ${YELLOW}crane-context deployment failed - may need manual deploy${NC}"
  fi

  # Deploy crane-classifier
  cd "$REPO_ROOT/workers/crane-classifier"
  echo -e "${BLUE}Deploying crane-classifier...${NC}"
  if npx wrangler deploy 2>&1; then
    echo -e "  ${GREEN}crane-classifier deployed${NC}"
  else
    echo -e "  ${YELLOW}crane-classifier deployment failed - may need manual deploy${NC}"
  fi

  cd "$REPO_ROOT"
fi

echo ""

# ============================================================================
# Step 9: Deploy to Fleet
# ============================================================================

echo -e "${CYAN}### Step 9: Clone to Dev Machines${NC}"
echo ""

if [ -f "$SCRIPT_DIR/deploy-to-fleet.sh" ]; then
  if [ "$DRY_RUN" = "true" ]; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} Would run: deploy-to-fleet.sh $GITHUB_ORG $CONSOLE_REPO"
  else
    bash "$SCRIPT_DIR/deploy-to-fleet.sh" "$GITHUB_ORG" "$CONSOLE_REPO"
  fi
else
  echo -e "  ${YELLOW}deploy-to-fleet.sh not found - skipping fleet deployment${NC}"
  echo -e "  Run manually: git clone https://github.com/$FULL_REPO on each machine"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Setup Complete!${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${GREEN}Automated steps completed:${NC}"
echo "  - Repository created: $FULL_REPO"
echo "  - Directory structure initialized"
echo "  - Labels created"
echo "  - Project board created"
echo "  - crane-context updated (venture registry)"
echo "  - crane-classifier updated (installation ID)"
echo "  - Workers deployed"
echo "  - upload-doc-to-context-worker.sh updated"
echo "  - Repo cloned to dev machines"
echo ""
echo -e "${YELLOW}Manual steps remaining:${NC}"
echo "  1. Verify crane-classifier deployment:"
echo "     curl https://crane-classifier.automation-ab6.workers.dev/health"
echo ""
echo "  2. Test auto-classification:"
echo "     gh issue create --repo $FULL_REPO --title \"TEST: Classifier\" --body \"AC: test\""
echo ""
echo "  3. Seed venture documentation:"
echo "     CRANE_ADMIN_KEY=\$KEY ./scripts/upload-doc-to-context-worker.sh docs/my-doc.md $VENTURE_CODE"
echo ""
echo "  4. Test /sod on a dev machine:"
echo "     ssh smdmbp27 \"cd ~/dev/$CONSOLE_REPO && claude\""
echo ""
echo -e "${BLUE}Quick Reference:${NC}"
echo "  Venture Code:     $VENTURE_CODE"
echo "  GitHub Org:       $GITHUB_ORG"
echo "  Console Repo:     https://github.com/$FULL_REPO"
echo "  Installation ID:  $INSTALLATION_ID"
echo ""
