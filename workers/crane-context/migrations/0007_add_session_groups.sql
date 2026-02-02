-- Crane Context Worker - Session Grouping
-- Version: 1.0
-- Date: 2026-02-02
-- Reference: Issue #119 - Session grouping for parallel agent awareness

-- ============================================================================
-- Add session_group_id to sessions table
-- ============================================================================
-- Enables agents working on different tasks in the same project to have
-- awareness of sibling sessions. Sessions with the same group_id are "siblings".

ALTER TABLE sessions ADD COLUMN session_group_id TEXT;

-- Index for finding sibling sessions
CREATE INDEX idx_sessions_group ON sessions(
  session_group_id, status, last_heartbeat_at DESC
) WHERE session_group_id IS NOT NULL;
