-- 0044_notes_fts5_and_provenance.sql
--
-- Memory recall efficacy upgrade (PR 1 of 3). Adds two capabilities:
--
--   1) FTS5 virtual table over notes(content, title) so memory recall can
--      do content-shaped queries instead of LIKE substring matching. The
--      backing table mode (`content='notes'`) keeps the index in sync via
--      INSERT/UPDATE/DELETE triggers without duplicating storage.
--
--   2) Provenance + indexing reservation columns on notes. source_hash gates
--      idempotency for the migrate-auto-memory script (UPSERT by hash, not
--      by name). embedding_model / embedding_version / embedding_hash are
--      reserved for the conditional Phase-4 vector work; not populated now.
--      injectable is the curator-computed flag (0 by default; PR 2 sets it).
--
-- See plan: /Users/scottdurgan/.claude/plans/distributed-dreaming-swing.md
--
-- Rollback: forward-only. The virtual table and columns are inert if the
-- worker rolls back to pre-0044 code paths.
--   DELETE FROM d1_migrations WHERE name = '0044_notes_fts5_and_provenance.sql';
--   DROP TABLE IF EXISTS notes_fts;
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

-- External-content FTS5 index. Tags stay on the LIKE-against-JSON path
-- (already handled in listNotes); FTS5 covers free-form body and title.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  content,
  title,
  content='notes',
  content_rowid='rowid'
);

-- Sync triggers. Standard external-content FTS5 pattern:
--   AFTER INSERT  -> mirror new row
--   AFTER DELETE  -> emit a 'delete' command tying back to old.rowid
--   AFTER UPDATE  -> delete-then-insert
-- COALESCE on title because notes.title is nullable.

CREATE TRIGGER IF NOT EXISTS notes_fts_after_insert
AFTER INSERT ON notes
BEGIN
  INSERT INTO notes_fts(rowid, content, title)
  VALUES (NEW.rowid, NEW.content, COALESCE(NEW.title, ''));
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_after_delete
AFTER DELETE ON notes
BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content, title)
  VALUES ('delete', OLD.rowid, OLD.content, COALESCE(OLD.title, ''));
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_after_update
AFTER UPDATE ON notes
BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content, title)
  VALUES ('delete', OLD.rowid, OLD.content, COALESCE(OLD.title, ''));
  INSERT INTO notes_fts(rowid, content, title)
  VALUES (NEW.rowid, NEW.content, COALESCE(NEW.title, ''));
END;

-- Backfill existing rows. external-content FTS5 supports a 'rebuild' command
-- that re-derives the index from the source table.
INSERT INTO notes_fts(notes_fts) VALUES('rebuild');
