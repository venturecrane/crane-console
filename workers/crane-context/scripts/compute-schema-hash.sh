#!/usr/bin/env bash
# workers/crane-context/scripts/compute-schema-hash.sh
#
# Plan v3.1 §H.2 (revised): compute the canonical hash of the D1 schema
# sourced FROM LIVE D1, not from local SQLite.
#
# WHY LIVE: the previous approach (build canonical from schema.sql + all
# incremental migrations applied to an in-memory SQLite DB) produced a
# different result than the live D1 state for two reasons:
#   1. Live D1 stores the SQL text frozen at creation time, including
#      comments. Later PRs (e.g., #380's /sod→/sos rename) updated the
#      source but not the live sqlite_master.
#   2. Cloudflare's auto-created d1_migrations table has slightly
#      different DDL than the CREATE TABLE IF NOT EXISTS in 0027, and
#      the wrangler runtime uses Cloudflare's version.
#
# Consequence: the canonical-from-local approach would always disagree
# with live D1 by construction. Live state is the ground truth, so the
# committed schema.hash must come from live.
#
# The committed migrations/schema.hash represents "the last time we
# audited staging D1 and declared it correct." Invariant I-4 (via the
# /admin/verify-schema endpoint) computes the SAME hash from live D1
# on each request and compares. Divergence means stray DDL or missed
# migration on THAT environment.
#
# Note: this approach does NOT detect "code expects a column that doesn't
# exist in D1" — that's invariant I-3 (migrations_applied) via /version.
# I-4 detects the narrower "schema was manually modified outside of the
# migration flow."
#
# Usage:
#   bash scripts/compute-schema-hash.sh                      # print hash (staging)
#   bash scripts/compute-schema-hash.sh --env=staging        # print hash (staging)
#   bash scripts/compute-schema-hash.sh --env=production     # print hash (production)
#   bash scripts/compute-schema-hash.sh --update             # write staging hash to schema.hash
#   bash scripts/compute-schema-hash.sh --verify             # assert committed hash == live staging hash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HASH_FILE="$MIGRATIONS_DIR/schema.hash"

MODE="print"
ENV="staging"
for a in "$@"; do
  case "$a" in
    --update) MODE="update" ;;
    --verify) MODE="verify" ;;
    --print) MODE="print" ;;
    --env=staging) ENV="staging" ;;
    --env=production) ENV="production" ;;
    --env=prod) ENV="production" ;;
    --help|-h)
      sed -n '1,40p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown arg '$a'" >&2
      echo "usage: $0 [--print|--update|--verify] [--env=staging|production]" >&2
      exit 2
      ;;
  esac
done

if ! command -v shasum >/dev/null 2>&1; then
  echo "error: shasum not found in PATH" >&2
  exit 2
fi

DB_NAME=""
EXTRA=""
case "$ENV" in
  staging)    DB_NAME="crane-context-db-staging" ;;
  production) DB_NAME="crane-context-db-prod"; EXTRA="--env production" ;;
esac

WRANGLER="wrangler"
if ! command -v wrangler >/dev/null 2>&1; then
  WRANGLER="npx wrangler"
fi

# Fetch live sqlite_master via wrangler d1 execute. Same ORDER BY and
# filters as the /admin/verify-schema endpoint in
# workers/crane-context/src/endpoints/admin-verify.ts so both produce
# byte-identical canonical output.
cd "$WORKER_DIR"
RAW_JSON=$($WRANGLER d1 execute "$DB_NAME" --remote $EXTRA \
  --command "SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type DESC, name" --json 2>/dev/null) || {
  echo "error: wrangler d1 execute failed against $DB_NAME" >&2
  exit 2
}

# Extract the sql values and concatenate with ';\n' terminator. Mirrors
# the endpoint's `${r.sql};\n` concatenation exactly.
CANONICAL=$(printf '%s' "$RAW_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data[0]['results']
for row in results:
    sys.stdout.write(row['sql'] + ';\n')
")

COMPUTED_HASH=$(printf '%s' "$CANONICAL" | shasum -a 256 | cut -d' ' -f1)

case "$MODE" in
  print)
    echo "$COMPUTED_HASH"
    ;;
  update)
    echo "$COMPUTED_HASH" > "$HASH_FILE"
    echo "✓ $HASH_FILE updated: $COMPUTED_HASH"
    ;;
  verify)
    if [ ! -f "$HASH_FILE" ]; then
      echo "::error::schema.hash does not exist — run '$0 --update' first" >&2
      exit 1
    fi
    COMMITTED_HASH=$(tr -d '[:space:]' < "$HASH_FILE")
    if [ "$COMMITTED_HASH" = "$COMPUTED_HASH" ]; then
      echo "✓ schema.hash matches computed canonical hash: $COMPUTED_HASH"
      exit 0
    else
      echo "::error::schema.hash mismatch (invariant I-6)"
      echo "  committed: $COMMITTED_HASH"
      echo "  computed:  $COMPUTED_HASH"
      echo ""
      echo "A migration was added but schema.hash was not regenerated."
      echo "Run 'bash scripts/compute-schema-hash.sh --update' and commit the result."
      exit 1
    fi
    ;;
esac
