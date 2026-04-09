#!/usr/bin/env bash
# workers/crane-context/scripts/compute-schema-hash.sh
#
# Plan v3.1 §H.2: compute the canonical hash of the consolidated D1 schema.
#
# The hash represents the CURRENT full schema state = schema.sql (v1.0 base)
# + all incremental migrations 00NN_*.sql applied in order. This is NOT the
# hash of schema.sql alone (schema.sql is the v1.0 base, not the current
# consolidated state — see migrations/README.md for the distinction).
#
# The committed migrations/schema.hash file stores this value. The
# /admin/verify-schema worker endpoint compares live D1 sqlite_master
# against this hash to detect drift (invariant I-4).
#
# Run this script whenever a new incremental migration lands, then commit
# the updated migrations/schema.hash value alongside it.
#
# Requires: sqlite3 (any version ≥ 3.35), shasum (coreutils).
#
# Usage:
#   bash scripts/compute-schema-hash.sh            # prints hash to stdout
#   bash scripts/compute-schema-hash.sh --update   # writes to migrations/schema.hash
#   bash scripts/compute-schema-hash.sh --verify   # asserts committed hash matches computed hash (exit 1 on mismatch)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"
HASH_FILE="$MIGRATIONS_DIR/schema.hash"

MODE="${1:-print}"
case "$MODE" in
  --update) MODE="update" ;;
  --verify) MODE="verify" ;;
  --print|"") MODE="print" ;;
  *) echo "usage: $0 [--print|--update|--verify]" >&2; exit 2 ;;
esac

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "error: sqlite3 not found in PATH" >&2
  exit 2
fi
if ! command -v shasum >/dev/null 2>&1; then
  echo "error: shasum not found in PATH" >&2
  exit 2
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Load v1.0 base schema
sqlite3 "$TMP/db.db" < "$MIGRATIONS_DIR/schema.sql" > /dev/null

# Apply incremental migrations in sorted order. 00NN_*.sql only; schema.sql
# is already loaded above and should not be re-applied.
for f in $(ls "$MIGRATIONS_DIR"/00[0-9][0-9]_*.sql 2>/dev/null | sort); do
  sqlite3 "$TMP/db.db" < "$f" > /dev/null 2>&1 || {
    echo "error: failed to apply migration $f" >&2
    echo "This usually means schema.sql already contains columns or tables" >&2
    echo "introduced by the incremental migration. Reconcile manually." >&2
    exit 2
  }
done

# Canonical dump: tables and indexes, stable ordering, statement-terminated
# with ';' + newline so the output is a valid re-playable SQL script AND
# stable across SQLite versions.
CANONICAL=$(sqlite3 "$TMP/db.db" "
  SELECT sql || ';' || char(10)
  FROM sqlite_master
  WHERE type IN ('table','index')
    AND sql IS NOT NULL
    AND name NOT LIKE 'sqlite_%'
  ORDER BY type DESC, name
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
