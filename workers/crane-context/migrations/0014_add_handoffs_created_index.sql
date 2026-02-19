-- Migration: Add index for date-range handoff queries
-- Enables querying handoffs by created_at without requiring venture+repo filters.
-- Used by /content-scan to fetch all recent handoffs in a single call.

CREATE INDEX IF NOT EXISTS idx_handoffs_created ON handoffs(created_at DESC, id DESC);
