-- Drop category column from notes table
-- Categories replaced by tags-only taxonomy
--
-- !! DESTRUCTIVE MIGRATION — NOT IDEMPOTENT !!
-- 2026-04-08 retroactive idempotency note (see 0027):
-- This migration performs a destructive table rebuild. Re-running it against
-- a database where the new `notes` schema (without category) is already in
-- place would error on the `INSERT INTO notes_new ... SELECT id, title, ...
-- FROM notes` step because the current `notes` already lacks the category
-- column (which was the original source). Protection against re-run is the
-- d1_migrations tracking table populated by 0027 + the I-3b CI guard. Do NOT
-- run this file directly via `wrangler d1 execute --file` on a populated
-- database; use `wrangler d1 migrations apply` which honors d1_migrations.
-- The indexes below are idempotent-guarded for safety even though the rest
-- of the file is not.

CREATE TABLE IF NOT EXISTS notes_new (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  tags TEXT,                            -- JSON array: ["executive-summary", "prd"]
  venture TEXT,                         -- optional venture scope (null = global)
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  actor_key_id TEXT,
  meta_json TEXT
);

INSERT INTO notes_new (id, title, content, tags, venture, archived, created_at, updated_at, actor_key_id, meta_json)
  SELECT id, title, content, tags, venture, archived, created_at, updated_at, actor_key_id, meta_json
  FROM notes;

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

-- Recreate indexes (drop category index, keep the rest)
CREATE INDEX IF NOT EXISTS idx_notes_venture ON notes(venture);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes(tags) WHERE tags IS NOT NULL;
