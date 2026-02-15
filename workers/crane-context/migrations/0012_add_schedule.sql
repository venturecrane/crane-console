-- Migration 0012: Add schedule_items table for the Cadence Engine
--
-- Tracks recurring activities, their cadence, and last completion time.
-- Status (current/due/overdue/untracked) is computed at read time from
-- last_completed_at + cadence_days. No stored status columns.

CREATE TABLE IF NOT EXISTS schedule_items (
  id TEXT PRIMARY KEY,                    -- sched_<ULID>
  name TEXT NOT NULL UNIQUE,              -- machine key: 'fleet-health', 'code-review-ke'
  title TEXT NOT NULL,                    -- human label: 'Fleet Health Check'
  description TEXT,                       -- what this is and why it matters

  -- Cadence (everything expressed as days)
  cadence_days INTEGER NOT NULL,          -- 7 = weekly, 30 = monthly, 1 = daily, 90 = quarterly

  -- Scope
  scope TEXT NOT NULL DEFAULT 'global',   -- 'global' or venture code (vc/sc/dfg/ke/dc)

  -- Priority
  priority INTEGER NOT NULL DEFAULT 2,    -- 0=P0, 1=high, 2=normal, 3=low

  -- Completion state (source of truth)
  last_completed_at TEXT,                 -- ISO 8601
  last_completed_by TEXT,                 -- agent name or 'captain'
  last_result TEXT,                       -- 'success', 'warning', 'failure', 'skipped'
  last_result_summary TEXT,               -- brief outcome

  -- Lifecycle
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_scope ON schedule_items(scope, enabled);
CREATE INDEX IF NOT EXISTS idx_schedule_enabled ON schedule_items(enabled);

-- Seed data with historical backfill where known
-- INSERT OR REPLACE is safe for re-running

-- Weekly items (cadence_days = 7)
INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, last_completed_by, last_result, created_at, updated_at)
VALUES ('sched_seed_001', 'portfolio-review', 'Portfolio Review', 'Cross-venture status review and updates', 7, 'vc', 1, '2026-02-15T00:00:00.000Z', 'captain', 'success', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_002', 'weekly-plan', 'Weekly Plan', 'Set priority venture and target issues for the week', 7, 'global', 1, NULL, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_003', 'fleet-health', 'Fleet Health Check', 'Verify all machines are reachable and services running', 7, 'global', 2, NULL, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_004', 'command-sync', 'Command Sync', 'Sync slash commands across venture repos', 7, 'global', 2, NULL, datetime('now'), datetime('now'));

-- Monthly items (cadence_days = 30)
INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, last_completed_by, last_result, created_at, updated_at)
VALUES ('sched_seed_005', 'code-review-vc', 'Code Review (vc)', 'Codebase quality review for Venture Crane', 30, 'vc', 2, '2026-02-15T00:00:00.000Z', 'crane-mcp', 'success', datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_006', 'code-review-ke', 'Code Review (ke)', 'Codebase quality review for Kid Expenses', 30, 'ke', 2, NULL, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_007', 'code-review-dfg', 'Code Review (dfg)', 'Codebase quality review for Durgan Field Guide', 30, 'dfg', 2, NULL, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_008', 'code-review-sc', 'Code Review (sc)', 'Codebase quality review for Silicon Crane', 30, 'sc', 2, NULL, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_009', 'code-review-dc', 'Code Review (dc)', 'Codebase quality review for Draft Crane', 30, 'dc', 2, NULL, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_010', 'enterprise-review', 'Enterprise Review', 'Cross-venture codebase audit for drift and standards', 30, 'global', 2, NULL, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_011', 'dependency-freshness', 'Dependency Freshness', 'Check for outdated or vulnerable dependencies across repos', 30, 'global', 2, NULL, datetime('now'), datetime('now'));

-- Quarterly items (cadence_days = 90)
INSERT OR REPLACE INTO schedule_items (id, name, title, description, cadence_days, scope, priority, last_completed_at, created_at, updated_at)
VALUES ('sched_seed_012', 'secrets-rotation-review', 'Secrets Rotation Review', 'Audit secret ages and rotate any approaching expiry', 90, 'global', 1, NULL, datetime('now'), datetime('now'));
