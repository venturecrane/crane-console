-- Classification audit log
CREATE TABLE IF NOT EXISTS classify_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  repo TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  semantic_key TEXT,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  auto_apply INTEGER NOT NULL DEFAULT 1,
  input_hash TEXT NOT NULL,
  ac_extracted TEXT,
  model_output_raw TEXT,
  model_output_json TEXT,
  valid_json INTEGER NOT NULL,
  confidence REAL,
  grade TEXT,
  actions_taken_json TEXT,
  error_code TEXT,
  error_message TEXT,
  latency_ms INTEGER
);

CREATE INDEX idx_classify_repo_issue ON classify_runs(repo, issue_number);
CREATE INDEX idx_classify_idempotency ON classify_runs(idempotency_key);
CREATE INDEX idx_classify_semantic ON classify_runs(semantic_key);
CREATE INDEX idx_classify_created ON classify_runs(created_at);
