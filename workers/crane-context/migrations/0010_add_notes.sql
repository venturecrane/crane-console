-- Migration: Add notes table for enterprise knowledge store
-- Stores Captain's Log entries, reference data, contacts, ideas, governance notes

CREATE TABLE notes (
  id TEXT PRIMARY KEY,                  -- note_<ULID>
  category TEXT NOT NULL
    CHECK(category IN ('log', 'reference', 'contact', 'idea', 'governance')),
  title TEXT,                           -- optional title/subject
  content TEXT NOT NULL,                -- note body (markdown)
  tags TEXT,                            -- JSON array: ["ke", "billing", "stripe"]
  venture TEXT,                         -- optional venture scope (null = global)
  archived INTEGER NOT NULL DEFAULT 0,  -- soft delete flag
  created_at TEXT NOT NULL,             -- ISO 8601
  updated_at TEXT NOT NULL,
  actor_key_id TEXT,                    -- who created/last modified
  meta_json TEXT                        -- extensible metadata (unused in v1)
);

CREATE INDEX idx_notes_category ON notes(category);
CREATE INDEX idx_notes_venture ON notes(venture);
CREATE INDEX idx_notes_created ON notes(created_at DESC);
