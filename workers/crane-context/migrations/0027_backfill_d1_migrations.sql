-- 0027_backfill_d1_migrations.sql
--
-- Plan v3.1 §D.3 (H-1): restore wrangler's native d1_migrations tracking.
--
-- The problem: historical migrations 0003..0026 were applied via
--   `wrangler d1 execute --remote --file=./migrations/<NNNN>_*.sql`
-- This bypasses wrangler's `d1 migrations apply` flow entirely, leaving the
-- d1_migrations table empty. Wrangler therefore has no record of what has
-- been applied. If anyone now runs `wrangler d1 migrations apply`, wrangler
-- would try to re-run all 26 historical migrations — many non-idempotent —
-- and corrupt production D1.
--
-- The fix: this migration creates d1_migrations (if it doesn't exist) and
-- populates it with an entry for every historical migration using its
-- original git commit timestamp as `applied_at`. After this migration lands
-- and is applied manually to both envs via the legacy `execute --file`
-- path, all future migrations use the native `db:migrate:apply` flow.
--
-- The I-3b CI guard in the same PR ensures that `wrangler d1 migrations
-- apply` refuses to run against an empty d1_migrations and fails loud.
--
-- Companion changes in H-1:
-- - workers/crane-context/package.json: rename db:migrate → db:schema:bootstrap;
--   add db:migrate:apply, db:migrate:apply:prod, db:migrate:list,
--   db:migrate:list:prod using native wrangler flow.
-- - workers/crane-context/migrations/README.md: documents the forward flow
--   and warns about the I-3b gate.
-- - .github/workflows/deploy.yml: adds pre-flight check that refuses to
--   run `migrations apply` when d1_migrations is empty.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE. Safe to re-run.

CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Historical backfill. Timestamps are the actual git commit dates of each
-- migration file, captured from `git log --follow --diff-filter=A`. For
-- migrations that did not exist at the time of their first commit under
-- their current name, fallback to the earliest commit date on the path.

INSERT OR IGNORE INTO d1_migrations (name, applied_at) VALUES
  ('0003_add_context_docs.sql',              '2026-01-18T17:09:42Z'),
  ('0004_add_context_scripts.sql',           '2026-01-21T01:05:07Z'),
  ('0005_add_rate_limits.sql',               '2026-01-27T05:25:48Z'),
  ('0006_add_checkpoints.sql',               '2026-02-02T17:25:50Z'),
  ('0007_add_session_groups.sql',            '2026-02-02T17:35:05Z'),
  ('0008_add_doc_requirements.sql',          '2026-02-07T04:11:05Z'),
  ('0009_add_machines.sql',                  '2026-02-09T05:37:22Z'),
  ('0010_add_notes.sql',                     '2026-02-11T05:29:06Z'),
  ('0011_drop_note_categories.sql',          '2026-02-11T08:18:46Z'),
  ('0012_add_schedule.sql',                  '2026-02-15T23:20:56Z'),
  ('0013_add_newsletter_schedule.sql',       '2026-02-16T02:03:08Z'),
  ('0014_add_handoffs_created_index.sql',    '2026-02-19T03:25:20Z'),
  ('0015_add_notifications.sql',             '2026-03-03T03:52:32Z'),
  ('0016_add_calendar_fields.sql',           '2026-03-22T23:28:57Z'),
  ('0017_add_planned_events.sql',            '2026-03-23T01:26:39Z'),
  ('0018_add_last_activity_at.sql',          '2026-03-24T00:40:15Z'),
  ('0019_add_design_schedule.sql',           '2026-03-28T19:57:14Z'),
  ('0020_update_staleness_and_sources.sql',  '2026-04-01T01:45:05Z'),
  ('0021_add_context_refresh_cadence.sql',   '2026-04-01T01:45:05Z'),
  ('0022_add_gbp_weekly_post.sql',           '2026-04-07T20:32:59Z'),
  ('0023_add_notification_match_keys.sql',   '2026-04-08T15:01:00Z'),
  ('0024_add_notification_locks.sql',        '2026-04-08T16:30:32Z'),
  ('0025_add_deploy_heartbeats.sql',         '2026-04-08T18:05:11Z'),
  ('0026_add_fleet_health_findings.sql',     '2026-04-09T00:43:20Z'),
  ('0027_backfill_d1_migrations.sql',        '2026-04-09T03:00:00Z');
