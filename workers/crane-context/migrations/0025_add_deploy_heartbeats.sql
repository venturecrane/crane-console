-- 0025_add_deploy_heartbeats.sql
--
-- Plan §B.6: deploy pipeline cold detector with the COMMITS-WITHOUT-DEPLOY
-- condition (NOT a flat 7-day threshold). A workflow is "cold" if and only if
--   last_main_commit_at > last_success_at
--   AND (now - last_main_commit_at) > cold_threshold_days
--   AND NOT suppressed
--
-- A repo with no recent commits is NOT cold. A template repo with no main
-- activity is NOT cold. A dormant repo is NOT cold. Only ACTIVE COMMITS
-- STUCK WITHOUT DEPLOY trigger the signal.
--
-- Per-venture thresholds (set per-row at discovery time, defaults from
-- config/ventures.json deploy_cold_threshold_days field):
--   - content/marketing ventures (vc-web, dfg, dc-marketing): 2 days
--   - application/console ventures (ke-console, sc-console, etc.): 3 days
--   - infrastructure (crane-console, crane-relay): 7 days
--   - templates (venture-template): N/A (suppressed=1 from creation)

CREATE TABLE deploy_heartbeats (
  -- Identity (composite uniqueness)
  venture TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,                  -- 'venturecrane/crane-console'
  workflow_id INTEGER NOT NULL,                  -- GitHub Actions workflow ID
  branch TEXT NOT NULL DEFAULT 'main',

  -- Last main commit (the "should have deployed" signal)
  last_main_commit_at TEXT,                      -- ISO8601 from GH push event
  last_main_commit_sha TEXT,

  -- Last successful deploy (the "did it actually deploy" signal)
  last_success_at TEXT,                          -- ISO8601 from workflow_run.success
  last_success_sha TEXT,
  last_success_run_id INTEGER,

  -- Last run of any conclusion (for stale-webhook detection)
  last_run_at TEXT,
  last_run_id INTEGER,
  last_run_conclusion TEXT,                      -- 'success' | 'failure' | 'cancelled' | etc

  -- Tracking + suppression
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  suppressed INTEGER NOT NULL DEFAULT 0,         -- 0 = active, 1 = suppressed
  suppress_reason TEXT,
  suppress_until TEXT,                           -- ISO8601, null = indefinite
  cold_threshold_days INTEGER NOT NULL DEFAULT 3,

  -- Audit
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- Composite primary key — one heartbeat per (venture, repo, workflow, branch)
  PRIMARY KEY (venture, repo_full_name, workflow_id, branch)
);

-- Index for SOS dispatch queries: list cold heartbeats for a venture.
CREATE INDEX idx_deploy_hb_venture ON deploy_heartbeats(venture, suppressed);

-- Index for the reconciliation cron: walk all enabled heartbeats.
CREATE INDEX idx_deploy_hb_reconcile ON deploy_heartbeats(suppressed, updated_at);
