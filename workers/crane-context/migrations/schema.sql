-- Crane Context Worker - D1 Schema
-- Version: 1.0
-- Date: 2026-01-17
-- Reference: ADR 025

-- ============================================================================
-- Sessions Table
-- ============================================================================

CREATE TABLE sessions (
  -- Identity
  id TEXT PRIMARY KEY,                    -- sess_<ULID>

  -- Session context
  agent TEXT NOT NULL,                    -- cc-cli-host, desktop-pm-1
  client TEXT,                            -- cc-cli, claude-desktop
  client_version TEXT,                    -- 1.2.3
  host TEXT,                              -- crane1, user-laptop
  venture TEXT NOT NULL,                  -- vc, sc, dfg
  repo TEXT NOT NULL,                     -- owner/repo
  track INTEGER,                          -- nullable (non-tracked work)
  issue_number INTEGER,
  branch TEXT,
  commit_sha TEXT,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active', -- active, ended, abandoned
  created_at TEXT NOT NULL,              -- ISO 8601
  started_at TEXT NOT NULL,              -- Same as created_at (semantic)
  last_heartbeat_at TEXT NOT NULL,       -- Drives staleness detection
  ended_at TEXT,
  end_reason TEXT,                       -- manual, stale, superseded, error

  -- Schema versioning (Captain approved)
  schema_version TEXT NOT NULL DEFAULT '1.0',

  -- Attribution & tracing
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  creation_correlation_id TEXT NOT NULL, -- corr_<UUID> from POST /sod

  -- Extensibility
  meta_json TEXT
);

-- Indexes for sessions
CREATE INDEX idx_sessions_resume ON sessions(
  agent, venture, repo, track, status, last_heartbeat_at DESC
);

CREATE INDEX idx_sessions_active ON sessions(
  venture, repo, track, status, last_heartbeat_at DESC
);

CREATE INDEX idx_sessions_global_active ON sessions(
  status, last_heartbeat_at DESC
);

CREATE INDEX idx_sessions_agent ON sessions(
  agent, status, last_heartbeat_at DESC
);

-- Optimized cleanup index (status only in WHERE clause, not in columns)
CREATE INDEX idx_sessions_cleanup ON sessions(
  last_heartbeat_at
) WHERE status = 'active';

-- ============================================================================
-- Handoffs Table
-- ============================================================================

CREATE TABLE handoffs (
  -- Identity
  id TEXT PRIMARY KEY,                   -- ho_<ULID>

  -- Linkage (FK to sessions, application-enforced)
  session_id TEXT NOT NULL,

  -- Context (denormalized for query performance)
  venture TEXT NOT NULL,
  repo TEXT NOT NULL,
  track INTEGER,
  issue_number INTEGER,
  branch TEXT,
  commit_sha TEXT,

  -- Handoff metadata
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  status_label TEXT,                     -- blocked, in-progress, ready
  summary TEXT NOT NULL,                 -- Plain text (fast queries)

  -- Payload (max 800KB enforced at application layer)
  payload_json TEXT NOT NULL,            -- Canonical JSON
  payload_hash TEXT NOT NULL,            -- SHA-256(payload_json)
  payload_size_bytes INTEGER NOT NULL,   -- Actual size for monitoring
  schema_version TEXT NOT NULL,          -- 1.0, 1.1, etc.

  -- Attribution & tracing
  created_at TEXT NOT NULL,
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  creation_correlation_id TEXT NOT NULL  -- corr_<UUID> from POST /eod
);

-- Indexes for handoffs
CREATE INDEX idx_handoffs_issue ON handoffs(
  venture, repo, issue_number, created_at DESC
);

CREATE INDEX idx_handoffs_track ON handoffs(
  venture, repo, track, created_at DESC
);

CREATE INDEX idx_handoffs_session ON handoffs(
  session_id, created_at DESC
);

CREATE INDEX idx_handoffs_agent ON handoffs(
  from_agent, created_at DESC
);

-- ============================================================================
-- Idempotency Keys Table
-- ============================================================================

CREATE TABLE idempotency_keys (
  -- Composite primary key columns
  endpoint TEXT NOT NULL,                -- /sod, /eod, /update
  key TEXT NOT NULL,                     -- Client-provided UUID

  -- Response storage (hybrid: full body if <64KB)
  response_status INTEGER NOT NULL,
  response_hash TEXT NOT NULL,           -- SHA-256(response_body)
  response_body TEXT,                    -- Stored if <64KB, NULL otherwise
  response_size_bytes INTEGER NOT NULL,  -- Actual size
  response_truncated INTEGER DEFAULT 0,  -- 1 if >64KB (BOOLEAN as INTEGER)

  -- TTL (1 hour)
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,

  -- Attribution
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  correlation_id TEXT NOT NULL,          -- Request that stored this key

  -- Composite primary key constraint
  PRIMARY KEY (endpoint, key)
);

-- Indexes for idempotency
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX idx_idempotency_created ON idempotency_keys(created_at);

-- ============================================================================
-- Request Log Table
-- ============================================================================

CREATE TABLE request_log (
  id TEXT PRIMARY KEY,                   -- ULID

  -- Request metadata
  timestamp TEXT NOT NULL,
  correlation_id TEXT NOT NULL,          -- corr_<UUID> for this request
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,

  -- Context
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  agent TEXT,
  venture TEXT,
  repo TEXT,
  track INTEGER,
  issue_number INTEGER,

  -- Response
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,

  -- Idempotency (if applicable)
  idempotency_key TEXT,
  idempotency_hit INTEGER DEFAULT 0      -- 1 if served from cache (BOOLEAN as INTEGER)
);

-- Indexes for request_log
CREATE INDEX idx_request_log_ts ON request_log(timestamp DESC);
CREATE INDEX idx_request_log_correlation ON request_log(correlation_id);
CREATE INDEX idx_request_log_errors ON request_log(status_code, timestamp DESC)
  WHERE status_code >= 400;
CREATE INDEX idx_request_log_endpoint ON request_log(endpoint, timestamp DESC);

-- ============================================================================
-- Schema Notes
-- ============================================================================

-- 1. D1 does not enforce foreign keys (session_id in handoffs is application-enforced)
-- 2. D1 uses INTEGER for BOOLEAN (0 = false, 1 = true)
-- 3. Retention policies:
--    - Idempotency keys: 1-hour TTL (enforced via check-on-read)
--    - Request logs: 7-day retention (enforced via filter-on-read)
--    - Phase 2: Add scheduled cleanup jobs
-- 4. Composite PK on idempotency_keys ensures endpoint scoping
-- 5. Partial index on sessions (WHERE status = 'active') optimizes cleanup queries
-- 6. All timestamps are ISO 8601 format (TEXT)
-- 7. actor_key_id is SHA-256 hash truncated to 16 hex chars (8 bytes)

-- End of schema
