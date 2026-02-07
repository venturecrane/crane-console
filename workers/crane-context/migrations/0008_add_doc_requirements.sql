-- Crane Context Worker - Documentation Requirements Manifest
-- Version: 1.0
-- Date: 2026-02-06
-- Reference: Self-healing documentation system

-- ============================================================================
-- doc_requirements table
-- ============================================================================
-- Defines what documentation each venture should have.
-- Used by the audit system to detect missing or stale docs.

CREATE TABLE doc_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_name_pattern TEXT NOT NULL,       -- e.g., '{venture}-project-instructions.md' or literal name
  scope_type TEXT NOT NULL,             -- 'global', 'all_ventures', 'venture'
  scope_venture TEXT,                   -- NULL for global/all_ventures, venture code for specific
  required INTEGER NOT NULL DEFAULT 1,  -- 1=required, 0=recommended
  condition TEXT,                       -- NULL=always, 'has_api', 'has_database'
  description TEXT,
  staleness_days INTEGER DEFAULT 90,
  auto_generate INTEGER DEFAULT 1,      -- 1=can be auto-generated, 0=must be manual
  generation_sources TEXT,              -- JSON array: hints for generator (e.g., '["routes","migrations"]')
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(doc_name_pattern, scope_type, scope_venture)
);

-- Index for querying requirements by scope
CREATE INDEX idx_doc_requirements_scope ON doc_requirements(scope_type, scope_venture);
