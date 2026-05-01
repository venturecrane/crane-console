#!/usr/bin/env bash
# scripts/fleet-branch-protection.sh
#
# Apply or audit the canonical branch-protection profile across venture
# repos. Reads venture list from config/ventures.json. Idempotent.
#
# THE FLIP: this script's primary job is setting `required_status_checks.strict`
# to false on every venture main. The "branches must be up to date before
# merging" requirement is what drove the rebase + force-push churn whenever
# main moved under an open PR. Required CI checks still run; required reviews
# still gate; admin enforcement still applies. Only `strict` changes.
#
# Per repo, the script checks BOTH layers:
#   - Classic protection: gh api repos/{o}/{r}/branches/main/protection
#       If strict=true → PATCH .../required_status_checks with strict=false
#       (partial update via dedicated sub-endpoint; preserves contexts/checks).
#   - Rulesets: gh api repos/{o}/{r}/rulesets
#       For each ruleset that contains a required_status_checks rule with
#       strict_required_status_checks_policy=true, fetch the full ruleset,
#       flip that field, PUT the entire ruleset back. (No PATCH for rulesets.)
#
# Edge case: if a repo has neither classic protection nor any rulesets, the
# script POSTs the canonical ruleset profile from
# config/github-ruleset-main-protection.json. New ventures land here.
#
# Idempotency: a repo with all strict flags already false produces no actions
# and no API writes. Safe to re-run.
#
# Output modes:
#   --dry-run  (default) — print planned action per repo, do nothing
#   --apply              — execute the plan
#
# Filters:
#   --venture <code>     — limit to one venture (vc, ss, dc, ke, sc, dfg)
#   --repo <full_name>   — limit to one repo (venturecrane/vc-web)
#
# Auth requirements:
#   Local `gh auth status` must have admin scope on each org. The fleet
#   audit PAT (GH_FLEET_AUDIT_TOKEN) is read-only and cannot apply changes.
#   Use your normal gh login.
#
# Pre-flight:
#   Probes venturecrane/crane-console branch protection. Aborts with a
#   clear message if 403 (insufficient scope).
#
# Usage:
#   bash scripts/fleet-branch-protection.sh
#   bash scripts/fleet-branch-protection.sh --dry-run --venture vc
#   bash scripts/fleet-branch-protection.sh --apply --repo venturecrane/vc-web
#   bash scripts/fleet-branch-protection.sh --apply       # all 6 active ventures

set -uo pipefail

# ----- Args -----
MODE="dry-run"
VENTURE_FILTER=""
REPO_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE="dry-run"; shift ;;
    --apply) MODE="apply"; shift ;;
    --venture) VENTURE_FILTER="$2"; shift 2 ;;
    --repo) REPO_FILTER="$2"; shift 2 ;;
    --help|-h) sed -n '2,46p' "$0"; exit 0 ;;
    *) echo "fleet-branch-protection: unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ----- Paths -----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENTURES_JSON="$REPO_ROOT/config/ventures.json"
RULESET_PROFILE="$REPO_ROOT/config/github-ruleset-main-protection.json"

# ----- Colors -----
RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ----- Preflight -----
command -v gh >/dev/null 2>&1 || { echo "fleet-branch-protection: gh CLI required" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "fleet-branch-protection: jq required" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || { echo "fleet-branch-protection: gh CLI not authenticated" >&2; exit 2; }
[ -f "$VENTURES_JSON" ] || { echo "fleet-branch-protection: $VENTURES_JSON missing" >&2; exit 2; }
[ -f "$RULESET_PROFILE" ] || { echo "fleet-branch-protection: $RULESET_PROFILE missing" >&2; exit 2; }

# Probe admin scope on a known venture repo.
PROBE_REPO="venturecrane/crane-console"
probe_http_status=$(gh api "repos/$PROBE_REPO/branches/main/protection" \
  --silent -i 2>/dev/null | head -n 1 | awk '{print $2}' || true)
if [ -z "$probe_http_status" ]; then
  # Older gh versions may not echo status with --silent; fall back to raw call.
  if gh api "repos/$PROBE_REPO/branches/main/protection" >/dev/null 2>&1; then
    probe_http_status="200"
  else
    probe_http_status="error"
  fi
fi
case "$probe_http_status" in
  200|404)
    : # 200 = protection exists and we can read it; 404 = no protection (acceptable)
    ;;
  403)
    cat >&2 <<EOF
${RED}fleet-branch-protection: probe returned 403 on $PROBE_REPO${NC}

Your gh CLI lacks admin scope. Apply branch-protection changes require:
  gh auth login --scopes "repo,admin:org,workflow"

Or set GH_TOKEN to a fine-grained PAT with
  Repository permissions: Administration (Read and write)
