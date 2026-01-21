-- Crane Context Worker - Scripts Storage Migration
-- Migration: 0004
-- Date: 2026-01-21
-- Purpose: Add context_scripts table for operational script storage
-- Reference: GitHub Issue #51 - Centralize operational scripts

-- ============================================================================
-- Context Scripts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS context_scripts (
  -- Identity & Scope
  scope TEXT NOT NULL,                    -- 'global' or venture code (vc, dfg, sc)
  script_name TEXT NOT NULL,              -- Unique name: sod-universal.sh, validate-env.sh

  -- Content
  content TEXT NOT NULL,                  -- Full script content
  content_hash TEXT NOT NULL,             -- SHA-256(content) for cache validation
  content_size_bytes INTEGER NOT NULL,    -- Size for monitoring

  -- Script Metadata
  script_type TEXT NOT NULL DEFAULT 'bash',  -- bash, python, etc (future)
  executable BOOLEAN NOT NULL DEFAULT 1,  -- Should script be marked executable
  description TEXT,                       -- Brief description

  -- Versioning & History
  version INTEGER NOT NULL DEFAULT 1,     -- Increments on updates
  created_at TEXT NOT NULL,               -- ISO 8601
  updated_at TEXT NOT NULL,               -- ISO 8601

  -- Attribution
  uploaded_by TEXT,                       -- GitHub Actions, admin, etc.
  source_repo TEXT,                       -- crane-console, etc.
  source_path TEXT,                       -- Original file path in repo

  -- Composite primary key (scope + script_name must be unique)
  PRIMARY KEY (scope, script_name)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Query scripts by scope (most common operation for SOD endpoint)
CREATE INDEX IF NOT EXISTS idx_context_scripts_scope
  ON context_scripts(scope, updated_at DESC);

-- Query global scripts (frequently accessed by all ventures)
CREATE INDEX IF NOT EXISTS idx_context_scripts_global
  ON context_scripts(scope, script_name)
  WHERE scope = 'global';

-- Find stale scripts (monitoring & alerting)
CREATE INDEX IF NOT EXISTS idx_context_scripts_stale
  ON context_scripts(updated_at ASC);

-- Query by source repo (useful for sync auditing)
CREATE INDEX IF NOT EXISTS idx_context_scripts_source
  ON context_scripts(source_repo, updated_at DESC);

-- ============================================================================
-- Initial Data
-- ============================================================================

-- This migration creates the table structure only.
-- Script content will be loaded via the admin endpoint (POST /admin/scripts)
-- or uploaded directly after deployment.

-- ============================================================================
-- Migration Notes
-- ============================================================================

-- 1. Composite PK (scope, script_name) ensures uniqueness
-- 2. content_hash enables efficient cache validation (like ETags)
-- 3. version field tracks update count for auditing
-- 4. executable flag indicates if script should be chmod +x after caching
-- 5. Follows same pattern as context_docs for consistency
-- 6. Scripts are typically global scope (used across all ventures)
-- 7. D1 stores TEXT efficiently (no VARCHAR size limits needed)

-- Rollback procedure:
-- DROP INDEX IF EXISTS idx_context_scripts_source;
-- DROP INDEX IF EXISTS idx_context_scripts_stale;
-- DROP INDEX IF EXISTS idx_context_scripts_global;
-- DROP INDEX IF EXISTS idx_context_scripts_scope;
-- DROP TABLE IF EXISTS context_scripts;

-- End of migration
