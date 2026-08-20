-- Migration 0055: Retire stale cadence items and reconcile content-scan drift
--
-- Context: Cadence review on 2026-08-20 per Captain directive. The briefing
-- had accumulated 25 items, 5 of them 84-126 days overdue. An item nobody
-- acts on trains the reader to skim past the whole briefing, so the ones
-- below are retired rather than left to nag.
--
-- Two are retired on evidence (they are complete or automated); six are
-- retired on Captain directive (parked ventures); one is a drift
-- reconciliation. Each is justified individually below.
--
-- Pattern mirrors migrations 0036 (weekly-plan) and 0049 (gbp-weekly-post).
-- Idempotent: re-running finds no matching rows and DELETE is a no-op.
-- Fresh deployments still run the earlier seeds, but 0055 runs immediately
-- after and removes these rows, leaving the DB in the same state as an
-- existing, migrated environment.

-- ---------------------------------------------------------------------------
-- 1. Retired on evidence: work already complete
-- ---------------------------------------------------------------------------
-- 'skill-review-flip-to-blocking' (seeded by 0033) was a ONE-SHOT reminder
-- modeled as a 30-day recurrence, so it re-armed forever after the work was
-- done. The work IS done: .github/workflows/skill-review.yml:48 runs
-- `npm run skill-review -- --all --strict` with no `|| true`, and
-- packages/crane-mcp/src/cli/skill-review.ts:247-248 calls process.exit(1)
-- when by_severity.error > 0. The gate is blocking.
--
-- The `|| true` on line 47 that the item's own description tells the reader
-- to remove is NOT the advisory escape hatch — it guards the --json report
-- emission so the PR-comment step has a file to read regardless of pass/fail.
-- Removing it would break the comment step, not strengthen the gate.
--
-- Verified: verify-ledger vfy_01M0FZ49CTGXHM47SFR2G7CWX4.
DELETE FROM schedule_items WHERE name = 'skill-review-flip-to-blocking';

-- ---------------------------------------------------------------------------
-- 2. Retired on evidence: fully automated, no human action to remind
-- ---------------------------------------------------------------------------
-- 'memory-curator' (seeded by 0046) describes a job that runs unattended on
-- a Cloudflare cron: workers/crane-context/wrangler.toml:67 sets
-- crons = ["0 * * * *", "17 4 * * *"] for env.production, and the 04:17 UTC
-- pattern is the curator discriminant in the scheduled() handler.
--
-- Nothing calls crane_schedule(action:'complete') for it, so it reported
-- UNTRACKED/never indefinitely. A schedule_item is a reminder for an action
-- a human or agent takes; this one has no such action. The job itself is
-- untouched and keeps running — only the redundant reminder is removed.
-- Health is observable via the cron logs and the curator's own queues
-- (needs_captain_review, curator_parse_error).
DELETE FROM schedule_items WHERE name = 'memory-curator';

-- ---------------------------------------------------------------------------
-- 3. Retired on Captain directive: parked ventures
-- ---------------------------------------------------------------------------
-- Code review and exec-summary refresh cadences for ke, dfg, sc, and dc.
-- These ventures remain registered and their repos remain in the fleet audit;
-- they are NOT being deprecated and no code, data, or feature is touched here.
-- Only the recurring reminders are removed, because active attention is on
-- vc and ss (the only items reading CURRENT at review time) and these had run
-- 84-114 days past due — or never.
--
-- vc-scoped equivalents (code-review-vc, exec-summary-refresh-vc) are
-- deliberately KEPT: vc is the operating system for the portfolio and its
-- exec summary is surfaced in every /sos briefing.
--
-- Reintroduce via a new migration when a venture returns to active
-- development. The /code-review and /context-refresh skills remain available
-- for ad-hoc runs against any venture in the meantime.
DELETE FROM schedule_items WHERE name IN (
  'code-review-ke',
  'code-review-dfg',
  'code-review-sc',
  'code-review-dc',
  'exec-summary-refresh-ke',
  'exec-summary-refresh-dfg',
  'exec-summary-refresh-dc'
);

-- ---------------------------------------------------------------------------
-- 4. Drift reconciliation: content-scan
-- ---------------------------------------------------------------------------
-- 'content-scan' was seeded enabled=1 by migration 0016:15, but is absent
-- from live D1 (it does not appear in GET /schedule/items, which selects
-- WHERE enabled = 1). No migration removes it, so it was deleted or disabled
-- by a direct write outside the migration chain.
--
-- That leaves the migration chain and the live database disagreeing: a fresh
-- bootstrap + migrate would resurrect a cadence item that the live system has
-- not had for some time. This DELETE reconciles the source of truth to the
-- observed live state.
--
-- The /content-scan skill is NOT removed and remains available for ad-hoc
-- runs. If the cadence is wanted back, reintroduce it via a new migration so
-- the chain stays authoritative.
DELETE FROM schedule_items WHERE name = 'content-scan';
