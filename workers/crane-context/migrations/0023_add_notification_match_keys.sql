-- Migration 0023: Add notification match keys for auto-resolve
--
-- Adds the structural fields the auto-resolver needs to match a green
-- workflow_run / check_suite / check_run / Vercel deployment event back to
-- prior failure notifications. Without these columns, the only way to find
-- the matching open notifications would be to json_extract() through the
-- details_json blob on a hot path, which cannot use indexes and would be a
-- subtle source of slowness as the table grows.
--
-- The columns are nullable and additive. Existing code paths do not read
-- them, so this migration is backward-compatible. New code in PR A2 will
-- start writing them on every insert; the in-migration backfill below
-- populates the columns for legacy rows from their existing details_json.
--
-- Match key formats (all use repository.full_name = owner/repo to prevent
-- cross-org collision):
--   gh:wf:<owner>/<repo>:<branch>:<workflow_id>     (workflow_run, v2_id)
--   gh:wf:<owner>/<repo>:<branch>:<workflow_name>   (workflow_run, v1_name legacy)
--   gh:cs:<owner>/<repo>:<branch>:<app_id>          (check_suite, v2_id)
--   gh:cs:<owner>/<repo>:<branch>:<app_name>        (check_suite, v1_name legacy)
--   gh:cr:<owner>/<repo>:<branch>:<app_id>:<name>   (check_run, v2_id)
--   gh:cr:<owner>/<repo>:<branch>:<app_name>:<name> (check_run, v1_name legacy)
--   vc:dpl:<owner>/<repo>:<branch>:<project>:<target> (Vercel deployment)

-- ============================================================================
-- New columns: structural identifiers from upstream events
-- ============================================================================
--
-- 2026-04-08 retroactive idempotency note (see 0027):
-- ALTER TABLE ADD COLUMN has no IF NOT EXISTS syntax in SQLite (as of 3.46).
-- Re-running this migration against an env where it was already applied will
-- throw "duplicate column name: workflow_id". Protection is the d1_migrations
-- tracking table populated by 0027 + the I-3b CI guard.

ALTER TABLE notifications ADD COLUMN workflow_id INTEGER;
ALTER TABLE notifications ADD COLUMN workflow_name TEXT;
ALTER TABLE notifications ADD COLUMN run_id INTEGER;
ALTER TABLE notifications ADD COLUMN head_sha TEXT;
ALTER TABLE notifications ADD COLUMN check_suite_id INTEGER;
ALTER TABLE notifications ADD COLUMN check_run_id INTEGER;
ALTER TABLE notifications ADD COLUMN app_id INTEGER;
ALTER TABLE notifications ADD COLUMN app_name TEXT;
ALTER TABLE notifications ADD COLUMN deployment_id TEXT;
ALTER TABLE notifications ADD COLUMN project_name TEXT;
ALTER TABLE notifications ADD COLUMN target TEXT;

-- ============================================================================
-- Composite match key for the auto-resolver query path
-- ============================================================================

ALTER TABLE notifications ADD COLUMN match_key TEXT;
ALTER TABLE notifications ADD COLUMN match_key_version TEXT;
ALTER TABLE notifications ADD COLUMN run_started_at TEXT;

-- ============================================================================
-- Auto-resolve audit fields
-- ============================================================================

ALTER TABLE notifications ADD COLUMN auto_resolved_by_id TEXT;
ALTER TABLE notifications ADD COLUMN auto_resolve_reason TEXT;
ALTER TABLE notifications ADD COLUMN resolved_at TEXT;

-- ============================================================================
-- Indexes
-- ============================================================================

-- Hot path index for the auto-resolver: find open notifications with a
-- specific match_key. Partial index on (new, acked) keeps it small.
CREATE INDEX IF NOT EXISTS idx_notif_match_open
  ON notifications(match_key, status)
  WHERE status IN ('new', 'acked');

-- For the audit query "show me all rows resolved by this green event"
CREATE INDEX IF NOT EXISTS idx_notif_auto_resolved_by
  ON notifications(auto_resolved_by_id);

