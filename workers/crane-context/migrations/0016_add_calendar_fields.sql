-- Calendar integration: link schedule items to Google Calendar events,
-- add content-scan schedule item, and track work days.

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
