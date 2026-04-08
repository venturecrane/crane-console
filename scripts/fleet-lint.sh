#!/usr/bin/env bash
# scripts/fleet-lint.sh
#
# Plan §C.5: static-pattern lint for fleet workflow files. Catches the
# antipatterns we have actually been bitten by:
#
#   1. Hardcoded gitleaks download URL (the smd-web 7-week silence cause)
#   2. Multi-word --commit-message in cloudflare/wrangler-action (the
#      vc-web/smd-console "Invalid commit message" cause)
#   3. action@master / action@main pins (no version pinning at all)
#   4. actions/checkout < v4
#   5. actions/setup-node < v4 OR missing node-version
#   6. Deploy workflows missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID
#   7. continue-on-error: true at job level for deploy/verify jobs
#   8. Scheduled workflows missing workflow_dispatch
#   9. npm audit without --audit-level threshold
#  10. Repos with workflows but no on: push: branches: [main]
#
# Outputs to TTY by default. --json emits structured JSON. --ci exits 1
# on any failure (used by .github/workflows/fleet-ops-health.yml).
#
# Run from a venture repo root, or pass a path:
#   bash scripts/fleet-lint.sh
#   bash scripts/fleet-lint.sh /path/to/repo
#   bash scripts/fleet-lint.sh --ci

set -uo pipefail

# ----- Args -----
MODE="tty"     # tty | json | ci
TARGET_DIR="."
for arg in "$@"; do
  case "$arg" in
    --json) MODE="json" ;;
    --ci) MODE="ci" ;;
    --tty) MODE="tty" ;;
    --help|-h)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      if [ -d "$arg" ]; then
        TARGET_DIR="$arg"
      else
        echo "Unknown arg: $arg" >&2
        exit 2
      fi
      ;;
  esac
done

WORKFLOW_DIR="$TARGET_DIR/.github/workflows"

if [ ! -d "$WORKFLOW_DIR" ]; then
  if [ "$MODE" = "json" ]; then
    echo '{"status":"skipped","reason":"no workflow directory","findings":[]}'
  else
    echo "fleet-lint: no .github/workflows in $TARGET_DIR — skipping"
  fi
  exit 0
fi

# ----- Findings collector -----
FINDINGS=()
HAS_FAIL=0

record() {
  # record FILE RULE SEVERITY MESSAGE
  local file="$1" rule="$2" sev="$3" msg="$4"
  FINDINGS+=("$file|$rule|$sev|$msg")
  if [ "$sev" = "error" ]; then HAS_FAIL=1; fi
}

# Iterate over workflow files. Use a portable for-loop instead of mapfile
# (bash 3.2 compatibility on macOS default shell).
WORKFLOW_FILES=()
while IFS= read -r f; do
  WORKFLOW_FILES+=("$f")
done < <(find "$WORKFLOW_DIR" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) | sort)

