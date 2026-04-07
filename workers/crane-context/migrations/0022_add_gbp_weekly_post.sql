-- Add weekly GBP post cadence item for SMD Services
INSERT INTO schedule_items (id, name, title, description, cadence_days, scope, priority, enabled, created_at, updated_at)
VALUES (
  'sched_gbp_weekly_post',
  'gbp-weekly-post',
  'GBP Weekly Post',
  'Publish weekly Google Business Profile post. Rotate: problem recognition, what we do, local relevance, credibility. 2-4 sentences, no hashtags, CTA to smd.services/book when relevant.',
  7, 'ss', 2, 1, datetime('now'), datetime('now')
);
