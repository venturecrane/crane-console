-- Migration 0033: Seed skill governance cadence items
--
-- Adds two schedule_items that drive the skill governance lifecycle:
--   1. skill-audit — monthly audit of all skills (schema gaps, reference drift, staleness)
--   2. skill-review-flip-to-blocking — 30-day reminder to flip /skill-review CI from
--      advisory to blocking after observation window (per governance rollout plan)
--
-- Both items are idempotent via INSERT OR REPLACE.
-- See docs/skills/governance.md.

-- Monthly skill audit — surfaces in /sos briefing when due (>=30 days since last_completed_at).
-- Runs as a recurring item; Captain or agent completes via
-- crane_schedule(action:'complete', name:'skill-audit', result:'success', summary:'...')
INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_skill_audit',
  'skill-audit',
  'Skill Audit',
  'Run /skill-audit to check frontmatter conformance, reference drift, and staleness across all skills. Report covers inventory, schema gaps, deprecation queue, and staleness (skills whose SKILL.md has not been touched in git for >180 days).',
  30,
  'global',
  1,
  NULL,
  NULL,
  NULL,
  1,
  datetime('now'),
  datetime('now')
);

-- Follow-up reminder: flip /skill-review CI from advisory to blocking after 30 days
-- of observation. Seeded as "just completed" so it first fires on day 30. Priority 1
-- (HIGH) so it stands out in the /sos briefing when due.
INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_skill_review_flip',
  'skill-review-flip-to-blocking',
  'Flip /skill-review CI to blocking',
  'After 30 days of observing /skill-review in advisory mode, review findings and flip the CI check to blocking by removing `|| true` from .github/workflows/skill-review.yml. If findings indicate the check is still too noisy, defer and complete this cadence item with result:skipped and a summary explaining why.',
  30,
  'global',
  1,
  datetime('now'),
  'captain',
  'scheduled',
  1,
  datetime('now'),
  datetime('now')
);
