-- 0042_dedupe_doc_requirements.sql
--
-- Defect: doc_requirements has accumulated 128x duplicate rows in production.
-- As of 2026-04-27: 1,152 rows / 9 distinct (doc_name_pattern, scope_type,
-- scope_venture) tuples.
--
-- Root cause: 0008_add_doc_requirements.sql declared
--   UNIQUE(doc_name_pattern, scope_type, scope_venture)
-- inside the CREATE TABLE statement, but the table was first created via
-- `CREATE TABLE IF NOT EXISTS` before the UNIQUE clause was added retroactively
-- (2026-04-08 idempotency pass). SQLite cannot retroactively add a column-level
-- UNIQUE constraint to an existing table — IF NOT EXISTS skips the new
-- definition. The audit code's `ensureDefaultsSeeded()` then performed
-- `INSERT OR IGNORE` on every crane_doc_audit invocation, but with no UNIQUE
-- index to honor, every call inserted 9 fresh rows. After ~128 audit runs the
-- table had 9 × 128 rows.
--
-- Symptom: crane_doc_audit output for any venture shows the same missing-doc
-- name printed dozens of times (truncation cap of 10 makes it look like the
-- same line repeated). Affected every venture, not just SS.
--
-- Fix:
-- 1. DELETE duplicate rows, keeping MIN(id) per unique tuple. COALESCE on
--    scope_venture because SQLite considers NULL distinct under UNIQUE
--    semantics; without it, the all_ventures rows (scope_venture IS NULL)
--    would still be allowed to dupe.
-- 2. CREATE UNIQUE INDEX with the same COALESCE expression so future
--    INSERT OR IGNORE calls have a real index to honor.
--
-- Idempotent: the DELETE re-runs to a no-op once duplicates are gone;
-- CREATE UNIQUE INDEX uses IF NOT EXISTS.

DELETE FROM doc_requirements
WHERE id NOT IN (
  SELECT MIN(id)
  FROM doc_requirements
  GROUP BY doc_name_pattern, scope_type, COALESCE(scope_venture, '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_requirements_unique
  ON doc_requirements(doc_name_pattern, scope_type, COALESCE(scope_venture, ''));
