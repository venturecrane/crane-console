-- Migration 0039: Add memory_invocations table for memory telemetry
-- Records surfaced, cited, and parse_error events for audit and deprecation logic

CREATE TABLE IF NOT EXISTS memory_invocations (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('surfaced', 'cited', 'parse_error')),
  session_id TEXT,
  venture TEXT,
  repo TEXT,
  actor_key_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_invocations_memory_event_time
  ON memory_invocations (memory_id, event, created_at);

CREATE INDEX IF NOT EXISTS idx_memory_invocations_event_time
  ON memory_invocations (event, created_at);
