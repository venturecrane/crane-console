-- Migration 0035: Supersede zombie sessions with dotted-agent names
--
-- Context: The 2026-04 agent-identity contract-drift fix changes macOS
-- clients from sending `agent: "crane-mcp-m16.local"` to the new shape
-- `agent: "crane-mcp-m16-local-<hash>"`. Because `active_sessions` dedup
-- keys on `(agent, venture, repo, track)`, any existing ACTIVE session
-- with the old dotted-agent shape becomes unreachable after clients
-- upgrade — the new client's tuple never matches it, so the normal
-- resume-or-create supersede path never fires.
--
-- Pre-flight counts (2026-04-16):
--   staging: 12 active, 58 abandoned, 11 ended
--   prod:    17 active, 143 abandoned, 273 ended
--
-- The 12 staging + 17 prod ACTIVE rows would otherwise linger forever.
-- This migration supersedes them with an explicit end_reason tag so the
-- cutover is auditable. Non-active rows (abandoned, ended) stay as-is
-- — their lifecycle is already terminal.
--
-- Safe to rerun: the WHERE clause targets `status = 'active'` and after
-- the first run those rows no longer match. Idempotent.
--
-- Schema conventions:
--   * `status = 'ended'` and `end_reason = 'superseded'` matches the
--     existing markSessionsSuperseded() path (workers/crane-context/src/sessions.ts:315).
--   * `meta_json` records the migration tag so this batch is auditable and
--     distinguishable from the normal supersede path.
--   * END_REASONS in src/constants.ts limits valid values to
--     ['manual', 'stale', 'superseded', 'error'] — we stay in that set.

UPDATE sessions
SET status = 'ended',
    end_reason = 'superseded',
    ended_at = CURRENT_TIMESTAMP,
    meta_json = json_set(
      COALESCE(meta_json, '{}'),
      '$.migration',
      'agent-format-migration-2026-04'
    )
WHERE status = 'active'
  AND agent LIKE '%.local';