on every venture repo.
EOF
    exit 2
    ;;
  *)
    echo "${RED}fleet-branch-protection: probe failed (status: $probe_http_status)${NC}" >&2
    exit 2
    ;;
esac

# ----- Build target repo list from ventures.json -----
# Each entry: "<venture_code> <owner/repo>"
TARGETS=()
while IFS= read -r line; do
  TARGETS+=("$line")
done < <(
  jq -r '
    .ventures[]
    | select(.repos | length > 0)
    | . as $v
    | $v.repos[] | "\($v.code) \($v.org)/\(.)"
  ' "$VENTURES_JSON"
)

# Apply filters.
FILTERED_TARGETS=()
for t in "${TARGETS[@]}"; do
  code="${t%% *}"
  full="${t#* }"
  if [ -n "$VENTURE_FILTER" ] && [ "$code" != "$VENTURE_FILTER" ]; then continue; fi
  if [ -n "$REPO_FILTER" ] && [ "$full" != "$REPO_FILTER" ]; then continue; fi
  FILTERED_TARGETS+=("$t")
done

if [ "${#FILTERED_TARGETS[@]}" -eq 0 ]; then
  echo "fleet-branch-protection: no repos matched filters (venture=$VENTURE_FILTER, repo=$REPO_FILTER)" >&2
  exit 1
fi

echo -e "${CYAN}fleet-branch-protection: mode=$MODE, ${#FILTERED_TARGETS[@]} repo(s)${NC}"
echo ""

# ----- Helpers -----

# Echoes "true" | "false" | "missing":
#   - "true"|"false": ruleset has a required_status_checks rule, value as set
#   - "missing": no required_status_checks rule, or the field is unset
# Note: jq's `// empty` short-circuits on FALSE as well as null, so emitting
# the boolean as a string keeps the verify path able to distinguish
# strict=false (success) from missing (genuinely absent). #784.
ruleset_strict_value() {
  local repo="$1" rs_id="$2"
  gh api "repos/$repo/rulesets/$rs_id" \
    --jq '[.rules[]? | select(.type=="required_status_checks") | .parameters.strict_required_status_checks_policy] | (if length == 0 then "missing" else (.[0] | tostring) end)' \
    2>/dev/null
}

# Flip strict_required_status_checks_policy=false on a ruleset via PUT (full replace).
# Strips read-only fields the API rejects on PUT.
ruleset_flip_strict() {
  local repo="$1" rs_id="$2"
  local tmp_in tmp_out
  tmp_in="$(mktemp)"
  tmp_out="$(mktemp)"
  gh api "repos/$repo/rulesets/$rs_id" >"$tmp_in" 2>/dev/null || { rm -f "$tmp_in" "$tmp_out"; return 1; }
  jq '
    del(.id, .node_id, .source_type, .source, .created_at, .updated_at, ._links, .current_user_can_bypass)
    | (.rules[]?
       | select(.type == "required_status_checks")
       | .parameters.strict_required_status_checks_policy) = false
  ' "$tmp_in" >"$tmp_out" || { rm -f "$tmp_in" "$tmp_out"; return 1; }
  if gh api "repos/$repo/rulesets/$rs_id" \
       --method PUT \
       --header "Accept: application/vnd.github+json" \
       --input "$tmp_out" >/dev/null 2>&1; then
    rm -f "$tmp_in" "$tmp_out"
    return 0
  fi
  rm -f "$tmp_in" "$tmp_out"
  return 1
}

# ----- Per-repo loop -----
ACTIONS=()  # "<repo>|<action>|<message>"
HAS_FAIL=0

