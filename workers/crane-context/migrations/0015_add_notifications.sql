-- Migration 0015: Add notifications table for CI/CD event tracking
-- Stores normalized notifications from GitHub Actions and Vercel deployments

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,                    -- notif_<ULID>

  -- Source and classification
  source TEXT NOT NULL,                   -- 'github' or 'vercel'
  event_type TEXT NOT NULL,               -- e.g. 'workflow_run.failure', 'deployment.error'
  severity TEXT NOT NULL,                 -- 'critical', 'warning', 'info'
  status TEXT NOT NULL DEFAULT 'new',     -- 'new', 'acked', 'resolved'

  -- Content
  summary TEXT NOT NULL,                  -- Human-readable summary
  details_json TEXT NOT NULL,             -- Full normalized event details

  -- Deduplication
  external_id TEXT,                       -- GitHub delivery ID or Vercel webhook ID
  dedupe_hash TEXT NOT NULL,              -- SHA-256 of canonical dedup key

  -- Context
  venture TEXT,                           -- Derived venture code
  repo TEXT,                              -- Full repo name (org/repo)
  branch TEXT,                            -- Branch name
  environment TEXT,                       -- 'production', 'preview', 'staging'

  -- Timestamps
  created_at TEXT NOT NULL,               -- When the event occurred
  received_at TEXT NOT NULL,              -- When we received it
  updated_at TEXT NOT NULL,               -- Last status change

  -- Attribution
  actor_key_id TEXT NOT NULL              -- SHA-256(relay_key)[0:16]
);

CREATE INDEX IF NOT EXISTS idx_notif_status_time ON notifications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_venture_time ON notifications(venture, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_dedupe ON notifications(dedupe_hash);
