#!/bin/bash
#
# Extract Design Tokens from CSS
#
# Reads a CSS file with CSS custom properties in :root and outputs
# structured markdown token tables. Used to regenerate token sections
# of a venture's design-spec.md.
#
# Usage:
#   bash scripts/extract-design-tokens.sh <css-file> <prefix>
#
# Arguments:
#   css-file: Path to CSS file with :root custom properties
#   prefix:   Venture prefix to filter (e.g., --vc-, --ke-, --dc-)
#
# Examples:
#   bash scripts/extract-design-tokens.sh ~/dev/vc-web/src/styles/global.css --vc-
#   bash scripts/extract-design-tokens.sh ~/dev/ke-console/app/src/app/globals.css --ke-
#   bash scripts/extract-design-tokens.sh ~/dev/dc-console/web/src/app/globals.css --dc-
#
# Output: Markdown-formatted token tables to stdout.
#
# Note: This reads the SOURCE CSS with :root custom properties.
#       If using Tailwind v4 @theme, point at the globals.css that
#       contains the :root block, not compiled output.
#

set -e

# Colors (for stderr messages only)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CSS_FILE="${1:-}"
PREFIX="${2:-}"

if [ -z "$CSS_FILE" ] || [ -z "$PREFIX" ]; then
  echo "Usage: $0 <css-file> <prefix>" >&2
  echo "" >&2
  echo "Arguments:" >&2
  echo "  css-file  Path to CSS file with :root custom properties" >&2
  echo "  prefix    Venture prefix to filter (e.g., --vc-, --ke-, --dc-)" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  $0 ~/dev/vc-web/src/styles/global.css --vc-" >&2
  echo "  $0 ~/dev/ke-console/app/src/app/globals.css --ke-" >&2
  exit 1
fi

if [ ! -f "$CSS_FILE" ]; then
  echo -e "${RED}Error: File not found: $CSS_FILE${NC}" >&2
  exit 1
fi

# Ensure prefix starts with --
if [[ ! "$PREFIX" == --* ]]; then
  PREFIX="--$PREFIX"
fi

# Ensure prefix ends with -
if [[ ! "$PREFIX" == *- ]]; then
  PREFIX="${PREFIX}-"
fi

echo -e "${GREEN}Extracting tokens with prefix '$PREFIX' from $CSS_FILE${NC}" >&2
echo "" >&2

# Extract all custom properties matching the prefix from :root blocks
# Handles both simple values and multi-line values
TOKENS=$(grep -E "^\s*${PREFIX}[a-zA-Z0-9_-]+\s*:" "$CSS_FILE" | \
  sed 's/^\s*//' | \
  sed 's/;$//' | \
  sed 's/\/\*.*\*\///' | \
  sed 's/\s*$//')

if [ -z "$TOKENS" ]; then
  echo -e "${YELLOW}No tokens found with prefix '$PREFIX'${NC}" >&2
  exit 0
fi

TOTAL=$(echo "$TOKENS" | wc -l | tr -d ' ')
echo -e "${GREEN}Found $TOTAL tokens${NC}" >&2
echo "" >&2

# Categorize tokens
echo "## Extracted Tokens"
echo ""
echo "Source: \`$CSS_FILE\`"
echo "Prefix: \`$PREFIX\`"
echo "Count: $TOTAL"
echo ""

# Color tokens
COLOR_TOKENS=$(echo "$TOKENS" | grep -iE "(color|text|surface|border|accent|chrome|gold|bg|focus|status|attention|positive|negative|interactive|destructive|escalation|feedback|onboarding|help)" || true)
if [ -n "$COLOR_TOKENS" ]; then
  echo "### Color Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$COLOR_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi

# Typography tokens
TYPO_TOKENS=$(echo "$TOKENS" | grep -iE "(font|text-[a-z]+[0-9]|text-base|text-sm|text-xs|text-lg|text-xl|text-h[0-9]|text-code|text-small|text-body|leading|weight)" | grep -viE "(color|text-primary|text-secondary|text-muted|text-inverse|text-placeholder)" || true)
if [ -n "$TYPO_TOKENS" ]; then
  echo "### Typography Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$TYPO_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi

# Spacing tokens
SPACE_TOKENS=$(echo "$TOKENS" | grep -iE "(space|spacing|gap|padding|margin)" || true)
if [ -n "$SPACE_TOKENS" ]; then
  echo "### Spacing Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$SPACE_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi

# Radius tokens
RADIUS_TOKENS=$(echo "$TOKENS" | grep -iE "radius" || true)
if [ -n "$RADIUS_TOKENS" ]; then
  echo "### Border Radius Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$RADIUS_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi

# Shadow tokens
SHADOW_TOKENS=$(echo "$TOKENS" | grep -iE "shadow" || true)
if [ -n "$SHADOW_TOKENS" ]; then
  echo "### Shadow Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$SHADOW_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi

# Motion tokens
MOTION_TOKENS=$(echo "$TOKENS" | grep -iE "(motion|duration|ease|transition|animation)" || true)
if [ -n "$MOTION_TOKENS" ]; then
  echo "### Motion Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$MOTION_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi

# Z-index tokens
Z_TOKENS=$(echo "$TOKENS" | grep -iE "z-" || true)
if [ -n "$Z_TOKENS" ]; then
  echo "### Z-Index Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$Z_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi

# Layout and other tokens (catch-all for anything not categorized above)
OTHER_TOKENS=$(echo "$TOKENS" | grep -viE "(color|text|surface|border|accent|chrome|gold|bg|focus|status|attention|positive|negative|interactive|destructive|escalation|feedback|onboarding|help|font|leading|weight|space|spacing|gap|padding|margin|radius|shadow|motion|duration|ease|transition|animation|z-)" || true)
if [ -n "$OTHER_TOKENS" ]; then
  echo "### Layout and Other Tokens"
  echo ""
  echo "| Token | Value |"
  echo "|-------|-------|"
  echo "$OTHER_TOKENS" | while IFS=':' read -r name value; do
    name=$(echo "$name" | sed 's/^\s*//' | sed 's/\s*$//')
    value=$(echo "$value" | sed 's/^\s*//' | sed 's/\s*$//')
    echo "| \`$name\` | \`$value\` |"
  done
  echo ""
fi
