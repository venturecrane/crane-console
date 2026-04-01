-- Add context-refresh cadence item for enterprise context maintenance
INSERT INTO schedule_items (id, name, title, description, cadence_days, scope, priority, enabled, created_at, updated_at)
VALUES (
  'sched_context_refresh',
  'context-refresh',
  'Context Refresh',
  'Audit and update enterprise context docs and executive summaries across all ventures',
  14, 'global', 1, 1, datetime('now'), datetime('now')
);
