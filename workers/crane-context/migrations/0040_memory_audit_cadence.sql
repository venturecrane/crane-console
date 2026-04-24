-- Migration 0040: Seed memory-audit cadence item
--
-- Adds the weekly memory governance cadence item that drives the automated
-- audit cycle: draft promotion, zero-usage deprecation, schema gap flagging,
-- and pending-captain-approval surfacing.
--
-- Frequency: weekly (cadence_days=7), targeting Monday 08:17 local.
-- Owner: captain. Action: /memory-audit (crane_memory_audit tool).
-- See docs/memory/governance.md §Audit for full behavior spec.
--
-- Pattern: idempotent INSERT OR REPLACE on stable id, mirroring
-- 0033_add_skill_audit_cadence.sql and 0038_fleet_machine_check_cadence.sql.

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_memory_audit',
  'memory-audit',
  'Memory Audit',
  'Run /memory-audit to check frontmatter conformance, promote eligible drafts (draft→stable), auto-deprecate zero-usage stable memories (≥10 surfaced, 0 cited in 90d), and surface pending-captain-approval items with cite/surface stats. Report covers inventory by kind/scope/status, schema gaps, staleness (>180d), supersedes-chain integrity, and parse_error quarantine count. If overdue >60 days, SOS pauses always-on anti-pattern injection.',
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
