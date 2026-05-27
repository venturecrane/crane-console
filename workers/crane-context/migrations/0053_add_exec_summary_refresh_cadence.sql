-- Migration 0053: Seed monthly exec-summary refresh cadence items per venture
--
-- Each venture (vc, ss, ke, dfg, dc) gets a monthly cadence item to keep
-- its executive-summary VCMS note fresh. Stale exec summaries directly
-- cause confabulation by claude.ai agents in venture projects (e.g., the
-- ss exec summary predated the ai-employee product by 8 weeks).
--
-- Pass criteria for completion (documented in the description):
-- 1. Cite specific recent commits/PRs by number or SHA.
-- 2. Reference top 3 focus areas verifiable against gh issues output.
-- 3. Dated within the last 7 days.
--
-- Cadence: monthly (cadence_days=30). Owner: captain (manual rewrite or
-- agent-assisted). Action: read current note via crane_note_read, gather
-- venture state via github_list_issues + recent commits, rewrite, save.
--
-- Pre-marked as completed today (2026-05-27) since the initial refresh
-- was done in the same PR; next due in 30 days.
--
-- Single-row INSERTs (not multi-row VALUES) because the canary harness
-- in test/canary/idempotency-canary.test.ts splits on semicolons; multi-
-- row VALUES inside one statement may parse poorly in some D1 paths.

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_014',
  'exec-summary-refresh-vc',
  'Executive Summary Refresh (vc)',
  'Refresh the Venture Crane exec-summary VCMS note. Pass criteria: cite recent commits/PRs, reference top 3 focus areas verifiable against gh issue list for venturecrane/crane-console, dated within 7 days. Drives claude.ai venture-project context freshness.',
  30,
  'vc',
  3,
  '2026-05-27T17:00:00Z',
  NULL,
  'success',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_015',
  'exec-summary-refresh-ss',
  'Executive Summary Refresh (ss)',
  'Refresh the SMD Services exec-summary VCMS note. Pass criteria: cite recent commits/PRs, reference top 3 focus areas verifiable against gh issue list for venturecrane/ss-console, dated within 7 days. Must explicitly cover the ai-employee product line.',
  30,
  'ss',
  3,
  '2026-05-27T17:00:00Z',
  NULL,
  'success',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_016',
  'exec-summary-refresh-ke',
  'Executive Summary Refresh (ke)',
  'Refresh the Kid Expenses exec-summary VCMS note. Pass criteria: cite recent commits/PRs, reference top 3 focus areas verifiable against gh issue list for venturecrane/ke-console, dated within 7 days.',
  30,
  'ke',
  3,
  '2026-05-27T17:00:00Z',
  NULL,
  'success',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_017',
  'exec-summary-refresh-dfg',
  'Executive Summary Refresh (dfg)',
  'Refresh the Durgan Field Guide exec-summary VCMS note. Pass criteria: cite recent commits/PRs, reference top 3 focus areas verifiable against gh issue list for venturecrane/dfg-console, dated within 7 days.',
  30,
  'dfg',
  3,
  '2026-05-27T17:00:00Z',
  NULL,
  'success',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_018',
  'exec-summary-refresh-dc',
  'Executive Summary Refresh (dc)',
  'Refresh the Draft Crane exec-summary VCMS note. Pass criteria: cite recent commits/PRs, reference top 3 focus areas verifiable against gh issue list for venturecrane/dc-console, dated within 7 days.',
  30,
  'dc',
  3,
  '2026-05-27T17:00:00Z',
  NULL,
  'success',
  1,
  datetime('now'),
  datetime('now')
);
