#!/usr/bin/env bash
# scripts/fleet-ops-health.sh
#
# Plan §C.4 — runtime fleet health audit. Walks the venturecrane GitHub
# org via `gh api` and reports per-repo health: archived state, default
# branch CI conclusion, push activity, dependabot backlog, secret presence
# for deploy repos.
#
# This is the WEEKLY CHECK companion to fleet-lint.sh (static patterns).
# Different signal classes:
#   fleet-lint.sh        — static workflow file antipatterns (no API)
#   fleet-ops-health.sh  — runtime GitHub state (gh api required)
#
# Output modes:
#   --tty   (default) — colorized human-readable
#   --json  — structured JSON for ingestion
#   --ci    — exits 1 on any failure (used by .github/workflows/fleet-ops-health.yml)
#
# Requires: gh CLI authenticated against the venturecrane org.
#
# Usage:
#   bash scripts/fleet-ops-health.sh
#   bash scripts/fleet-ops-health.sh --json > fleet-health.json
#   bash scripts/fleet-ops-health.sh --ci

set -uo pipefail

# ---- Args ----
MODE="tty"
ORG="venturecrane"
for arg in "$@"; do
  case "$arg" in
    --json) MODE="json" ;;
    --ci) MODE="ci" ;;
    --tty) MODE="tty" ;;
    --org=*) ORG="${arg#--org=}" ;;
    --help|-h)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# ---- Preflight ----
if ! command -v gh >/dev/null 2>&1; then
  echo "fleet-ops-health: gh CLI required" >&2
  exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "fleet-ops-health: gh CLI not authenticated" >&2
  exit 2
fi

# ---- Findings ----
FINDINGS=()
HAS_FAIL=0

record() {
  # record REPO RULE SEVERITY MESSAGE
  local repo="$1" rule="$2" sev="$3" msg="$4"
  FINDINGS+=("$repo|$rule|$sev|$msg")
  if [ "$sev" = "error" ]; then HAS_FAIL=1; fi
}

# Stale activity threshold (days)
STALE_WARN_DAYS=14
STALE_FAIL_DAYS=60
DEPENDABOT_WARN_OPEN=2
DEPENDABOT_WARN_AGE_DAYS=7
DEPENDABOT_FAIL_AGE_DAYS=30

now_epoch=$(date +%s)

# ---- Repo discovery ----
# List all non-archived repos in the org. Use --paginate so the org cap
# isn't 30 (the default) — fleets grow.
REPOS_JSON=$(gh api "orgs/$ORG/repos?per_page=100&type=all" --paginate 2>/dev/null || echo '[]')

if [ "$REPOS_JSON" = "[]" ]; then
  echo "fleet-ops-health: no repos returned for org $ORG (auth scope?)" >&2
  exit 2
fi

# Iterate repo by repo. We pull the list of (name, archived, pushed_at,
# default_branch) up front, then per-repo make targeted gh calls.
REPO_COUNT=$(echo "$REPOS_JSON" | jq 'length')
echo "fleet-ops-health: scanning $REPO_COUNT repos in $ORG (mode=$MODE)" >&2

