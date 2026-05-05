#!/bin/bash
#
# Parallel Isolation Weekly Metrics (#788)
#
# Reads ~/.claude/projects/<encoded>/*.jsonl and the per-repo
# .claude/parallel-isolation-log/provision.log to compute:
#
#   - Sessions per venture (last N days)
#   - Active-tool-call overlap pairs per venture (sharper than session-range
#     overlap: only counts overlap during actual tool-use windows, ignoring
#     idle time)
#   - Days with at least one overlap
#   - Clone-fallback rate (cp_clonefile vs npm_ci vs failure)
#
# Usage:
#   scripts/parallel-isolation-metrics.sh [days] [--json|--markdown]
#
# Default: last 7 days, markdown output.

set -e

DAYS=${1:-7}
FORMAT=${2:-markdown}

# Validate args.
case "$FORMAT" in
  --json|json)     FORMAT=json ;;
  --markdown|md|*) FORMAT=markdown ;;
esac

PROJECTS_DIR="$HOME/.claude/projects"
SINCE_EPOCH=$(date -v "-${DAYS}d" +%s 2>/dev/null) || SINCE_EPOCH=$(date -d "-${DAYS} days" +%s)

if [ ! -d "$PROJECTS_DIR" ]; then
  echo "no projects directory at $PROJECTS_DIR" >&2
  exit 1
fi

# tmp file holds rows: encoded_path|session_id|first_tool_ts|last_tool_ts
TMP=$(mktemp -t parallel-iso-metrics)
trap 'rm -f "$TMP"' EXIT

