-- Migration 0030: Add Platform Audit to cadence engine
--
-- Monthly platform audit for crane-console: sprawl, dead code,
-- incomplete migrations, accumulated cruft. Scoped to vc since
-- it audits the crane operating system (not venture products).
-- Backfill last_completed from the 2026-04-11 inaugural run.

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result, last_result_summary,
  created_at, updated_at
) VALUES (
  'sched_seed_017', 'platform-audit', 'Platform Audit',
  'End-to-end audit of crane OS: workers, skills, MCP, D1, docs, scripts. Run via /platform-audit.',
  30, 'vc', 2,
  '2026-04-11T17:03:04.000Z', 'crane-mcp', 'success', 'Inaugural run. 6 issues filed (#491-#497).',
  datetime('now'), datetime('now')
);