if [ ${#WORKFLOW_FILES[@]} -eq 0 ]; then
  if [ "$MODE" = "json" ]; then
    echo '{"status":"skipped","reason":"no workflow files","findings":[]}'
  else
    echo "fleet-lint: no workflow files found in $WORKFLOW_DIR"
  fi
  exit 0
fi

for file in "${WORKFLOW_FILES[@]}"; do
  rel="${file#$TARGET_DIR/}"

  # ---- 1. Hardcoded gitleaks version (the smd-web 7-week silence cause) ----
  # Match the bad pattern: a hardcoded version number in the download URL.
  # The good pattern uses ${GITLEAKS_VERSION} from the GitHub API. We
  # specifically reject `gitleaks_X.Y.Z_linux_x64.tar.gz` with literal numbers.
  if grep -E 'gitleaks_[0-9]+\.[0-9]+\.[0-9]+_linux_x64\.tar\.gz' "$file" >/dev/null; then
    record "$rel" "no-hardcoded-gitleaks-version" "error" \
      "Hardcoded gitleaks version in download URL — fetch latest via GitHub API instead"
  fi

  # ---- 2. wrangler-action multi-word commit-message ----
  # The cloudflare/wrangler-action input whitespace-tokenizes commands;
  # any --commit-message string with spaces breaks tag emission.
  if grep -q 'cloudflare/wrangler-action' "$file"; then
    if grep -A2 'wrangler-action' "$file" | grep -E "command:.*--commit-message[^']*\s" >/dev/null; then
      record "$rel" "no-wrangler-multiword-commit-message" "error" \
        "cloudflare/wrangler-action --commit-message must not contain whitespace"
    fi
  fi

  # ---- 3. action@master / action@main pins ----
  if grep -E 'uses:\s*[^#]*@(master|main)\s*$' "$file" >/dev/null; then
    record "$rel" "no-floating-action-pins" "error" \
      "Action pinned to @master or @main (no version pinning)"
  fi

  # ---- 4. actions/checkout < v4 ----
  if grep -E 'uses:\s*actions/checkout@v[123]\b' "$file" >/dev/null; then
    record "$rel" "checkout-v4-min" "error" \
      "actions/checkout below v4 — bump to v4+"
  fi

  # ---- 5. actions/setup-node < v4 ----
  if grep -E 'uses:\s*actions/setup-node@v[123]\b' "$file" >/dev/null; then
    record "$rel" "setup-node-v4-min" "error" \
      "actions/setup-node below v4 — bump to v4+"
  fi

  # ---- 6. Deploy workflows must reference CLOUDFLARE_API_TOKEN + ACCOUNT_ID ----
  if grep -qE 'wrangler\b' "$file"; then
    has_token=0
    has_account=0
    grep -q 'CLOUDFLARE_API_TOKEN' "$file" && has_token=1
    grep -q 'CLOUDFLARE_ACCOUNT_ID' "$file" && has_account=1
    if [ $has_token -eq 0 ]; then
      record "$rel" "wrangler-needs-api-token" "error" \
        "wrangler workflow missing CLOUDFLARE_API_TOKEN reference"
    fi
    if [ $has_account -eq 0 ]; then
      record "$rel" "wrangler-needs-account-id" "error" \
        "wrangler workflow missing CLOUDFLARE_ACCOUNT_ID reference"
    fi
  fi

  # ---- 7. continue-on-error: true at job level for deploy/verify ----
  if basename "$file" | grep -qE '^(deploy|verify|test|ci)\.ya?ml$'; then
    if grep -E '^\s*continue-on-error:\s*true' "$file" >/dev/null; then
      record "$rel" "no-continue-on-error-deploy" "error" \
        "continue-on-error: true in a deploy/verify workflow swallows failures"
    fi
  fi

  # ---- 8. Scheduled workflows must have workflow_dispatch ----
  if grep -q 'schedule:' "$file"; then
    if ! grep -q 'workflow_dispatch:' "$file"; then
      record "$rel" "scheduled-needs-dispatch" "warning" \
        "Scheduled workflow lacks workflow_dispatch — manual retrigger impossible"
    fi
  fi

  # ---- 9. npm audit without --audit-level ----
  if grep -E 'npm audit\b' "$file" >/dev/null; then
    if ! grep -E 'npm audit.*--audit-level' "$file" >/dev/null; then
      record "$rel" "npm-audit-needs-level" "warning" \
        "npm audit without --audit-level — entire scan blocks on info findings"
    fi
  fi
done

# ---- 10. Repo has workflows but none on push: branches: [main] ----
HAS_MAIN_PUSH=0
for file in "${WORKFLOW_FILES[@]}"; do
  if grep -A3 'on:' "$file" | grep -E "branches:.*main" >/dev/null; then
    HAS_MAIN_PUSH=1
    break
  fi
done
if [ $HAS_MAIN_PUSH -eq 0 ]; then
  record "(repo)" "needs-main-branch-trigger" "warning" \
    "No workflow triggers on push to main — fleet ops cannot detect deploy state"
fi

# ----- Output -----
if [ "$MODE" = "json" ]; then
  printf '{"target":"%s","status":"%s","findings":[' "$TARGET_DIR" \
    "$([ $HAS_FAIL -eq 0 ] && echo "pass" || echo "fail")"
  first=1
  for f in "${FINDINGS[@]}"; do
    file="${f%%|*}"; rest="${f#*|}"
    rule="${rest%%|*}"; rest="${rest#*|}"
    sev="${rest%%|*}"; msg="${rest#*|}"
    if [ $first -eq 0 ]; then printf ','; fi
    printf '{"file":"%s","rule":"%s","severity":"%s","message":"%s"}' \
      "$file" "$rule" "$sev" "$msg"
    first=0
  done
  printf ']}\n'
else
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; NC='\033[0m'
  if [ ${#FINDINGS[@]} -eq 0 ]; then
    echo -e "${GREEN}fleet-lint: clean — ${#WORKFLOW_FILES[@]} workflow file(s) checked in $TARGET_DIR${NC}"
  else
    echo "fleet-lint findings for $TARGET_DIR:"
    for f in "${FINDINGS[@]}"; do
      file="${f%%|*}"; rest="${f#*|}"
      rule="${rest%%|*}"; rest="${rest#*|}"
      sev="${rest%%|*}"; msg="${rest#*|}"
      if [ "$sev" = "error" ]; then
        echo -e "  ${RED}[ERROR]${NC} $file ($rule): $msg"
      else
        echo -e "  ${YELLOW}[WARN]${NC}  $file ($rule): $msg"
      fi
    done
    echo ""
    if [ $HAS_FAIL -eq 1 ]; then
      echo -e "${RED}fleet-lint: ${#FINDINGS[@]} finding(s) — at least one error${NC}"
    else
      echo -e "${YELLOW}fleet-lint: ${#FINDINGS[@]} warning(s) — no errors${NC}"
    fi
  fi
fi

if [ "$MODE" = "ci" ] && [ $HAS_FAIL -eq 1 ]; then
  exit 1
fi

exit 0
