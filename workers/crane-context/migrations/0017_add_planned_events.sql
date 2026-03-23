-- Migration 0017: Add planned_events table for work planning and calendar sync
-- Date: 2026-03-22

CREATE TABLE IF NOT EXISTS planned_events (
  id TEXT PRIMARY KEY,
  event_date TEXT NOT NULL,
  venture TEXT NOT NULL,
  gcal_event_id TEXT,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'planned',
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_planned_events_date ON planned_events(event_date);
CREATE INDEX idx_planned_events_type_date ON planned_events(type, event_date);
CREATE INDEX idx_planned_events_venture ON planned_events(venture, event_date);

-- Index for /calendar-sync session history query
CREATE INDEX IF NOT EXISTS idx_sessions_venture_created
  ON sessions(venture, created_at DESC);
