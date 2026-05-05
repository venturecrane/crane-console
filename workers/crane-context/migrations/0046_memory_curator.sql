-- 0046_memory_curator.sql
--
-- Memory recall efficacy upgrade (PR 2 of 3) - agent-curator scoring table.
--
-- The curator runs daily (cron 17 4 * * *). For each `memory`-tagged note
-- it scores 5 axes (each 0 or 1):
--   1. schema_score - frontmatter parses; required fields present
--   2. save_time_tests_score - the 3 memoryability tests still hold (regex/
--      length/structural; no model call)
--   3. contradiction_score - top-1 FTS5-similar stable memory does not
--      directly contradict (Workers AI; fail-open on parse error)
--   4. severity_validation_score - frontmatter.severity matches /^P[012]$/
--      for anti-patterns and is absent for other kinds (deterministic)
--   5. citation_health - age <14d (grace) OR >=1 distinct session cited it
--      OR severity=P0
--
-- When all 5 pass, notes.injectable is flipped to 1 and status is promoted
-- draft -> stable.
--
-- needs_captain_review and curator_parse_error are discoverable queues,
-- not gates: the Captain skims them at convenience but is never blocking.
--
-- See plan: /Users/scottdurgan/.claude/plans/distributed-dreaming-swing.md

CREATE TABLE IF NOT EXISTS memory_curator_scores (
  memory_id TEXT NOT NULL,
  schema_score INTEGER NOT NULL,
  save_time_tests_score INTEGER NOT NULL,
  contradiction_score INTEGER NOT NULL,
  severity_validation_score INTEGER NOT NULL,
  citation_health INTEGER NOT NULL,
  all_pass INTEGER NOT NULL,
  needs_captain_review INTEGER NOT NULL DEFAULT 0,
  curator_parse_error INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL,
  curator_version TEXT NOT NULL,
  rationale TEXT,
  PRIMARY KEY (memory_id, computed_at)
);

CREATE INDEX IF NOT EXISTS idx_curator_scores_memory_recent
  ON memory_curator_scores(memory_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_curator_scores_review_queue
  ON memory_curator_scores(needs_captain_review, computed_at DESC)
  WHERE needs_captain_review = 1;

ALTER TABLE notes ADD COLUMN curator_parse_error INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_memory_curator',
  'memory-curator',
  'Memory Curator',
  'Daily 5-axis curator pass over memory-tagged notes. Promotes draft->stable+injectable when all axes pass; flags needs_captain_review for ambiguous cases. Cron triggers at 04:17 UTC; manual via POST /admin/memory/curate.',
  1,
  'enterprise',
  2,
  NULL,
  NULL,
  NULL,
  1,
  datetime('now'),
  datetime('now')
);
