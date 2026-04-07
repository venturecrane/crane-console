-- Intentionally broken migration used by the rollback test.
-- Creates a valid table, inserts a row, then references a column that
-- doesn't exist. The runner should roll back the entire file.

CREATE TABLE rollback_test (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO rollback_test (id, name) VALUES (1, 'should be rolled back');

-- This statement fails: 'nonexistent_column' is not in the table.
INSERT INTO rollback_test (id, nonexistent_column) VALUES (2, 'fail');
