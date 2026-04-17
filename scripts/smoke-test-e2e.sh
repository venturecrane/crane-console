#!/usr/bin/env bash
# scripts/smoke-test-e2e.sh
#
# Plan v3.1 §D.5. End-to-end smoke test for crane-context. Exercises
# health + version + schema verify + auth gates + the mutation path
# (Track A auto-resolver via smoke_test_notifications).
#
# Targets staging by default. Prod mode runs non-mutation scenarios only.
#
# Usage:
#   bash scripts/smoke-test-e2e.sh                     # staging, tty
#   bash scripts/smoke-test-e2e.sh --env=production    # prod (read-only)
#   bash scripts/smoke-test-e2e.sh --json              # structured output
#   bash scripts/smoke-test-e2e.sh --ci                # exit 1 on any fail

set -uo pipefail

ENV="staging"
JSON=0
CI=0
for a in "$@"; do
  case "$a" in
    --env=staging) ENV="staging" ;;
    --env=production|--env=prod) ENV="production" ;;
    --json) JSON=1 ;;
    --ci) CI=1 ;;
    --help|-h) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "error: unknown arg '$a'" >&2; exit 2 ;;
  esac
done

case "$ENV" in
  staging)    URL="https://crane-context-staging.automation-ab6.workers.dev" ;;
  production) URL="https://crane-context.automation-ab6.workers.dev" ;;
esac

RESULTS=()
FAIL=0

record() {
  # record SCENARIO STATUS DURATION_MS MESSAGE
  RESULTS+=("$1|$2|$3|$4")
  if [ "$2" = "FAIL" ]; then FAIL=1; fi
}

run_scenario() {
  local name="$1"
  local fn="$2"
  local start=$(python3 -c "import time; print(int(time.time()*1000))")
  local msg
  if msg=$("$fn" 2>&1); then
    local end=$(python3 -c "import time; print(int(time.time()*1000))")
    local dur=$((end - start))
    record "$name" "PASS" "$dur" "${msg:-ok}"
  else
    local end=$(python3 -c "import time; print(int(time.time()*1000))")
    local dur=$((end - start))
    record "$name" "FAIL" "$dur" "${msg:-error}"
  fi
}

# Pull auth keys from Infisical
RELAY_KEY=$(infisical secrets get CONTEXT_RELAY_KEY --path /vc --env prod --plain 2>/dev/null || true)
ADMIN_KEY=$(infisical secrets get CRANE_ADMIN_KEY --path /vc --env prod --plain 2>/dev/null || true)
if [ -z "$RELAY_KEY" ] || [ -z "$ADMIN_KEY" ]; then
  echo "error: could not fetch RELAY/ADMIN keys from Infisical" >&2
  exit 2
fi

# ---- Scenario 1: Health ----
scenario_health() {
  curl -sf "$URL/health?$(date +%s)" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('status') == 'healthy', f'not healthy: {d}'
print('healthy')
"
}

# ---- Scenario 2: Version ----
scenario_version() {
  local expected_env
  if [ "$ENV" = "production" ]; then expected_env="production"; else expected_env="staging"; fi
  curl -sf "$URL/version?$(date +%s)" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('service') == 'crane-context', f'wrong service: {d.get(\"service\")}'
assert d.get('environment') == '$expected_env', f'wrong env: {d.get(\"environment\")}'
assert d.get('commit', '').startswith('UNSET') is False, 'commit is UNSET — inject-version did not run'
assert len(d.get('migrations_applied', [])) >= 25, f'migrations count: {len(d.get(\"migrations_applied\",[]))}'
print(f'commit={d[\"commit_short\"]} env={d[\"environment\"]} migrations={len(d[\"migrations_applied\"])}')
"
}

# ---- Scenario 3: Verify schema ----
scenario_verify_schema() {
  curl -sf "$URL/admin/verify-schema?$(date +%s)" -H "X-Admin-Key: $ADMIN_KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('matches') is True, f'schema mismatch: live={d.get(\"live_hash\",\"?\")[:12]} expected={d.get(\"expected_hash\",\"?\")[:12]} reason={d.get(\"reason\")}'
print(f'matches={d[\"matches\"]} tables={d[\"table_count\"]}')
"
}

# ---- Scenario 4: D1 read path (GET /active) ----
scenario_active_sessions() {
  curl -sf "$URL/active?venture=vc&$(date +%s)" -H "X-Relay-Key: $RELAY_KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# Accept any shape that includes 'sessions' array
assert 'sessions' in d, f'no sessions field: {list(d.keys())}'
print(f'sessions={len(d.get(\"sessions\",[]))}')
"
}

# ---- Scenario 5: Admin auth gate (expects 401 without key) ----
scenario_admin_auth_gate() {
  local code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/admin/verify-schema?$(date +%s)")
  if [ "$code" != "401" ]; then
    echo "expected 401 without admin key, got $code"
    return 1
  fi
  echo "401 as expected"
}

# ---- Scenario 6: Relay auth gate (expects 401 without key) ----
scenario_relay_auth_gate() {
  local code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/active?venture=vc&$(date +%s)")
  if [ "$code" != "401" ]; then
    echo "expected 401 without relay key, got $code"
    return 1
  fi
  echo "401 as expected"
}

