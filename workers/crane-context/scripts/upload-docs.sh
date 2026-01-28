#!/bin/bash
# Upload documentation to Context Worker
# Usage: ./scripts/upload-docs.sh

set -e

WORKER_URL="https://crane-context.automation-ab6.workers.dev"
ADMIN_KEY="${CRANE_ADMIN_KEY:-}"

# Check if key is set
if [ -z "$ADMIN_KEY" ]; then
  echo -e "${RED}Error: CRANE_ADMIN_KEY environment variable not set${NC}"
  echo "Get the key from Bitwarden and set it:"
  echo "  export CRANE_ADMIN_KEY=\"your-key-here\""
  exit 1
fi

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🚀 Uploading documentation to Context Worker..."
echo ""

# Function to upload a single document
upload_doc() {
  local scope=$1
  local doc_name=$2
  local file_path=$3
  local title=$4
  local description=$5
  local source_repo=$6
  local source_path=$7

  echo -n "Uploading ${scope}/${doc_name}... "

  # Read file content
  if [ ! -f "$file_path" ]; then
    echo -e "${RED}✗ File not found${NC}"
    return 1
  fi

  content=$(cat "$file_path")

  # Create JSON payload
  payload=$(jq -n \
    --arg scope "$scope" \
    --arg doc_name "$doc_name" \
    --arg content "$content" \
    --arg title "$title" \
    --arg description "$description" \
    --arg source_repo "$source_repo" \
    --arg source_path "$source_path" \
    --arg uploaded_by "upload-script" \
    '{
      scope: $scope,
      doc_name: $doc_name,
      content: $content,
      title: $title,
      description: $description,
      source_repo: $source_repo,
      source_path: $source_path,
      uploaded_by: $uploaded_by
    }')

  # Upload
  response=$(curl -s -X POST "${WORKER_URL}/admin/docs" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Key: ${ADMIN_KEY}" \
    -d "$payload")

  success=$(echo "$response" | jq -r '.success // false')

  if [ "$success" = "true" ]; then
    version=$(echo "$response" | jq -r '.version')
    created=$(echo "$response" | jq -r '.created')
    if [ "$created" = "true" ]; then
      echo -e "${GREEN}✓ Created (v${version})${NC}"
    else
      echo -e "${YELLOW}✓ Updated (v${version})${NC}"
    fi
  else
    error=$(echo "$response" | jq -r '.error // "Unknown error"')
    echo -e "${RED}✗ Failed: ${error}${NC}"
    return 1
  fi
}

# Upload global docs (process documentation)
echo "📁 Global Documentation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

upload_doc \
  "global" \
  "cc-cli-starting-prompts.md" \
  "../../docs/process/CC_CLI_STARTING_PROMPTS.md" \
  "Claude Code CLI Starting Prompts" \
  "Templates and guidance for starting Claude Code CLI sessions" \
  "crane-console" \
  "docs/process/CC_CLI_STARTING_PROMPTS.md"

upload_doc \
  "global" \
  "cc-cli-track-coordinator.md" \
  "../../docs/process/CC_CLI_TRACK_COORDINATOR.md" \
  "Claude Code CLI Track Coordinator Workflow" \
  "Complete workflow for Track Coordinator role using Claude Code CLI" \
  "crane-console" \
  "docs/process/CC_CLI_TRACK_COORDINATOR.md"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Documentation upload complete!${NC}"
echo ""

# List all uploaded docs
echo "📋 Verifying uploaded documentation..."
curl -s -X GET "${WORKER_URL}/admin/docs" \
  -H "X-Admin-Key: ${ADMIN_KEY}" | jq '.docs[] | "\(.scope)/\(.doc_name) (v\(.version))"'

echo ""
echo "Done! ✨"
