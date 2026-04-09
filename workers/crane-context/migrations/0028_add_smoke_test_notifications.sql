-- 0028_add_smoke_test_notifications.sql
--
-- Plan v3.1 §D.5 / D-7. Physical isolation of smoke-test synthetic data
-- from the real `notifications` table. Rationale: the end-to-end smoke
-- test mutates notification state (red → green auto-resolve) to prove
-- the Track A auto-resolver still works in staging. A sentinel column
-- on the real table would leak synthetic rows into operator views
-- if cleanup ever failed. A separate table is the safe isolation.
--
-- The schema mirrors `notifications` (migration 0015) exactly so the
-- auto-resolve logic can be reused unchanged. The only difference is
-- the table name, which the endpoint routes to based on a `?smoke=1`
-- query parameter or `X-Smoke-Test: 1` header.
--
-- Self-healing cleanup: the smoke-test entry point deletes rows older
-- than 1 hour at the START of every run (not the end). Idempotent,
-- and recovers from previous crashes.
--
-- Staging-only: the mutation endpoints that write to this table are
-- gated by env.ENVIRONMENT === 'staging' and return 403 in production.

CREATE TABLE IF NOT EXISTS smoke_test_notifications (
  id TEXT PRIMARY KEY,

  -- Mirror of the notifications table columns
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',

  summary TEXT NOT NULL,
  details_json TEXT NOT NULL,

  external_id TEXT,
  dedupe_hash TEXT NOT NULL,

  venture TEXT,
  repo TEXT,
  branch TEXT,
  environment TEXT,

  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  actor_key_id TEXT NOT NULL,

  -- Match key fields (mirroring 0023 for auto-resolve support)
  workflow_id INTEGER,
  workflow_name TEXT,
  run_id INTEGER,
  head_sha TEXT,
  match_key TEXT,
  match_key_version TEXT,
  run_started_at TEXT,
  auto_resolved_by_id TEXT,
  auto_resolve_reason TEXT,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_smoke_test_notif_status
  ON smoke_test_notifications(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_smoke_test_notif_dedupe
  ON smoke_test_notifications(dedupe_hash);

CREATE INDEX IF NOT EXISTS idx_smoke_test_notif_match_open
  ON smoke_test_notifications(match_key, status)
  WHERE status IN ('new', 'acked');
