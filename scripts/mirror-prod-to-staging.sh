#!/bin/bash
#
# Mirror Production D1 Data to Staging
#
# Exports data from production D1 databases and imports into staging.
# Two-phase design: export all tables first, then import all.
# Safe to re-run (idempotent - deletes staging data before import).
#
# Usage:
#   ./scripts/mirror-prod-to-staging.sh [crane-context|crane-classifier|all]
#   Default: all
#

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TARGET="${1:-all}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -d "$REPO_ROOT/workers" ]; then
    log_err "Cannot find workers/ directory. Run from the crane-console repo."
    exit 1
fi

# crane-context
CC_DIR="$REPO_ROOT/workers/crane-context"
CC_PROD_DB="crane-context-db-prod"
CC_STAGING_DB="crane-context-db-staging"
CC_TABLES=(sessions handoffs checkpoints context_docs context_scripts doc_requirements machines notes request_log)
CC_SKIP=(idempotency_keys rate_limits)

# crane-classifier
CL_DIR="$REPO_ROOT/workers/crane-classifier"
CL_PROD_DB="crane-classifier-db"
CL_STAGING_DB="crane-classifier-db-staging"
CL_TABLES=(classify_runs)

# Internal tables always skipped
INTERNAL_SKIP=(_cf_KV d1_migrations sqlite_sequence)

# ---------------------------------------------------------------------------
# Temp directory with cleanup trap
# ---------------------------------------------------------------------------

TMPDIR=$(mktemp -d /tmp/d1-mirror-XXXXXX)
chmod 700 "$TMPDIR"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Counters for summary
# ---------------------------------------------------------------------------

declare -a SUMMARY_LINES=()
TOTAL_EXPORTED=0
TOTAL_IMPORTED=0
TOOBIG_SKIPPED=0
ERRORS=0

# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

count_inserts() {
    local file="$1"
    local n
    n=$(grep -c '^INSERT ' "$file" 2>/dev/null) || true
    echo "${n:-0}"
}

export_table() {
    local db="$1"
    local table="$2"
    local cwd="$3"
    local outfile="$TMPDIR/${db}__${table}.sql"

    log_info "  Exporting $table from $db ..." >&2
    npx wrangler d1 export "$db" \
        --remote \
        --no-schema \
        --table "$table" \
        --output "$outfile" \
        --env production \
        --cwd "$cwd" 2>&1 | while IFS= read -r line; do echo "    $line" >&2; done

    if [ ! -s "$outfile" ]; then
        echo 0
        return
    fi

    local count
    count=$(count_inserts "$outfile")
    echo "$count"
}

import_table() {
    local staging_db="$1"
    local table="$2"
    local cwd="$3"
    local prod_db="$4"
    local export_count="$5"
    local infile="$TMPDIR/${prod_db}__${table}.sql"

    if [ "$export_count" -eq 0 ]; then
        log_warn "  $table: empty in prod, skipping import"
        SUMMARY_LINES+=("  $table: 0 rows (empty)")
        return
    fi

    # Delete existing staging data
    log_info "  Clearing $table in staging ..."
    npx wrangler d1 execute "$staging_db" \
        --remote \
        --command "DELETE FROM $table;" \
        -y \
        --cwd "$cwd" 2>&1 | while IFS= read -r line; do echo "    $line" >&2; done

    # Reset AUTOINCREMENT counter for doc_requirements
    if [ "$table" = "doc_requirements" ]; then
        log_info "  Resetting AUTOINCREMENT for $table ..."
        npx wrangler d1 execute "$staging_db" \
            --remote \
            --command "DELETE FROM sqlite_sequence WHERE name='doc_requirements';" \
            -y \
            --cwd "$cwd" 2>&1 | while IFS= read -r line; do echo "    $line" >&2; done
    fi

    # Import data - try batch first, fall back to per-statement for large rows
    log_info "  Importing $table ($export_count rows) ..."
    local import_output
    import_output=$(npx wrangler d1 execute "$staging_db" \
        --remote \
        --file "$infile" \
        -y \
        --cwd "$cwd" 2>&1) || true
    echo "$import_output" | while IFS= read -r line; do echo "    $line" >&2; done

    local used_fallback=0
    if echo "$import_output" | grep -q 'SQLITE_TOOBIG'; then
        used_fallback=1
        log_warn "  Batch import hit SQLITE_TOOBIG, falling back to per-statement ..."
        local stmt_num=0
        local stmt_ok=0
        local stmt_toobig=0
        while IFS= read -r stmt; do
            stmt_num=$((stmt_num + 1))
            local stmt_file="$TMPDIR/${prod_db}__${table}__stmt${stmt_num}.sql"
            echo "$stmt" > "$stmt_file"
            local stmt_out
            stmt_out=$(npx wrangler d1 execute "$staging_db" \
                --remote \
                --file "$stmt_file" \
                -y \
                --cwd "$cwd" 2>&1) || true
            if echo "$stmt_out" | grep -q 'SQLITE_TOOBIG'; then
                stmt_toobig=$((stmt_toobig + 1))
                log_warn "    Statement $stmt_num skipped (exceeds D1 100KB statement limit)" >&2
            elif echo "$stmt_out" | grep -q '\[ERROR\]'; then
                log_err "    Statement $stmt_num failed" >&2
                echo "$stmt_out" | while IFS= read -r line; do echo "      $line" >&2; done
            else
                stmt_ok=$((stmt_ok + 1))
            fi
        done < <(grep '^INSERT ' "$infile")
        log_info "  Per-statement: $stmt_ok imported, $stmt_toobig skipped (TOOBIG)" >&2
        TOOBIG_SKIPPED=$((TOOBIG_SKIPPED + stmt_toobig))
    fi

    # Verify row count
    local verify_output
    verify_output=$(npx wrangler d1 execute "$staging_db" \
        --remote \
        --command "SELECT COUNT(*) as cnt FROM $table;" \
        -y \
        --cwd "$cwd" 2>&1)

    local imported_count
    imported_count=$(echo "$verify_output" | grep -oE '"cnt":\s*[0-9]+' | grep -oE '[0-9]+' | head -1)

    if [ -z "$imported_count" ]; then
        imported_count="?"
    fi

    if [ "$imported_count" = "$export_count" ]; then
        log_ok "  $table: $imported_count rows (verified)"
        SUMMARY_LINES+=("  $table: $imported_count rows OK")
        TOTAL_IMPORTED=$((TOTAL_IMPORTED + imported_count))
    elif [ "$used_fallback" -eq 1 ]; then
        local skipped=$((export_count - imported_count))
        log_warn "  $table: $imported_count/$export_count rows ($skipped skipped, TOOBIG)"
        SUMMARY_LINES+=("  $table: $imported_count/$export_count rows ($skipped TOOBIG)")
        TOTAL_IMPORTED=$((TOTAL_IMPORTED + imported_count))
    else
        log_err "  $table: count mismatch! exported=$export_count imported=$imported_count"
        SUMMARY_LINES+=("  $table: MISMATCH exported=$export_count imported=$imported_count")
        ERRORS=$((ERRORS + 1))
    fi
}

