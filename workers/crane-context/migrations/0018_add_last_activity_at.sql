-- Migration 0018: Add last_activity_at for accurate session end-time tracking
-- When /eos runs late, last_activity_at captures when the agent actually stopped working
-- (derived from Claude Code session JSONL logs at handoff time)
--
-- 2026-04-08 retroactive idempotency note (see 0027):
-- ALTER TABLE ADD COLUMN has no IF NOT EXISTS syntax in SQLite (as of 3.46).
-- Re-running this migration against an env where it was already applied will
-- throw "duplicate column name: last_activity_at". Protection is the
-- d1_migrations tracking table populated by 0027 + the I-3b CI guard.

ALTER TABLE sessions ADD COLUMN last_activity_at TEXT;
