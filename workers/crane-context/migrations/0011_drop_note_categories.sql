-- Drop category column from notes table
-- Categories replaced by tags-only taxonomy

CREATE TABLE notes_new (
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
CREATE INDEX idx_notes_venture ON notes(venture);
CREATE INDEX idx_notes_created ON notes(created_at DESC);
CREATE INDEX idx_notes_tags ON notes(tags) WHERE tags IS NOT NULL;
