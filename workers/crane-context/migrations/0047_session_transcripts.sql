-- 0047_session_transcripts.sql
--
-- Memory recall efficacy upgrade (PR 3 of 3) - fleet-wide session JSONL
-- ingest. Consumed later by the regression-rate-per-anti-pattern miner
-- which mines transcripts for textual recurrence of prohibited behaviors
-- after a memory landed.
--
-- The push script (scripts/push-session-jsonls.sh) runs on each fleet
-- machine via daily cron, finds JSONLs under ~/.claude/projects/*/<UUID>.jsonl
-- modified in the last 36 hours, gzips + base64-encodes them, and POSTs to
-- /admin/sessions/ingest. UPSERT on claude_session_id makes re-ingestion
-- idempotent (overwrite the previous payload with the latest content).
--
-- See plan: /Users/scottdurgan/.claude/plans/distributed-dreaming-swing.md

CREATE TABLE IF NOT EXISTS session_transcripts (
  id TEXT PRIMARY KEY,
  claude_session_id TEXT NOT NULL UNIQUE,
  machine TEXT NOT NULL,
  project TEXT NOT NULL,
  content_jsonl_gz BLOB NOT NULL,
  line_count INTEGER NOT NULL,
  source_size_bytes INTEGER NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_session_transcripts_machine_project_recent
  ON session_transcripts(machine, project, ingested_at DESC);
