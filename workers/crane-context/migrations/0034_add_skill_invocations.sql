-- Migration 0034: Add skill_invocations table for skill invocation telemetry
-- Records every SKILL.md invocation for usage analysis and deprecation flagging

CREATE TABLE IF NOT EXISTS skill_invocations (
  id TEXT PRIMARY KEY,                    -- inv_<ULID>
  skill_name TEXT NOT NULL,
  session_id TEXT,                        -- from the calling session if known
  venture TEXT,                           -- from env at call time
  repo TEXT,                              -- from env at call time
  status TEXT NOT NULL DEFAULT 'started', -- started | completed | failed
  duration_ms INTEGER,                    -- optional; set if skill reports completion
  error_message TEXT,                     -- optional; set on failure
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  actor_key_id TEXT                       -- derived from X-Relay-Key like other tables
);

CREATE INDEX IF NOT EXISTS idx_skill_invocations_name_time
  ON skill_invocations(skill_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_invocations_venture_time
  ON skill_invocations(venture, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_invocations_session
  ON skill_invocations(session_id);

CREATE INDEX IF NOT EXISTS idx_skill_invocations_created
  ON skill_invocations(created_at DESC);