# ---- Scenario 7: Mutation path (STAGING ONLY) — red/green auto-resolve ----
scenario_mutation_autoresolve() {
  if [ "$ENV" != "staging" ]; then
    echo "skipped (production: mutation scenarios are staging-only)"
    return 0
  fi

  # Purge old synthetic rows first
  curl -sf -X POST "$URL/smoke-test/purge" -H "X-Relay-Key: $RELAY_KEY" > /dev/null

  # Generate a unique run_id to avoid dedupe collisions between runs
  local run_id=$(python3 -c "import time; print(int(time.time()*1000))")
  local repo="venturecrane/smoke-test-synthetic"
  local branch="smoke"
  local workflow_id=999999

  # Step 1: insert a failure
  local fail_resp=$(curl -sf -X POST "$URL/smoke-test/ingest" \
    -H "X-Relay-Key: $RELAY_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"workflow_run\",\"conclusion\":\"failure\",\"run_id\":$run_id,\"workflow_id\":$workflow_id,\"head_sha\":\"aaa111\",\"branch\":\"$branch\",\"repo\":\"$repo\"}")
  local fail_id=$(echo "$fail_resp" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id',''))")
  if [ -z "$fail_id" ]; then
    echo "failed to insert failure row: $fail_resp"
    return 1
  fi

  # Step 2: insert a success for the same (repo, branch, workflow_id)
  local success_run_id=$((run_id + 1))
  local success_resp=$(curl -sf -X POST "$URL/smoke-test/ingest" \
    -H "X-Relay-Key: $RELAY_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"workflow_run\",\"conclusion\":\"success\",\"run_id\":$success_run_id,\"workflow_id\":$workflow_id,\"head_sha\":\"bbb222\",\"branch\":\"$branch\",\"repo\":\"$repo\"}")
  local resolved_count=$(echo "$success_resp" | python3 -c "import sys, json; print(json.load(sys.stdin).get('resolved_count',0))")

  if [ "$resolved_count" -lt 1 ]; then
    echo "expected >=1 auto-resolved, got $resolved_count"
    return 1
  fi

  # Step 3: verify the failure row is now resolved
  local check=$(curl -sf "$URL/smoke-test/notifications?status=resolved&match_key=gh:wf:$repo:$branch:$workflow_id" \
    -H "X-Relay-Key: $RELAY_KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
notifs = d.get('notifications', [])
resolved = [n for n in notifs if n.get('auto_resolved_by_id')]
print(len(resolved))
")
  if [ -z "$check" ] || [ "$check" -lt 1 ]; then
    echo "no auto_resolved_by_id set on any row"
    return 1
  fi
  echo "red→green auto-resolve verified ($resolved_count resolved)"
}

# ---- Scenario 8: Fleet health summary freshness ----
scenario_fleet_health_summary() {
  curl -sf "$URL/fleet-health/summary?$(date +%s)" -H "X-Relay-Key: $RELAY_KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d.get('summary', {})
# Accept any summary response; zero findings is OK
print(f'total_open={s.get(\"total_open\",0)} newest={s.get(\"newest_generated_at\",\"none\")}')
"
}

# ---- Scenario 9: Deploy heartbeats endpoint reachable ----
scenario_deploy_heartbeats() {
  curl -sf "$URL/deploy-heartbeats?venture=vc&$(date +%s)" -H "X-Relay-Key: $RELAY_KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert 'heartbeats' in d, f'no heartbeats field: {list(d.keys())}'
print(f'heartbeats={len(d[\"heartbeats\"])} cold={len(d.get(\"cold\",[]))}')
"
}

# ---- Scenario 10: /sos accepts real crane-mcp agent names across the fleet ----
#
# This is the post-2026-04 regression guard. The bug hidden for a week was:
# macOS clients sent `agent: "crane-mcp-m16.local"`, server rejected it as
# `validation_failed`, client surfaced "check connectivity". Before this
# scenario existed, the smoke test used hardcoded `cc-cli`-shaped agents
# and never exercised the real client-generated pipeline.
#
# We compute agent names from the live @venturecrane/crane-contracts package
# (not hardcoded strings) so any future tightening or regression in
# buildAgentName() shows up here immediately. We POST /sos with each, asserting
# HTTP 200. If the worker ever tightens the regex such that a real fleet
# machine's hostname is rejected, this fails loudly before users notice.
scenario_sos_real_client_agents() {
  if [ "$ENV" != "staging" ]; then
    echo "skipped (production: /sos creates rows, staging-only)"
    return 0
  fi

  # Pull the canonical agent-name matrix from the contract package itself
  # (deterministic hash means the values never shift run-to-run).
  local matrix_json
  matrix_json=$(node --input-type=module -e '
    import { buildAgentName } from "@venturecrane/crane-contracts"
    const hosts = ["m16.local", "mbp27.local", "mac23.local", "think", "desktop-abc123", ""]
    console.log(JSON.stringify(hosts.map(h => ({ host: h, agent: buildAgentName(h) }))))
  ' 2>&1)
  if [ -z "$matrix_json" ] || ! echo "$matrix_json" | python3 -c "import sys, json; json.load(sys.stdin)" > /dev/null 2>&1; then
    echo "failed to compute agent matrix from @venturecrane/crane-contracts: $matrix_json"
    return 1
  fi

  local pass=0
  local fail=0
  local failures=""
  while read -r pair; do
    local host agent
    host=$(echo "$pair" | python3 -c "import sys, json; print(json.load(sys.stdin)['host'])")
    agent=$(echo "$pair" | python3 -c "import sys, json; print(json.load(sys.stdin)['agent'])")
    local body
    body=$(python3 -c "import json; print(json.dumps({'schema_version':'1.0','agent':'$agent','client':'smoke-test','client_version':'0.0.1','host':'$host','venture':'vc','repo':'venturecrane/crane-console','track':1}))")
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/sos" \
      -H "Content-Type: application/json" \
      -H "X-Relay-Key: $RELAY_KEY" \
      -d "$body")
    if [ "$code" = "200" ]; then
      pass=$((pass + 1))
    else
      fail=$((fail + 1))
      failures="$failures [host=$host agent=$agent http=$code]"
    fi
  done < <(echo "$matrix_json" | python3 -c "import sys, json; [print(json.dumps(x)) for x in json.load(sys.stdin)]")

  if [ "$fail" -gt 0 ]; then
    echo "some fleet hostnames rejected ($fail/$((pass + fail))):$failures"
    return 1
  fi
  echo "$pass/$pass fleet-hostname agents accepted (real-client parity)"
}

# ---- Scenario 11: /sos regression guard — the exact pre-fix shape is rejected ----
scenario_sos_dotted_agent_rejected() {
  if [ "$ENV" != "staging" ]; then
    echo "skipped (production: staging-only)"
    return 0
  fi

  local body='{"schema_version":"1.0","agent":"crane-mcp-m16.local","client":"smoke-test","client_version":"0.0.1","host":"m16.local","venture":"vc","repo":"venturecrane/crane-console","track":1}'
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/sos" \
    -H "Content-Type: application/json" \
    -H "X-Relay-Key: $RELAY_KEY" \
    -d "$body")
  if [ "$code" != "400" ]; then
    echo "expected HTTP 400 for dotted agent, got $code — regex has been relaxed?"
    return 1
  fi
  echo "400 as expected for pre-fix shape (crane-mcp-m16.local)"
}

# ---- Run all scenarios ----
run_scenario "health" scenario_health
run_scenario "version" scenario_version
run_scenario "verify_schema" scenario_verify_schema
run_scenario "active_sessions" scenario_active_sessions
run_scenario "admin_auth_gate" scenario_admin_auth_gate
run_scenario "relay_auth_gate" scenario_relay_auth_gate
run_scenario "mutation_autoresolve" scenario_mutation_autoresolve
run_scenario "fleet_health_summary" scenario_fleet_health_summary
run_scenario "deploy_heartbeats" scenario_deploy_heartbeats
run_scenario "sos_real_client_agents" scenario_sos_real_client_agents
run_scenario "sos_dotted_agent_rejected" scenario_sos_dotted_agent_rejected

# ---- Output ----
if [ "$JSON" -eq 1 ]; then
  printf '{"env":"%s","url":"%s","status":"%s","scenarios":[' \
    "$ENV" "$URL" "$([ $FAIL -eq 0 ] && echo "pass" || echo "fail")"
  first=1
  for r in "${RESULTS[@]}"; do
    name="${r%%|*}"; rest="${r#*|}"
    status="${rest%%|*}"; rest="${rest#*|}"
    dur="${rest%%|*}"; msg="${rest#*|}"
    # Escape double quotes in msg for JSON
    msg_escaped=$(printf '%s' "$msg" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")
    if [ $first -eq 0 ]; then printf ','; fi
    printf '{"name":"%s","status":"%s","duration_ms":%s,"message":%s}' \
      "$name" "$status" "$dur" "$msg_escaped"
    first=0
  done
  printf ']}\n'
else
  RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
  echo ""
  echo "smoke-test-e2e: $ENV ($URL)"
  echo "=============================================="
  for r in "${RESULTS[@]}"; do
    name="${r%%|*}"; rest="${r#*|}"
    status="${rest%%|*}"; rest="${rest#*|}"
    dur="${rest%%|*}"; msg="${rest#*|}"
    if [ "$status" = "PASS" ]; then
      printf "  ${GREEN}[PASS]${NC} %-25s (%sms)  %s\n" "$name" "$dur" "$msg"
    else
      printf "  ${RED}[FAIL]${NC} %-25s (%sms)  %s\n" "$name" "$dur" "$msg"
    fi
  done
  echo ""
  echo "Result: $([ $FAIL -eq 0 ] && echo "ALL PASS" || echo "FAILURES PRESENT")"
fi

if [ "$CI" -eq 1 ] && [ $FAIL -eq 1 ]; then
  exit 1
fi
exit 0
