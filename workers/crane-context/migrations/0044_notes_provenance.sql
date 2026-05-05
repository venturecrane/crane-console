-- 0044_notes_provenance.sql
--
-- Memory recall efficacy upgrade (PR 1 of 3) - provenance + curator columns.
-- Split from a draft combined-with-FTS5 version so the column changes apply
-- under any SQLite build (D1, miniflare, node:sqlite minimal). The FTS5
-- virtual table lives in 0045 because node:sqlite's bundled SQLite does
-- not include the fts5 module; the test-harness runner detects that error
-- and skips the file.
--
-- Columns added:
--   authored_by_session_id - Claude session UUID at write time, used by the
--     curator to provenance-trace memories back to the session that wrote
--     them. Required for the regression-rate behavioral metric (PR 3 wires
--     in transcript ingest; consumer ships later).
--   source_hash - SHA-256 of the upstream source body (e.g., the auto-memory
--     .md file) used by createNote() for UPSERT-on-collision idempotency in
--     migrate-auto-memory-to-vcms.sh.
--   embedding_model / embedding_version / embedding_hash - reserved for the
--     conditional Phase-4 vector work (gate: corpus >= 80 stable OR sustained
--     MRR@5 < 0.5). Not populated now.
--   injectable - curator-computed flag. Default 0; PR 2 sets it to 1 when
--     the 5-axis curator pass succeeds.
--
-- See plan: /Users/scottdurgan/.claude/plans/distributed-dreaming-swing.md
--
-- Rollback: forward-only. Columns are inert if the worker rolls back.
--   DELETE FROM d1_migrations WHERE name = '0044_notes_provenance.sql';
--   (column drops require the SQLite 3.35+ rebuild dance; skip.)

ALTER TABLE notes ADD COLUMN authored_by_session_id TEXT;
ALTER TABLE notes ADD COLUMN source_hash TEXT;
ALTER TABLE notes ADD COLUMN embedding_model TEXT;
ALTER TABLE notes ADD COLUMN embedding_version TEXT;
ALTER TABLE notes ADD COLUMN embedding_hash TEXT;
ALTER TABLE notes ADD COLUMN injectable INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_notes_source_hash
  ON notes(source_hash)
  WHERE source_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_injectable
  ON notes(injectable)
  WHERE injectable = 1;