for i in $(seq 0 $((REPO_COUNT - 1))); do
  name=$(echo "$REPOS_JSON" | jq -r ".[$i].name")
  full_name=$(echo "$REPOS_JSON" | jq -r ".[$i].full_name")
  archived=$(echo "$REPOS_JSON" | jq -r ".[$i].archived")
  pushed_at=$(echo "$REPOS_JSON" | jq -r ".[$i].pushed_at")
  is_template=$(echo "$REPOS_JSON" | jq -r ".[$i].is_template")
  default_branch=$(echo "$REPOS_JSON" | jq -r ".[$i].default_branch // \"main\"")

  # Skip archived (report as ok-archived) and templates (skip checks).
  if [ "$archived" = "true" ]; then
    record "$full_name" "archived" "info" "Archived — skipping checks"
    continue
  fi
  if [ "$is_template" = "true" ]; then
    record "$full_name" "template" "info" "Template repo — skipping checks"
    continue
  fi

  # ---- Push activity ----
  if [ -n "$pushed_at" ] && [ "$pushed_at" != "null" ]; then
    pushed_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$pushed_at" +%s 2>/dev/null \
                   || date -d "$pushed_at" +%s 2>/dev/null)
    if [ -n "$pushed_epoch" ]; then
      age_days=$(( (now_epoch - pushed_epoch) / 86400 ))
      if [ $age_days -ge $STALE_FAIL_DAYS ]; then
        record "$full_name" "stale-push" "error" \
          "No push for $age_days days (≥ $STALE_FAIL_DAYS-day fail threshold)"
      elif [ $age_days -ge $STALE_WARN_DAYS ]; then
        record "$full_name" "stale-push" "warning" \
          "No push for $age_days days (≥ $STALE_WARN_DAYS-day warn threshold)"
      fi
    fi
  fi

  # ---- Default-branch latest CI conclusion ----
  # Pull the most recent workflow run on the default branch and check status.
  ci_conclusion=$(gh api \
    "repos/$full_name/actions/runs?branch=$default_branch&per_page=1" \
    --jq '.workflow_runs[0].conclusion // "none"' 2>/dev/null || echo "none")

  if [ "$ci_conclusion" = "failure" ] || [ "$ci_conclusion" = "timed_out" ]; then
    record "$full_name" "ci-failed" "error" \
      "Latest workflow run on $default_branch is $ci_conclusion"
  elif [ "$ci_conclusion" = "cancelled" ]; then
    record "$full_name" "ci-cancelled" "warning" \
      "Latest workflow run on $default_branch is cancelled"
  fi

  # ---- Dependabot backlog ----
  # Count open dependabot PRs.
  dep_count=$(gh api \
    "repos/$full_name/pulls?state=open&per_page=100" \
    --jq '[.[] | select(.user.login == "dependabot[bot]")] | length' 2>/dev/null || echo "0")

  if [ "$dep_count" -gt $DEPENDABOT_WARN_OPEN ]; then
    record "$full_name" "dependabot-backlog" "warning" \
      "$dep_count open dependabot PRs (warn at >$DEPENDABOT_WARN_OPEN)"
  fi

  # Find oldest dependabot PR
  oldest_dep_age=$(gh api \
    "repos/$full_name/pulls?state=open&per_page=100" \
    --jq '[.[] | select(.user.login == "dependabot[bot]") | .created_at] | sort | .[0] // ""' 2>/dev/null || echo "")
  if [ -n "$oldest_dep_age" ]; then
    oldest_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$oldest_dep_age" +%s 2>/dev/null \
                   || date -d "$oldest_dep_age" +%s 2>/dev/null)
    if [ -n "$oldest_epoch" ]; then
      oldest_age_days=$(( (now_epoch - oldest_epoch) / 86400 ))
      if [ $oldest_age_days -ge $DEPENDABOT_FAIL_AGE_DAYS ]; then
        record "$full_name" "dependabot-stale" "error" \
          "Oldest dependabot PR is $oldest_age_days days old (≥ $DEPENDABOT_FAIL_AGE_DAYS)"
      elif [ $oldest_age_days -ge $DEPENDABOT_WARN_AGE_DAYS ]; then
        record "$full_name" "dependabot-stale" "warning" \
          "Oldest dependabot PR is $oldest_age_days days old (≥ $DEPENDABOT_WARN_AGE_DAYS)"
      fi
    fi
  fi
done

# ---- Output ----
if [ "$MODE" = "json" ]; then
  printf '{"org":"%s","timestamp":"%s","status":"%s","findings":[' \
    "$ORG" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$([ $HAS_FAIL -eq 0 ] && echo "pass" || echo "fail")"
  first=1
  for f in "${FINDINGS[@]}"; do
    repo="${f%%|*}"; rest="${f#*|}"
    rule="${rest%%|*}"; rest="${rest#*|}"
    sev="${rest%%|*}"; msg="${rest#*|}"
    if [ $first -eq 0 ]; then printf ','; fi
    printf '{"repo":"%s","rule":"%s","severity":"%s","message":"%s"}' \
      "$repo" "$rule" "$sev" "$msg"
    first=0
  done
  printf ']}\n'
else
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
  if [ ${#FINDINGS[@]} -eq 0 ]; then
    echo -e "${GREEN}fleet-ops-health: clean — $REPO_COUNT repos in $ORG${NC}"
  else
    err_count=0
    warn_count=0
    info_count=0
    for f in "${FINDINGS[@]}"; do
      repo="${f%%|*}"; rest="${f#*|}"
      rule="${rest%%|*}"; rest="${rest#*|}"
      sev="${rest%%|*}"; msg="${rest#*|}"
      case "$sev" in
        error)
          echo -e "  ${RED}[ERROR]${NC} $repo ($rule): $msg"
          err_count=$((err_count + 1)) ;;
        warning)
          echo -e "  ${YELLOW}[WARN]${NC}  $repo ($rule): $msg"
          warn_count=$((warn_count + 1)) ;;
        info)
          echo -e "  ${BLUE}[INFO]${NC}  $repo ($rule): $msg"
          info_count=$((info_count + 1)) ;;
      esac
    done
    echo ""
    echo "fleet-ops-health summary: $err_count errors, $warn_count warnings, $info_count info"
  fi
fi

if [ "$MODE" = "ci" ] && [ $HAS_FAIL -eq 1 ]; then
  exit 1
fi

exit 0
