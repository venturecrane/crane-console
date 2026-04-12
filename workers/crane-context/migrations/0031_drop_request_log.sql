-- Migration: Drop dead request_log table
-- The request_log table was defined in schema.sql but never written to by any code path.
-- Identified as dead in platform audits 2026-04-11 and 2026-04-12.
-- Indices are automatically dropped with the table in SQLite.

DROP TABLE IF EXISTS request_log;
