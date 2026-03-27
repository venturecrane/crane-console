-- Migration 0018: Add last_activity_at for accurate session end-time tracking
-- When /eos runs late, last_activity_at captures when the agent actually stopped working
-- (derived from Claude Code session JSONL logs at handoff time)

ALTER TABLE sessions ADD COLUMN last_activity_at TEXT;
