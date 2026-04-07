-- Second incremental migration: add a tags column to posts.

ALTER TABLE posts ADD COLUMN tags TEXT;
