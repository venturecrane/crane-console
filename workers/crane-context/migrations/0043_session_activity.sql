-- 0043_session_activity.sql
--
-- Adds per-minute session activity tracking so session-history reflects when
-- agents were actually working, not when /sos/eos/heartbeat happened to fire.
--
-- Two changes:
--   1) sessions.client_session_id — Claude Code session UUID, captured at /sos
--      time via process.ppid → ~/.claude/sessions/<ppid>.json. Required to
--      locate the JSONL transcript when /sos backfills the prior session.
--   2) session_activity — minute-bucketed activity log written by crane_sos
--      (for the prior session) and crane_eos (for the current session) by
--      parsing the local Claude Code JSONL transcript. Minute-bucket PK
--      provides natural dedupe across re-parses; INSERT OR IGNORE makes
--      writes idempotent.
--
-- Idempotency note: ALTER TABLE ADD COLUMN has no IF NOT EXISTS in SQLite
-- (as of 3.46). Re-running this migration against an env where it was already
-- applied throws "duplicate column name: client_session_id". Protection is
-- the d1_migrations tracking table (populated by 0027) plus the I-3b CI
-- guard. See migrations/README.md.
--
-- Rollback: forward-only. Reverting the worker deployment leaves the column
-- and table inert; the new code paths short-circuit when no rows exist.
-- DELETE FROM d1_migrations WHERE name = '0043_session_activity.sql';
-- DROP TABLE IF EXISTS session_activity;
-- (column drop requires SQLite 3.35+ rebuild dance; not worth it.)

ALTER TABLE sessions ADD COLUMN client_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_client_session
  ON sessions(client_session_id)
  WHERE client_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS session_activity (
  session_id TEXT NOT NULL,
  minute_bucket TEXT NOT NULL,           -- ISO8601 floored to minute, e.g. 2026-04-29T14:32:00Z
  source TEXT NOT NULL,                  -- 'cc_jsonl' (only source in v1)
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (session_id, minute_bucket)
);

CREATE INDEX IF NOT EXISTS idx_session_activity_session
  ON session_activity(session_id, minute_bucket);

CREATE INDEX IF NOT EXISTS idx_session_activity_time
  ON session_activity(minute_bucket);
