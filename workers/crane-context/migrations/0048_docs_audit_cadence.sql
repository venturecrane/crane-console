-- Migration 0048: Seed docs-audit cadence item
--
-- Adds the monthly docs site drift audit cadence item. Drives detection of
-- broken internal links, broken crane_doc() references, deprecated-skill
-- mentions, sidebar drift between astro.config.mjs and docs/ tree, plus
-- stale-by-git and captain-review candidates across the site-published dirs.
--
-- Frequency: monthly (cadence_days=30). Owner: captain.
-- Action: /docs-audit (crane_docs_drift_audit MCP tool).
--
-- Cadence semantics divergence (vs. /skill-audit, /memory-audit): completion
-- result is `success` whenever the audit runs cleanly, regardless of drift
-- count. `failure` only on tool error or the audit-tool-broken self-diagnostic
-- (e.g., sidebar parser found zero entries — config likely refactored).
-- Drift counts surface in the report summary, not the cadence result.
--
-- Pattern: idempotent INSERT OR REPLACE on stable id, mirroring
-- 0040_memory_audit_cadence.sql.

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_docs_audit',
  'docs-audit',
  'Docs Audit',
  'Run /docs-audit to detect drift across site-published docs/ directories. Six checks: dead internal markdown links (ERROR), broken crane_doc() references (ERROR), deprecated-skill mentions (WARN), stale-by-git (INFO), sidebar drift between astro.config.mjs and docs/ with self-diagnostic ERROR on zero extraction (INFO), captain-review candidates for narrative content untouched > 180d (INFO). Report-only, no auto-fix. Cadence completion result is success whenever the audit runs cleanly, regardless of drift count.',
  30,
  'enterprise',
  2,
  NULL,
  NULL,
  NULL,
  1,
  datetime('now'),
  datetime('now')
);
