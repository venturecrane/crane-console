-- Migration 0019: Add design system review schedule item
--
-- Quarterly cross-venture design system review.
-- Ensures .stitch/DESIGN.md stays in sync with design-spec.md
-- and Stitch cloud design systems are up to date for Tier 1 ventures.

INSERT OR REPLACE INTO schedule_items
  (id, name, title, description, cadence_days, scope, priority, enabled, created_at, updated_at)
VALUES
  ('sched_seed_014', 'design-system-review', 'Design System Review',
   'Cross-venture design sync: verify .stitch/DESIGN.md matches design-spec.md for Tier 1 ventures, update Stitch cloud design systems',
   90, 'global', 3, 1, datetime('now'), datetime('now'));
