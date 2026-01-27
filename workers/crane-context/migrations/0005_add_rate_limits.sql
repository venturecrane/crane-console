-- Migration: Add rate_limits table for MCP endpoint
-- Version: 0005
-- Date: 2026-01-26
-- Reference: Issue #61 - MCP Migration for SOD/EOD

-- ============================================================================
-- Rate Limits Table
-- ============================================================================

-- Per-minute rate limit counters for MCP endpoint
-- Key format: rl:<actor_key_id>:<minute_timestamp>
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,                    -- rl:<actor_key_id>:<minute>
  count INTEGER NOT NULL DEFAULT 1,        -- Request count
  expires_at TEXT NOT NULL                 -- Auto-cleanup threshold
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);

-- End of migration