# Iterate venture project dirs.
for venture_dir in "$PROJECTS_DIR"/-Users-scottdurgan-dev-*; do
  [ -d "$venture_dir" ] || continue
  encoded=$(basename "$venture_dir")
  for jsonl in "$venture_dir"/*.jsonl; do
    [ -f "$jsonl" ] || continue
    # Extract first/last timestamps where type == assistant and tool_use is present.
    # If a session never produced a tool_use, skip — nothing to compare.
    # Single jq pass; awk picks min/max in one pass to avoid SIGPIPE on
    # head/tail closing the sort pipe early. `|| true` because read returns
    # non-zero on empty input and set -e would abort the loop.
    range_pair=$(jq -r 'select(.type == "assistant") | select((.message.content // []) | any(.type == "tool_use")) | .timestamp' "$jsonl" 2>/dev/null | awk 'NR==1{f=$0; l=$0} {if($0<f)f=$0; if($0>l)l=$0} END{if(f)print f, l}') || true
    [ -z "$range_pair" ] && continue
    first=${range_pair% *}
    last=${range_pair#* }
    [ -z "$first" ] || [ -z "$last" ] && continue
    # Filter by recency: drop files whose last tool-use is older than SINCE.
    last_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${last%.*}" +%s 2>/dev/null) || \
                last_epoch=$(date -d "$last" +%s 2>/dev/null) || continue
    [ "$last_epoch" -lt "$SINCE_EPOCH" ] && continue
    session_id=$(basename "$jsonl" .jsonl)
    echo "$encoded|$session_id|$first|$last" >> "$TMP"
  done
done

# Decode pretty venture name from encoded path.
decode_venture() {
  echo "$1" | sed 's|^-Users-scottdurgan-dev-||' | sed 's|--claude-worktrees-.*$| (worktree)|'
}

# Compute overlap pairs per venture using awk on the sorted-by-venture rows.
# Overlap: pair (a,b) overlaps if a.first < b.last AND b.first < a.last.
compute_overlaps() {
  awk -F'|' '
    {
      v=$1; s=$2; f=$3; l=$4
      n[v]++
      i = n[v]
      first[v,i] = f
      last[v,i] = l
      session[v,i] = s
    }
    END {
      for (v in n) {
        cnt = n[v]
        pairs = 0
        delete days_set
        for (i = 1; i <= cnt; i++) {
          for (j = i + 1; j <= cnt; j++) {
            if (first[v,i] < last[v,j] && first[v,j] < last[v,i]) {
              pairs++
              # day-with-overlap (UTC date of the overlap start)
              start = (first[v,i] > first[v,j]) ? first[v,i] : first[v,j]
              day = substr(start, 1, 10)
              days_set[day] = 1
            }
          }
        }
        days = 0
        for (d in days_set) days++
        printf "%s|%d|%d|%d\n", v, cnt, pairs, days
      }
    }
  ' "$TMP" | sort
}

OVERLAPS=$(compute_overlaps)

# Provision log scan: walks every venture repo's parallel-isolation-log
# (best-effort; venture repos must exist locally to count).
DEV_DIR="$HOME/dev"
total_clones=0
total_npm_ci=0
total_failed=0
total_skip=0
PROV_DETAIL=""
if [ -d "$DEV_DIR" ]; then
  for repo in "$DEV_DIR"/*-console "$DEV_DIR"/dc-marketing "$DEV_DIR"/vc-web; do
    [ -d "$repo" ] || continue
    log="$repo/.claude/parallel-isolation-log/provision.log"
    [ -f "$log" ] || continue
    # Filter by SINCE_EPOCH on the leading ISO timestamp.
    while IFS= read -r line; do
      ts=$(echo "$line" | awk '{print $1}')
      [ -z "$ts" ] && continue
      ts_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${ts%Z}" +%s 2>/dev/null) || continue
      [ "$ts_epoch" -lt "$SINCE_EPOCH" ] && continue
      method=$(echo "$line" | grep -oE 'method=[^ ]+' | cut -d= -f2)
      result=$(echo "$line" | grep -oE 'result=[^ ]+' | cut -d= -f2)
      case "$method" in
        cp_clonefile)
          [ "$result" = "ok" ] && total_clones=$((total_clones + 1)) || total_failed=$((total_failed + 1)) ;;
        npm_ci|npm_ci_after_clone_fail)
          [ "$result" = "ok" ] && total_npm_ci=$((total_npm_ci + 1)) || total_failed=$((total_failed + 1)) ;;
        skip)
          total_skip=$((total_skip + 1)) ;;
      esac
    done < "$log"
  done
fi

# Output.
if [ "$FORMAT" = "json" ]; then
  jq -n \
    --argjson days "$DAYS" \
    --arg overlaps "$OVERLAPS" \
    --argjson clones "$total_clones" \
    --argjson npm_ci "$total_npm_ci" \
    --argjson failed "$total_failed" \
    --argjson skip "$total_skip" \
    '{
      window_days: $days,
      overlaps_by_venture: ($overlaps | split("\n") | map(select(length > 0) | split("|") | {venture: .[0], sessions: (.[1]|tonumber), overlap_pairs: (.[2]|tonumber), days_with_overlap: (.[3]|tonumber)})),
      provisioning: {
        cp_clonefile_ok: $clones,
        npm_ci_ok: $npm_ci,
        skipped: $skip,
        failed: $failed,
        clone_fallback_rate: (if ($clones + $npm_ci) > 0 then ($npm_ci / ($clones + $npm_ci)) else 0 end)
      }
    }'
else
  echo "## Parallel-Isolation Metrics (last $DAYS days)"
  echo ""
  echo "### Overlap by venture"
  echo ""
  echo "| Venture | Sessions | Active-tool-call overlap pairs | Days w/ overlap |"
  echo "|---|---|---|---|"
  if [ -z "$OVERLAPS" ]; then
    echo "| _(no sessions in window)_ | - | - | - |"
  else
    while IFS='|' read -r v cnt pairs days; do
      [ -z "$v" ] && continue
      pretty=$(decode_venture "$v")
      echo "| $pretty | $cnt | $pairs | $days |"
    done <<< "$OVERLAPS"
  fi
  echo ""
  echo "### Provisioning"
  echo ""
  total_provisions=$((total_clones + total_npm_ci))
  if [ "$total_provisions" -gt 0 ]; then
    fallback_rate=$(awk -v n="$total_npm_ci" -v t="$total_provisions" 'BEGIN{ printf "%.1f", (n*100)/t }')
  else
    fallback_rate="n/a"
  fi
  echo "| Method | Count |"
  echo "|---|---|"
  echo "| cp_clonefile (APFS) | $total_clones |"
  echo "| npm_ci fallback | $total_npm_ci |"
  echo "| skipped | $total_skip |"
  echo "| failed | $total_failed |"
  echo ""
  echo "**Clone-fallback rate**: ${fallback_rate}% of successful provisions used npm_ci instead of cp_clonefile."
  echo ""
  echo "_Window: last $DAYS days. Active tool-call overlap: pair counts only when both sessions have actual tool-use timestamps within each other's range, ignoring idle time. Sharper signal than raw session-range overlap._"
fi
