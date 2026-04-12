-- Migration: 0032_seed_extended_doc_requirements.sql
-- Version: 1.0
-- Date: 2026-04-12
-- Reference: Documentation framework standardization

-- Seed extended doc requirements for portfolio and enterprise docs.
-- Uses INSERT OR IGNORE to avoid conflicts with existing rows (UNIQUE on doc_name_pattern, scope_type, scope_venture).

-- Portfolio docs (per-venture, synced from docs/ventures/{code}/)
INSERT OR IGNORE INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required, condition, description, staleness_days, auto_generate, generation_sources, created_at, updated_at)
VALUES ('product-overview.md', 'all_ventures', NULL, 1, NULL, 'Product overview - what it is, target market, value prop, tech stack.', 90, 0, '[]', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required, condition, description, staleness_days, auto_generate, generation_sources, created_at, updated_at)
VALUES ('roadmap.md', 'all_ventures', NULL, 1, NULL, 'Product roadmap - current milestone, planned work, recent completions.', 30, 0, '[]', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required, condition, description, staleness_days, auto_generate, generation_sources, created_at, updated_at)
VALUES ('metrics.md', 'all_ventures', NULL, 1, NULL, 'Product metrics - KPIs, stage-appropriate measurements, health signals.', 60, 0, '[]', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required, condition, description, staleness_days, auto_generate, generation_sources, created_at, updated_at)
VALUES ('design-spec.md', 'all_ventures', NULL, 1, NULL, 'Design spec - tokens, colors, typography, component patterns, brand voice.', 90, 0, '[]', datetime('now'), datetime('now'));

-- Global enterprise docs
INSERT OR IGNORE INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required, condition, description, staleness_days, auto_generate, generation_sources, created_at, updated_at)
VALUES ('company-overview.md', 'global', NULL, 1, NULL, 'Company structure, mission, entity overview.', 180, 0, '[]', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required, condition, description, staleness_days, auto_generate, generation_sources, created_at, updated_at)
VALUES ('strategic-planning.md', 'global', NULL, 1, NULL, 'Capital allocation principles, evaluation framework.', 90, 0, '[]', datetime('now'), datetime('now'));
