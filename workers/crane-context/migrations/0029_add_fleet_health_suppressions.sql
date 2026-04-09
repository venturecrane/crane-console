-- 0029_add_fleet_health_suppressions.sql
--
-- Plan v3.1 §D.6 Group G. Suppression hygiene for fleet_health_findings.
--
-- The Track D critique (§D.6 Group G) required that suppressions must:
--   1. Have an expires_at ≤ 30 days from now
--   2. Have a linked GitHub issue number for rationale
--   3. Emit their own WARN finding in the weekly report so they stay visible
--   4. Count against a portfolio-wide cap of 3 active suppressions
--
-- This migration adds the tracking table. The readiness audit invariants
-- I-33/34/35 read from this table to enforce the rules.

CREATE TABLE IF NOT EXISTS fleet_health_suppressions (
  id TEXT PRIMARY KEY,                    -- supr_<ULID>

  -- What's being suppressed (scoped match key)
  repo_full_name TEXT NOT NULL,           -- 'venturecrane/dc-marketing' or '*' for all repos
  finding_type TEXT NOT NULL,             -- 'ci-failed' | 'stale-push' | '*' for all types

  -- Required justification
  reason TEXT NOT NULL,                   -- Free-text rationale
  linked_issue_url TEXT NOT NULL,         -- Required; enforces documentation

  -- Required expiration
  created_at TEXT NOT NULL,               -- ISO8601
  expires_at TEXT NOT NULL,               -- ISO8601; I-33 enforces ≤ 30d from created_at
  created_by TEXT NOT NULL,               -- actor_key_id of whoever ran the suppression

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'expired' | 'revoked'
    CHECK (status IN ('active', 'expired', 'revoked'))
);

-- Index for the "currently active" query that I-34 (cap) and I-35
-- (visibility) both use.
CREATE INDEX IF NOT EXISTS idx_fh_suppressions_active
  ON fleet_health_suppressions(status, expires_at);

-- Index for looking up whether a specific (repo, finding_type) is
-- currently suppressed when rendering fleet-ops-health findings.
CREATE INDEX IF NOT EXISTS idx_fh_suppressions_match
  ON fleet_health_suppressions(repo_full_name, finding_type, status);
