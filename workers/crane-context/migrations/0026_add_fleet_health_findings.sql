-- 0026_add_fleet_health_findings.sql
--
-- Plan §C.4: fleet-ops-health writes findings to its OWN table, NOT to
-- the notifications table. This eliminates cross-track coupling between
-- Track A (notification auto-resolver) and Track C (weekly fleet audit).
--
-- Two signal paths, two tables, no shared state:
--   notifications           — webhook-driven CI/CD failures (Track A)
--   fleet_health_findings   — weekly runtime audit (Track C)
--
-- Auto-resolution model: each fleet-ops-health report is a FULL SNAPSHOT
-- of the fleet's current state. When the next report is ingested, any
-- finding whose (repo_full_name, finding_type) is NOT present in the new
-- snapshot is auto-resolved. This gives us the same "green restores
-- truth" property as the notification watcher, but driven by a weekly
-- full-state refresh instead of individual green events.
--
-- Schema is per plan §C.4:
--   CREATE TABLE fleet_health_findings (
--     id TEXT PRIMARY KEY,
--     generated_at TEXT NOT NULL,
--     repo_full_name TEXT NOT NULL,
--     finding_type TEXT NOT NULL,  -- 'ci-failed' | 'deploy-cold' | 'dependabot-backlog' | etc
--     severity TEXT NOT NULL,
--     details_json TEXT NOT NULL,
--     resolved_at TEXT,
--     status TEXT NOT NULL DEFAULT 'new'
--   );
--   CREATE INDEX idx_fleet_findings_open ON fleet_health_findings(status, generated_at DESC);

-- 2026-04-08 retroactive idempotency guard (see 0027) — do not remove.
CREATE TABLE IF NOT EXISTS fleet_health_findings (
  -- ULID-prefixed id (fhf_<ULID>)
  id TEXT PRIMARY KEY,

  -- Snapshot identity
  generated_at TEXT NOT NULL,                    -- ISO8601 of the report run
  repo_full_name TEXT NOT NULL,                  -- 'venturecrane/crane-console'
  finding_type TEXT NOT NULL,                    -- stable enum (see below)

  -- Signal
  severity TEXT NOT NULL,                        -- 'error' | 'warning' | 'info'
  details_json TEXT NOT NULL,                    -- { message, rule, ...raw }

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'new',            -- 'new' | 'resolved'
  resolved_at TEXT,                              -- ISO8601, null until resolved
  resolve_reason TEXT,                           -- 'auto_snapshot' | 'manual' | null

  -- Audit
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Dashboard/SOS query — "what's open right now?"
CREATE INDEX IF NOT EXISTS idx_fleet_findings_open
  ON fleet_health_findings(status, generated_at DESC);

-- Auto-resolve lookup — "find the open finding for this (repo, type)"
CREATE INDEX IF NOT EXISTS idx_fleet_findings_match
  ON fleet_health_findings(repo_full_name, finding_type, status);

-- Retention / history scan
CREATE INDEX IF NOT EXISTS idx_fleet_findings_repo
  ON fleet_health_findings(repo_full_name, generated_at DESC);
