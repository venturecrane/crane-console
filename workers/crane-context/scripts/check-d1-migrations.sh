#!/usr/bin/env bash
# workers/crane-context/scripts/check-d1-migrations.sh
#
# Plan v3.1 §D.3 / I-3b: pre-flight guard that refuses to run
# `wrangler d1 migrations apply` against a database where d1_migrations is
# empty or below the expected minimum. This guards against the 0027
# foot-gun: if someone runs `migrations apply` on a populated DB whose
# d1_migrations table is empty, wrangler would try to re-run all 26
# historical migrations — many non-idempotent — and corrupt production D1.
#
# Usage:
#   bash scripts/check-d1-migrations.sh staging
#   bash scripts/check-d1-migrations.sh production
#
# Exit 0: d1_migrations has at least MIN_EXPECTED rows; safe to `apply`.
# Exit 1: d1_migrations is empty or below minimum; apply 0027 first.
# Exit 2: invalid args or wrangler unavailable.

set -euo pipefail

ENV="${1:-}"
if [ -z "$ENV" ]; then
  echo "usage: $0 <staging|production>" >&2
  exit 2
fi

# Minimum expected d1_migrations row count. Must be ≥ the number of
# migrations committed before 0027 backfill. Update when new migrations land.
MIN_EXPECTED=25

DB_NAME=""
EXTRA_ARGS=""
case "$ENV" in
  staging)
    DB_NAME="crane-context-db-staging"
    ;;
  production|prod)
    DB_NAME="crane-context-db-prod"
    EXTRA_ARGS="--env production"
    ;;
  *)
    echo "error: unknown env '$ENV' (want staging|production)" >&2
    exit 2
    ;;
esac

if ! command -v wrangler >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
  echo "error: neither wrangler nor npx found in PATH" >&2
  exit 2
fi

WRANGLER="wrangler"
if ! command -v wrangler >/dev/null 2>&1; then
  WRANGLER="npx wrangler"
fi

RESULT=$(
  $WRANGLER d1 execute "$DB_NAME" --remote $EXTRA_ARGS \
    --command "SELECT COUNT(*) AS n FROM d1_migrations" --json 2>/dev/null || true
)

# Parse the count from the JSON response. Wrangler's output shape:
# [{"results":[{"n":25}], "success":true, ...}]
COUNT=$(echo "$RESULT" | grep -oE '"n"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | head -1 || true)

if [ -z "$COUNT" ]; then
  echo "::error::check-d1-migrations: could not parse d1_migrations count from wrangler response"
  echo "Raw response: $RESULT"
  echo ""
  echo "Most likely cause: d1_migrations table does not exist. Apply migration 0027"
  echo "via 'wrangler d1 execute --remote --file=./migrations/0027_backfill_d1_migrations.sql'"
  echo "before running 'wrangler d1 migrations apply'."
  exit 1
fi

if [ "$COUNT" -lt "$MIN_EXPECTED" ]; then
  echo "::error::check-d1-migrations: $DB_NAME has $COUNT d1_migrations rows; expected >= $MIN_EXPECTED"
  echo ""
  echo "This means 0027 backfill has not been applied to this env yet."
  echo "Running 'wrangler d1 migrations apply' now would attempt to re-apply all"
  echo "historical migrations (0003..0026), many of which are non-idempotent"
  echo "(e.g., ALTER TABLE ADD COLUMN) and would corrupt the database."
  echo ""
  echo "Apply 0027 first:"
  echo "  wrangler d1 execute $DB_NAME --remote $EXTRA_ARGS \\"
  echo "    --file=./migrations/0027_backfill_d1_migrations.sql"
  echo ""
  echo "Then re-run this check."
  exit 1
fi

echo "✓ $DB_NAME: d1_migrations has $COUNT rows (>= $MIN_EXPECTED). Safe to run 'migrations apply'."
exit 0
