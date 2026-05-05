-- 0045_notes_fts5.sql
--
-- Memory recall efficacy upgrade (PR 1 of 3) - FTS5 virtual table.
--
-- Real D1 has the SQLite fts5 module compiled in. node:sqlite (the harness
-- used by some unit tests) does not - the test-harness runMigrations()
-- detects "no such module: fts5" and skips this file with a warning. The
-- canary (Miniflare with the full SQLite build) and production D1 still
-- apply the file normally.
--
-- External-content FTS5 over notes(content, title). Tags stay on the
-- LIKE-against-JSON path (already handled in listNotes); FTS5 covers
-- free-form body and title only. The recall API in packages/crane-mcp
-- routes through this when q is set AND the tag filter targets 'memory'.
--
-- See plan: /Users/scottdurgan/.claude/plans/distributed-dreaming-swing.md
--
-- Rollback: forward-only.
--   DELETE FROM d1_migrations WHERE name = '0045_notes_fts5.sql';
--   DROP TABLE IF EXISTS notes_fts;

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