for t in "${FILTERED_TARGETS[@]}"; do
  code="${t%% *}"
  full="${t#* }"

  printf "%-12s %s\n" "[$code]" "$full"

  classic_json=$(gh api "repos/$full/branches/main/protection" 2>/dev/null || echo "")
  rulesets_json=$(gh api "repos/$full/rulesets" 2>/dev/null || echo "[]")

  any_action_taken_for_repo=0
  any_strict_found=0

  # ----- Classic protection check -----
  if [ -n "$classic_json" ]; then
    classic_strict=$(echo "$classic_json" | jq -r '.required_status_checks.strict // false')
    if [ "$classic_strict" = "true" ]; then
      any_strict_found=1
      if [ "$MODE" = "dry-run" ]; then
        echo -e "    classic protection: ${YELLOW}strict=true → would PATCH to false${NC}"
        ACTIONS+=("$full|flip-classic|strict: true → false")
      else
        if gh api "repos/$full/branches/main/protection/required_status_checks" \
             --method PATCH \
             --header "Accept: application/vnd.github+json" \
             -f strict=false >/dev/null 2>&1; then
          verify=$(gh api "repos/$full/branches/main/protection" \
            --jq '.required_status_checks.strict' 2>/dev/null || echo "?")
          if [ "$verify" = "false" ]; then
            echo -e "    classic protection: ${GREEN}FLIPPED strict=true → false${NC}"
            ACTIONS+=("$full|flip-classic|verified strict=false")
          else
            echo -e "    classic protection: ${RED}verify mismatch: strict=$verify${NC}"
            ACTIONS+=("$full|fail|classic verify mismatch")
            HAS_FAIL=1
          fi
        else
          echo -e "    classic protection: ${RED}PATCH failed${NC}"
          ACTIONS+=("$full|fail|classic PATCH failed")
          HAS_FAIL=1
        fi
      fi
      any_action_taken_for_repo=1
    fi
  fi

  # ----- Rulesets check -----
  ruleset_count=$(echo "$rulesets_json" | jq 'length')
  if [ "$ruleset_count" -gt 0 ]; then
    while IFS= read -r rs_id; do
      [ -z "$rs_id" ] && continue
      rs_strict=$(ruleset_strict_value "$full" "$rs_id" || echo "")
      if [ "$rs_strict" = "true" ]; then
        any_strict_found=1
        rs_name=$(echo "$rulesets_json" | jq -r ".[] | select(.id == $rs_id) | .name")
        if [ "$MODE" = "dry-run" ]; then
          echo -e "    ruleset \"$rs_name\" (id=$rs_id): ${YELLOW}strict=true → would PUT with strict=false${NC}"
          ACTIONS+=("$full|flip-ruleset|ruleset id=$rs_id strict: true → false")
        else
          if ruleset_flip_strict "$full" "$rs_id"; then
            verify=$(ruleset_strict_value "$full" "$rs_id" || echo "?")
            if [ "$verify" = "false" ]; then
              echo -e "    ruleset \"$rs_name\" (id=$rs_id): ${GREEN}FLIPPED strict=true → false${NC}"
              ACTIONS+=("$full|flip-ruleset|id=$rs_id verified")
            else
              echo -e "    ruleset \"$rs_name\" (id=$rs_id): ${RED}verify mismatch: strict=$verify${NC}"
              ACTIONS+=("$full|fail|ruleset verify mismatch")
              HAS_FAIL=1
            fi
          else
            echo -e "    ruleset \"$rs_name\" (id=$rs_id): ${RED}PUT failed${NC}"
            ACTIONS+=("$full|fail|ruleset PUT failed")
            HAS_FAIL=1
          fi
        fi
        any_action_taken_for_repo=1
      fi
    done < <(echo "$rulesets_json" | jq -r '.[].id')
  fi

  # ----- No-protection-at-all case -----
  if [ -z "$classic_json" ] && [ "$ruleset_count" -eq 0 ]; then
    if [ "$MODE" = "dry-run" ]; then
      echo -e "    ${YELLOW}NO PROTECTION → would apply canonical ruleset profile${NC}"
      ACTIONS+=("$full|create-ruleset|none → canonical profile")
    else
      if gh api "repos/$full/rulesets" \
           --method POST \
           --header "Accept: application/vnd.github+json" \
           --input "$RULESET_PROFILE" >/dev/null 2>&1; then
        echo -e "    ${GREEN}APPLIED canonical ruleset profile${NC}"
        ACTIONS+=("$full|create-ruleset|created from $RULESET_PROFILE")
      else
        echo -e "    ${RED}FAILED to apply ruleset profile${NC}"
        ACTIONS+=("$full|fail|ruleset POST failed")
        HAS_FAIL=1
      fi
    fi
    any_action_taken_for_repo=1
  fi

  if [ "$any_action_taken_for_repo" -eq 0 ] && [ "$any_strict_found" -eq 0 ]; then
    echo -e "    ${GREEN}already correct (strict=false everywhere)${NC}"
    ACTIONS+=("$full|noop|all strict=false")
  fi
done

# ----- Summary -----
echo ""
echo -e "${CYAN}Summary (mode=$MODE):${NC}"
echo ""
printf "  %-40s  %-15s  %s\n" "Repo" "Action" "Detail"
printf "  %-40s  %-15s  %s\n" "----" "------" "------"
for a in "${ACTIONS[@]}"; do
  full="${a%%|*}"; rest="${a#*|}"
  action="${rest%%|*}"; detail="${rest#*|}"
  printf "  %-40s  %-15s  %s\n" "$full" "$action" "$detail"
done
echo ""

if [ "$MODE" = "dry-run" ]; then
  echo -e "${YELLOW}Dry-run only. Re-run with --apply to execute.${NC}"
fi

[ "$HAS_FAIL" -eq 0 ] || exit 1
exit 0