mirror_worker() {
    local name="$1"
    local cwd="$2"
    local prod_db="$3"
    local staging_db="$4"
    shift 4
    local tables=("$@")

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $name${NC}"
    echo -e "${BLUE}  prod: $prod_db → staging: $staging_db${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    SUMMARY_LINES+=("")
    SUMMARY_LINES+=("$name:")

    # Phase 1: Export all tables
    log_info "Phase 1: Export from production"
    echo ""

    for table in "${tables[@]}"; do
        local count
        count=$(export_table "$prod_db" "$table" "$cwd")
        # Store count in a file (bash 3.2 has no associative arrays)
        echo "$count" > "$TMPDIR/${prod_db}__${table}.count"
        TOTAL_EXPORTED=$((TOTAL_EXPORTED + count))
        echo ""
    done

    # Phase 2: Import into staging
    log_info "Phase 2: Import into staging"
    echo ""

    for table in "${tables[@]}"; do
        local export_count
        export_count=$(cat "$TMPDIR/${prod_db}__${table}.count")
        import_table "$staging_db" "$table" "$cwd" "$prod_db" "$export_count"
        echo ""
    done
}

# ---------------------------------------------------------------------------
# Validate target
# ---------------------------------------------------------------------------

case "$TARGET" in
    crane-context|crane-classifier|all)
        ;;
    *)
        log_err "Unknown target: $TARGET"
        echo "  Usage: $0 [crane-context|crane-classifier|all]"
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  D1 Prod → Staging Mirror${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
log_info "Target: $TARGET"
log_info "Temp dir: $TMPDIR"
echo ""

if [ "$TARGET" = "crane-context" ] || [ "$TARGET" = "all" ]; then
    mirror_worker "crane-context" "$CC_DIR" "$CC_PROD_DB" "$CC_STAGING_DB" "${CC_TABLES[@]}"
fi

if [ "$TARGET" = "crane-classifier" ] || [ "$TARGET" = "all" ]; then
    mirror_worker "crane-classifier" "$CL_DIR" "$CL_PROD_DB" "$CL_STAGING_DB" "${CL_TABLES[@]}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

for line in "${SUMMARY_LINES[@]}"; do
    echo -e "$line"
done

echo ""
log_info "Total exported: $TOTAL_EXPORTED rows"
log_info "Total imported: $TOTAL_IMPORTED rows"
if [ "$TOOBIG_SKIPPED" -gt 0 ]; then
    log_warn "Skipped: $TOOBIG_SKIPPED row(s) exceed D1 100KB statement limit"
fi

if [ "$ERRORS" -gt 0 ]; then
    log_err "$ERRORS count mismatch(es) detected"
    exit 1
else
    log_ok "Mirror complete"
fi