-- For the forward-in-time predicate during candidate selection
CREATE INDEX IF NOT EXISTS idx_notif_run_started
  ON notifications(match_key, run_started_at);

-- ============================================================================
-- Backfill legacy github workflow_run rows from details_json
-- ============================================================================

UPDATE notifications
SET workflow_name = json_extract(details_json, '$.workflow_name'),
    run_id = json_extract(details_json, '$.run_id'),
    head_sha = json_extract(details_json, '$.commit_sha')
WHERE source = 'github'
  AND event_type LIKE 'workflow_run.%'
  AND workflow_name IS NULL;

-- ============================================================================
-- Backfill legacy github check_suite rows
-- ============================================================================

UPDATE notifications
SET check_suite_id = json_extract(details_json, '$.check_suite_id'),
    head_sha = json_extract(details_json, '$.commit_sha'),
    app_name = json_extract(details_json, '$.app_name')
WHERE source = 'github'
  AND event_type LIKE 'check_suite.%'
  AND check_suite_id IS NULL;

-- ============================================================================
-- Backfill legacy github check_run rows
-- ============================================================================

UPDATE notifications
SET check_run_id = json_extract(details_json, '$.check_run_id'),
    head_sha = json_extract(details_json, '$.commit_sha'),
    app_name = json_extract(details_json, '$.app_name')
WHERE source = 'github'
  AND event_type LIKE 'check_run.%'
  AND check_run_id IS NULL;

-- ============================================================================
-- Backfill legacy vercel rows
-- ============================================================================

UPDATE notifications
SET deployment_id = json_extract(details_json, '$.deployment_id'),
    project_name = json_extract(details_json, '$.project_name'),
    target = json_extract(details_json, '$.target')
WHERE source = 'vercel'
  AND deployment_id IS NULL;

-- ============================================================================
-- Compute match_key for legacy github workflow_run rows (v1_name format)
-- Uses workflow_name as the discriminator since legacy rows don't have
-- workflow_id stored. New rows from PR A2 will use v2_id (workflow_id).
-- ============================================================================

UPDATE notifications
SET match_key = 'gh:wf:' || repo || ':' || branch || ':' || workflow_name,
    match_key_version = 'v1_name'
WHERE source = 'github'
  AND event_type LIKE 'workflow_run.%'
  AND workflow_name IS NOT NULL
  AND repo IS NOT NULL
  AND branch IS NOT NULL
  AND match_key IS NULL;

-- ============================================================================
-- Compute match_key for legacy github check_suite rows
-- ============================================================================

UPDATE notifications
SET match_key = 'gh:cs:' || repo || ':' || branch || ':' || COALESCE(app_name, ''),
    match_key_version = 'v1_name'
WHERE source = 'github'
  AND event_type LIKE 'check_suite.%'
  AND repo IS NOT NULL
  AND branch IS NOT NULL
  AND match_key IS NULL;

-- ============================================================================
-- Compute match_key for legacy github check_run rows
-- check_name is stored inside details_json for legacy rows
-- ============================================================================

UPDATE notifications
SET match_key = 'gh:cr:' || repo || ':' || branch || ':' || COALESCE(app_name, '') || ':' || COALESCE(json_extract(details_json, '$.check_name'), ''),
    match_key_version = 'v1_name'
WHERE source = 'github'
  AND event_type LIKE 'check_run.%'
  AND repo IS NOT NULL
  AND branch IS NOT NULL
  AND match_key IS NULL;

-- ============================================================================
-- Compute match_key for legacy vercel rows
-- ============================================================================

UPDATE notifications
SET match_key = 'vc:dpl:' || repo || ':' || branch || ':' || COALESCE(project_name, '') || ':' || COALESCE(target, ''),
    match_key_version = 'v1_name'
WHERE source = 'vercel'
  AND repo IS NOT NULL
  AND branch IS NOT NULL
  AND match_key IS NULL;
