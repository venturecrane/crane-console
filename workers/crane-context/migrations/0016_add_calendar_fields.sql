-- Calendar integration: link schedule items to Google Calendar events,
-- add content-scan schedule item, and track work days.
--
-- 2026-04-08 retroactive idempotency note (see 0027):
-- ALTER TABLE ADD COLUMN has no IF NOT EXISTS syntax in SQLite (as of 3.46).
-- Re-running this migration against an env where it was already applied will
-- throw "duplicate column name: gcal_event_id". Protection is the d1_migrations
-- tracking table populated by 0027 + the I-3b CI guard. Do not run this file
-- directly via `wrangler d1 execute --file` on a populated database.

-- Calendar link for schedule items
ALTER TABLE schedule_items ADD COLUMN gcal_event_id TEXT;

-- Missing schedule item
INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, enabled, created_at, updated_at)
VALUES ('sched_seed_013', 'content-scan', 'Content Scan', 'Scan all venture sites for content quality and distribution candidates', 7, 'global', 2, 1, datetime('now'), datetime('now'));

-- Work day tracking (simple: start/end only, no venture breakdown yet)
CREATE TABLE IF NOT EXISTS work_days (
  date TEXT PRIMARY KEY,
  gcal_event_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
