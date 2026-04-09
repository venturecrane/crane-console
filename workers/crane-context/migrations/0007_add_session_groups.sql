-- Crane Context Worker - Session Grouping
-- Version: 1.0
-- Date: 2026-02-02
-- Reference: Issue #119 - Session grouping for parallel agent awareness

-- ============================================================================
-- Add session_group_id to sessions table
-- ============================================================================
-- Enables agents working on different tasks in the same project to have
-- awareness of sibling sessions. Sessions with the same group_id are "siblings".

-- NOTE: ALTER TABLE ADD COLUMN has no IF NOT EXISTS syntax in SQLite (as of 3.46).
-- Re-running this migration against an env where it was already applied will
-- throw "duplicate column name: session_group_id". Protection against re-run
-- is the d1_migrations tracking table populated by 0027 + the I-3b CI guard.
-- Do not run this file directly via `wrangler d1 execute --file` on a populated
-- database; use `wrangler d1 migrations apply` which honors d1_migrations.
ALTER TABLE sessions ADD COLUMN session_group_id TEXT;

-- Index for finding sibling sessions
-- 2026-04-08 retroactive idempotency guard (see 0027) — do not remove.
CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(
  session_group_id, status, last_heartbeat_at DESC
) WHERE session_group_id IS NOT NULL;
