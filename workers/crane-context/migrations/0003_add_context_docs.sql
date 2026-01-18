-- Crane Context Worker - Documentation Storage Migration
-- Migration: 0003
-- Date: 2026-01-18
-- Purpose: Add context_docs table for operational documentation storage
-- Reference: Context Worker Doc Storage Feature

-- ============================================================================
-- Context Docs Table
-- ============================================================================

CREATE TABLE context_docs (
  -- Identity & Scope
  scope TEXT NOT NULL,                    -- 'global' or venture code (vc, dfg, sc)
  doc_name TEXT NOT NULL,                 -- Unique name: workflow.md, track-coordinator.md

  -- Content
  content TEXT NOT NULL,                  -- Full markdown content
  content_hash TEXT NOT NULL,             -- SHA-256(content) for cache validation
  content_size_bytes INTEGER NOT NULL,    -- Size for monitoring

  -- Metadata
  doc_type TEXT NOT NULL DEFAULT 'markdown',  -- markdown, json (future)
  title TEXT,                             -- Display title (extracted from # header or provided)
  description TEXT,                       -- Brief description (optional)

  -- Versioning & History
  version INTEGER NOT NULL DEFAULT 1,     -- Increments on updates
  created_at TEXT NOT NULL,               -- ISO 8601
  updated_at TEXT NOT NULL,               -- ISO 8601

  -- Attribution
  uploaded_by TEXT,                       -- GitHub Actions, admin, etc.
  source_repo TEXT,                       -- crane-console, dfg-console, etc.
  source_path TEXT,                       -- Original file path in repo

  -- Composite primary key (scope + doc_name must be unique)
  PRIMARY KEY (scope, doc_name)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Query docs by scope (most common operation for SOD endpoint)
CREATE INDEX idx_context_docs_scope ON context_docs(scope, updated_at DESC);

-- Query global docs (frequently accessed by all ventures)
CREATE INDEX idx_context_docs_global ON context_docs(scope, doc_name)
  WHERE scope = 'global';

-- Find stale docs (monitoring & alerting)
CREATE INDEX idx_context_docs_stale ON context_docs(updated_at ASC);

-- Query by source repo (useful for sync auditing)
CREATE INDEX idx_context_docs_source ON context_docs(source_repo, updated_at DESC);

-- ============================================================================
-- Initial Data (Optional - can be loaded via admin endpoint)
-- ============================================================================

-- This migration creates the table structure only.
-- Documentation content will be loaded via the admin endpoint (POST /admin/docs)
-- or the automated GitHub Actions sync workflow.

-- ============================================================================
-- Migration Notes
-- ============================================================================

-- 1. Composite PK (scope, doc_name) ensures uniqueness
-- 2. content_hash enables efficient cache validation (ETags)
-- 3. version field tracks update count for auditing
-- 4. D1 stores TEXT efficiently (no VARCHAR size limits needed)
-- 5. source_* fields enable traceability back to Git
-- 6. Partial index on 'global' scope optimizes common queries
-- 7. updated_at index enables staleness detection (docs older than 30 days)
-- 8. This migration is idempotent-safe (use IF NOT EXISTS for reruns)

-- Rollback procedure:
-- DROP INDEX IF EXISTS idx_context_docs_source;
-- DROP INDEX IF EXISTS idx_context_docs_stale;
-- DROP INDEX IF EXISTS idx_context_docs_global;
-- DROP INDEX IF EXISTS idx_context_docs_scope;
-- DROP TABLE IF EXISTS context_docs;

-- End of migration
