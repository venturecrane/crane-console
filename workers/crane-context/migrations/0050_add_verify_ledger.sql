-- Migration 0050: Add verify_ledger + verify_files for crane_verify telemetry
--
-- Records claim/output evidence for verification calls so PR 2 gates can
-- check artifact presence and PR 3 can auto-attach prior claims onto
-- regression issues. Designed as a ledger writer: agents capture output
-- with whatever tool fits (Bash, Context7, gh api, wrangler) and submit;
-- the table is the cross-session record, not an execution surface.
--
-- Integrity columns (output_hash, command_hash) let the PR 3 audit sample
-- rows and re-run the captured command to verify the claim↔output binding
-- mechanically rather than by honor system. The verify_files join table
-- avoids LIKE-on-JSON scanning when /verify/origin lookups grow.
--
-- The `source` column distinguishes manual (Captain-initiated), tool
-- (agent-initiated via the MCP tool), and hook (PR 2's PreToolUse hook
-- writes). PR 1 only emits 'tool' and 'manual'; PR 2 can sample/rate-limit
-- 'hook' writes without a schema migration.

CREATE TABLE IF NOT EXISTS verify_ledger (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  venture TEXT,
  repo TEXT,
  method TEXT NOT NULL CHECK (method IN ('live_state', 'fresh_process', 'vendor_docs')),
  source TEXT NOT NULL DEFAULT 'tool' CHECK (source IN ('manual', 'tool', 'hook')),
  claim TEXT NOT NULL,
  output_scrubbed TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  output_redacted INTEGER NOT NULL DEFAULT 0,
  output_truncation TEXT NOT NULL DEFAULT 'none' CHECK (output_truncation IN ('none', 'head', 'tail', 'head_tail')),
  tool_used TEXT NOT NULL,
  command TEXT,
  command_hash TEXT,
  fresh_runtime INTEGER,
  fresh_runtime_justification TEXT,
  actor_key_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_verify_session_time ON verify_ledger (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_verify_method_time  ON verify_ledger (method, created_at);
CREATE INDEX IF NOT EXISTS idx_verify_created      ON verify_ledger (created_at);

CREATE TABLE IF NOT EXISTS verify_files (
  verify_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  PRIMARY KEY (file_path, verify_id),
  FOREIGN KEY (verify_id) REFERENCES verify_ledger(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verify_files_verify ON verify_files (verify_id);
