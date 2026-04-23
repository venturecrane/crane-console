-- 0037_fleet_health_add_source.sql
--
-- Issue #657 (Phase B). The fleet_health_findings table was built for the
-- weekly GitHub-state audit (.github/workflows/fleet-ops-health.yml →
-- POST /admin/fleet-health/ingest). We're extending it to also carry
-- findings from the host-patch orchestrator (Hermes-on-mini), which
-- posts a different kind of snapshot (OS updates, brew outdated,
-- reboot-required, uptime, etc.) keyed by machine alias.
--
-- Key design constraint (from plan critique): the auto-resolve tuple
-- MUST include `source`, and the ingestFleetHealth pre-load query MUST
-- scope by source. Otherwise a machine-only snapshot would sweep every
-- open GitHub finding into resolved, and vice-versa. The new index
-- backs that lookup.
--
-- Convention for machine findings: repo_full_name = 'machine/<alias>'
-- (e.g. 'machine/mini'). This overloads a column name whose semantics
-- are "GitHub repo" but avoids a parallel table with duplicate schema
-- and lifecycle logic. SOS renderer branches on `source` before URL
-- generation so no dead github.com/machine/* links are emitted.

-- Add nullable column for back-compat with existing rows. SQLite's
-- ALTER TABLE ADD COLUMN does not support NOT NULL without a default,
-- and defaulting to 'github' is fine semantically — every existing row
-- was posted by the GitHub audit.
ALTER TABLE fleet_health_findings ADD COLUMN source TEXT;

-- Back-fill existing rows to 'github'. New machine rows will be written
-- with source='machine' by the orchestrator.
UPDATE fleet_health_findings SET source = 'github' WHERE source IS NULL;

-- Auto-resolve lookup — "find the open finding for this
-- (source, repo, type)". This is the index ingestFleetHealth uses for
-- its pre-load query. Keeping the older idx_fleet_findings_match for
-- compatibility with any direct (repo, type) queries, but the new
-- source-scoped index is the primary hot path.
CREATE INDEX IF NOT EXISTS idx_fleet_findings_match_src
  ON fleet_health_findings(source, repo_full_name, finding_type, status);
