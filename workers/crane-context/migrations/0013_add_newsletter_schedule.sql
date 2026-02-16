-- Migration 0013: Add newsletter-digest schedule item
--
-- Monthly curated newsletter via Buttondown. Surfaces in /sod when due.
-- Completing with result='skipped' is valid for months with no newsletter-worthy content.

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_013', 'newsletter-digest', 'Newsletter Digest', 'Curate and send monthly newsletter digest via Buttondown', 30, 'vc', 2, NULL, datetime('now'), datetime('now'));
