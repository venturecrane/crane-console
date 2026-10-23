-- Migration 0057: Retire the roadmap.md and strategic-planning.md doc requirements
--
-- Context: Captain directive on 2026-10-22, from an ss-console session. The
-- enterprise is all in on SMD Services and the Operator/agent products; the
-- per-venture roadmap page and the global strategic-planning page are
-- artifacts of the enterprise finding its way and nobody reads them. Both
-- rows (seeded by 0032) had been flagging stale in every /sos briefing:
-- roadmap.md at 143 days for five ventures and 31 for ss, strategic-planning.md
-- at 143 days everywhere.
--
-- The source files docs/ventures/ss/roadmap.md and docs/company/strategic-planning.md
-- are deleted in the same change; sync-docs.yml removes their context_docs
-- rows on merge. The matching entries are removed from DEFAULT_DOC_REQUIREMENTS
-- so ensureDefaultsSeeded does not re-insert them.
--
-- Pattern mirrors migrations 0036, 0049, 0055 and 0056. Idempotent: re-running
-- finds no matching row and DELETE is a no-op. Fresh deployments still run
-- 0032's INSERT OR IGNORE, but 0057 runs after it and removes the rows, so a
-- fresh environment converges to the same state as a migrated one.

DELETE FROM doc_requirements
WHERE (doc_name_pattern = 'roadmap.md' AND scope_type = 'all_ventures')
   OR (doc_name_pattern = 'strategic-planning.md' AND scope_type = 'global');
