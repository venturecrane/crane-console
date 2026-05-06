-- Migration 0052: Seed verify-audit cadence item + add audit cache table
--
-- Prong 3 of the verify-ledger system. Two changes:
--   1. Cadence item `verify-audit-weekly` (cadence_days=7) drives the
--      weekly /verify-audit invocation that consumes verify_ledger and
--      surfaces coverage gaps, override patterns, integrity samples,
--      and recurring-command memory candidates.
--   2. Single-row cache table `verify_audit_cache` stores the most
--      recent audit snapshot. /verify/audit reads from cache when fresh
--      (<8h) unless ?fresh=1 is passed. crane_status briefing reads
--      this for cheap summaries without triggering recomputation.
--
-- Pattern mirrors 0048_docs_audit_cadence.sql for the schedule item.

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_verify_audit',
  'verify-audit-weekly',
  'Verify-ledger Audit (weekly)',
  'Run /verify-audit to consume the verify_ledger from Prongs 1+2. Eight checks: coverage gap on surface-class files touched in window, unverified-ever surface files (full history), override frequency (Layer 4b + 4c), output integrity samples, truncation/redaction drift, source distribution, and recurring-command memory candidates. Recurring (command_hash, repo) tuples with method=fresh_process and occurrences >= 3 become draft memory lessons (apply flag). Report-only by default. Cadence completion result is success when sections are clean, warning when any non-empty.',
  7,
  'enterprise',
  2,
  NULL,
  NULL,
  NULL,
  1,
  datetime('now'),
  datetime('now')
);

-- Single-row cache for the latest audit snapshot. Keyed by the literal
-- string 'singleton' so reads/writes are deterministic. payload_json
-- holds the full JSON response of /verify/audit (sections + metadata).
CREATE TABLE IF NOT EXISTS verify_audit_cache (
  id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
