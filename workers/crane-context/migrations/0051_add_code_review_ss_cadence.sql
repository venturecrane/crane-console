-- Migration 0050: Seed code-review cadence item for SMD Services (ss)
--
-- The other 5 ventures (vc, ke, dfg, sc, dc) got their code-review cadence
-- items in 0012_add_schedule.sql. SS was transferred from smdservices to
-- venturecrane on 2026-04-08 — postdating that migration. Adding the
-- monthly cadence item to bring SS in line with the rest of the portfolio.
--
-- Also re-seeds the existing five so a fresh DB initialized after this
-- migration has the same set as a long-running one. INSERT OR REPLACE on
-- stable IDs is idempotent.
--
-- Cadence: monthly (cadence_days=30). Owner: captain. Action: /code-review
-- run from inside the venture's repo.

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_013',
  'code-review-ss',
  'Code Review (ss)',
  'Codebase quality review for SMD Services. Run /code-review from the ss-console repo monthly. Produces a graded scorecard committed to docs/reviews/ and stored in VCMS.',
  30,
  'ss',
  2,
  NULL,
  NULL,
  NULL,
  1,
  datetime('now'),
  datetime('now')
);
