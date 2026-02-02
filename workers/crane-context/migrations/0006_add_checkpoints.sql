-- Crane Context Worker - Checkpoints Table
-- Version: 1.0
-- Date: 2026-02-02
-- Reference: Issue #116 - Enterprise Dev Practices

-- ============================================================================
-- Checkpoints Table
-- ============================================================================
-- Allows agents to save incremental work summaries mid-session without ending.
-- Enables progress preservation and context for sibling agents.

CREATE TABLE checkpoints (
  -- Identity
  id TEXT PRIMARY KEY,                    -- cp_<ULID>

  -- Linkage (FK to sessions, application-enforced)
  session_id TEXT NOT NULL,

  -- Context (denormalized for query performance)
  venture TEXT NOT NULL,
  repo TEXT NOT NULL,
  track INTEGER,
  issue_number INTEGER,
  branch TEXT,
  commit_sha TEXT,

  -- Checkpoint content
  summary TEXT NOT NULL,                  -- Brief summary of work done
  work_completed TEXT,                    -- JSON array of completed items
  blockers TEXT,                          -- JSON array of blockers
  next_actions TEXT,                      -- JSON array of next actions
  notes TEXT,                             -- Additional context/notes

  -- Metadata
  checkpoint_number INTEGER NOT NULL,     -- Sequential within session (1, 2, 3...)
  created_at TEXT NOT NULL,               -- ISO 8601

  -- Attribution & tracing
  actor_key_id TEXT NOT NULL,             -- SHA-256(key)[0:16] = 16 hex chars
  correlation_id TEXT NOT NULL            -- corr_<UUID> from POST /checkpoint
);

-- Indexes for checkpoints
CREATE INDEX idx_checkpoints_session ON checkpoints(
  session_id, checkpoint_number DESC
);

CREATE INDEX idx_checkpoints_context ON checkpoints(
  venture, repo, track, created_at DESC
);

CREATE INDEX idx_checkpoints_recent ON checkpoints(
  created_at DESC
);
