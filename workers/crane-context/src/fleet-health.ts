/**
 * Crane Context Worker - Fleet Health Findings DAL
 *
 * Plan §C.4. The weekly fleet-ops-health audit walks the venturecrane org
 * via the GitHub API and writes its findings here. The SOS reads this
 * table to render a dedicated Fleet Health section, separate from the
 * webhook-driven CI/CD alerts in the `notifications` table.
 *
 * Auto-resolution model: each ingest is a FULL SNAPSHOT of fleet state.
 * Findings whose (repo_full_name, finding_type) are present in the new
 * snapshot are upserted (new row for each generated_at). Findings whose
 * (repo, type) are NOT in the new snapshot get auto-resolved. This gives
 * us "green restores truth" semantics without coupling to the webhook
 * notification auto-resolver.
 */

import { ulid } from 'ulidx'
import { nowIso } from './utils'

// ============================================================================
// Types
// ============================================================================

export type FleetFindingSeverity = 'error' | 'warning' | 'info'
export type FleetFindingStatus = 'new' | 'resolved'
export type FleetFindingResolveReason = 'auto_snapshot' | 'manual'

/**
 * Source discriminator for a finding. Distinct audit pipelines share
 * this table but never resolve each other's rows.
 *
 *   'github'  — weekly fleet-ops-health audit (GitHub org state).
 *   'machine' — host-patch orchestrator (Hermes-on-mini; #657).
 *
 * Rows written before migration 0037 are back-filled to 'github'.
 */
export type FleetFindingSource = 'github' | 'machine'

/**
 * Stable enum of finding types. Kept as a string (not strict enum) so
 * new finding types don't require a schema change — the ingest endpoint
 * stores unknowns for forward-compat.
 *
 * GitHub-source types come from scripts/fleet-ops-health.sh.
 * Machine-source types come from the fleet-update orchestrator.
 */
export const KNOWN_FINDING_TYPES = [
  // GitHub-source (fleet-ops-health.sh)
  'archived',
  'template',
  'stale-push',
  'ci-failed',
  'ci-cancelled',
  'dependabot-backlog',
  'dependabot-stale',
  'secret-missing',
  'security-workflow-failed',
  // Machine-source (Hermes-on-mini, #657)
  'os-security-patches',
  'os-feature-updates',
  'brew-outdated',
  'reboot-required',
  'uptime-high',
  'xcode-clt-outdated',
  'disk-pressure',
  'preflight-fail',
] as const
export type KnownFindingType = (typeof KNOWN_FINDING_TYPES)[number]

export interface FleetHealthFinding {
  id: string
  generated_at: string
  repo_full_name: string
  finding_type: string
  source: FleetFindingSource
  severity: FleetFindingSeverity
  details_json: string
  status: FleetFindingStatus
  resolved_at: string | null
  resolve_reason: FleetFindingResolveReason | null
  created_at: string
  updated_at: string
}

/** Shape of a single finding in the incoming ingest payload. */
export interface FleetFindingInput {
  repo: string
  rule: string
  severity: FleetFindingSeverity
  message: string
  /** Optional extra fields preserved verbatim in details_json. */
  extra?: Record<string, unknown>
}

export interface FleetHealthIngestRequest {
  org: string
  timestamp: string
  status: 'pass' | 'fail'
  /**
   * Source of this snapshot. Defaults to 'github' for back-compat with
   * the existing fleet-ops-health ingest. Machine-source snapshots must
   * pass 'machine' explicitly.
   */
  source?: FleetFindingSource
  findings: FleetFindingInput[]
}

export interface FleetHealthIngestResult {
  inserted: number
  updated: number
  resolved: number
  generated_at: string
}

export interface FleetHealthListOptions {
  /** Filter by source (github | machine). Omit to return both. */
  source?: FleetFindingSource
  /** Filter by repo full name (owner/repo) — or 'machine/<alias>' for machine rows. */
  repo_full_name?: string
  /** Filter by finding type. */
  finding_type?: string
  /** Filter by severity. */
  severity?: FleetFindingSeverity
  /** Filter by status. Default: 'new' (open findings only). */
  status?: FleetFindingStatus | 'all'
  /** Max rows to return. Default: 100. Max: 500. */
  limit?: number
}

export interface FleetHealthSummary {
  total_open: number
  by_severity: {
    error: number
    warning: number
    info: number
  }
  newest_generated_at: string | null
  open_repos: number
}

// ============================================================================
// ID generation
// ============================================================================

export function generateFleetFindingId(): string {
  return `fhf_${ulid()}`
}

// ============================================================================
// Ingest (full-snapshot upsert with auto-resolve)
// ============================================================================

/**
 * Ingest a full fleet-ops-health snapshot.
 *
 * Semantics:
 *   1. For every (repo, finding_type) in the payload:
 *      - If an open finding already exists, UPDATE its generated_at,
 *        severity, and details_json (the latest snapshot is the truth).
 *      - Otherwise INSERT a new row.
 *   2. For every open finding whose (repo, finding_type) is NOT in the
 *      payload: mark resolved with reason='auto_snapshot'.
 *
 * This runs in a single transaction via `db.batch()` so partial ingests
 * cannot leave the table in an inconsistent state. Open rows are the
 * source of truth — their creation timestamp is the first time the
 * finding was seen, and their updated_at is the latest snapshot that
 * still observed it.
 */
export async function ingestFleetHealth(
  db: D1Database,
  req: FleetHealthIngestRequest
): Promise<FleetHealthIngestResult> {
  const generated_at = req.timestamp
  const now = nowIso()

  // Default source to 'github' for back-compat with the pre-#657
  // fleet-ops-health ingest payload shape. Machine-source snapshots
  // must pass source='machine' explicitly.
  const source: FleetFindingSource = req.source ?? 'github'

  // Load current open findings FOR THIS SOURCE so we can compute the
  // delta: which ones to upsert (still present) vs which ones to
  // auto-resolve (gone).
  //
  // CRITICAL: this query is scoped by source. Without it, a
  // machine-source snapshot would auto-resolve every open GitHub
  // finding (and vice-versa). Plan critique Issue #1 — see
  // `~/.claude/plans/cuddly-riding-sifakis.md`.
  const openRows = await db
    .prepare(
      `SELECT id, repo_full_name, finding_type
       FROM fleet_health_findings
       WHERE status = 'new' AND source = ?`
    )
    .bind(source)
    .all<{ id: string; repo_full_name: string; finding_type: string }>()

  const openByKey = new Map<string, { id: string }>()
  for (const row of openRows.results || []) {
    openByKey.set(`${row.repo_full_name}|${row.finding_type}`, { id: row.id })
  }

  // Build the set of keys present in the new snapshot.
  const incomingKeys = new Set<string>()

  let inserted = 0
  let updated = 0

  // We batch writes for atomicity. D1's batch is all-or-nothing for a
  // sequence of prepared statements against the same DB binding, which
  // is the guarantee we need: a crashed ingest never leaves half a
  // snapshot in the table.
  const statements: D1PreparedStatement[] = []

  for (const finding of req.findings) {
    const key = `${finding.repo}|${finding.rule}`
    incomingKeys.add(key)

    const details: Record<string, unknown> = {
      message: finding.message,
      ...(finding.extra || {}),
    }
    const detailsJson = JSON.stringify(details)

    const existing = openByKey.get(key)
    if (existing) {
      // UPDATE — this finding is still open in the new snapshot.
      statements.push(
        db
          .prepare(
            `UPDATE fleet_health_findings
             SET generated_at = ?,
                 severity = ?,
                 details_json = ?,
                 updated_at = ?
             WHERE id = ?`
          )
          .bind(generated_at, finding.severity, detailsJson, now, existing.id)
      )
      updated++
    } else {
      // INSERT — new finding not previously seen.
      const id = generateFleetFindingId()
      statements.push(
        db
          .prepare(
            `INSERT INTO fleet_health_findings (
               id, generated_at, repo_full_name, finding_type, source,
               severity, details_json, status, resolved_at, resolve_reason,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, NULL, ?, ?)`
          )
          .bind(
            id,
            generated_at,
            finding.repo,
            finding.rule,
            source,
            finding.severity,
            detailsJson,
            now,
            now
          )
      )
      inserted++
    }
  }

  // Auto-resolve: every open finding whose key is NOT in the new snapshot.
  let resolved = 0
  for (const [key, { id }] of openByKey) {
    if (incomingKeys.has(key)) continue
    statements.push(
      db
        .prepare(
          `UPDATE fleet_health_findings
           SET status = 'resolved',
               resolved_at = ?,
               resolve_reason = 'auto_snapshot',
               updated_at = ?
           WHERE id = ? AND status = 'new'`
        )
        .bind(now, now, id)
    )
    resolved++
  }

  if (statements.length > 0) {
    await db.batch(statements)
  }

  return {
    inserted,
    updated,
    resolved,
    generated_at,
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * List fleet health findings. Default: open findings only, newest first.
 */
export async function listFleetHealthFindings(
  db: D1Database,
  opts: FleetHealthListOptions = {}
): Promise<FleetHealthFinding[]> {
  const limit = Math.min(opts.limit ?? 100, 500)
  const clauses: string[] = []
  const binds: unknown[] = []

  const status = opts.status ?? 'new'
  if (status !== 'all') {
    clauses.push(`status = ?`)
    binds.push(status)
  }
  if (opts.source) {
    clauses.push(`source = ?`)
    binds.push(opts.source)
  }
  if (opts.repo_full_name) {
    clauses.push(`repo_full_name = ?`)
    binds.push(opts.repo_full_name)
  }
  if (opts.finding_type) {
    clauses.push(`finding_type = ?`)
    binds.push(opts.finding_type)
  }
  if (opts.severity) {
    clauses.push(`severity = ?`)
    binds.push(opts.severity)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const sql = `
    SELECT id, generated_at, repo_full_name, finding_type, source, severity,
           details_json, status, resolved_at, resolve_reason,
           created_at, updated_at
    FROM fleet_health_findings
    ${where}
    ORDER BY generated_at DESC, severity DESC, repo_full_name ASC
    LIMIT ?
  `
  binds.push(limit)

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<FleetHealthFinding>()

  return (result.results || []) as FleetHealthFinding[]
}

/**
 * Summary counts for the SOS "Fleet Health" section header.
 */
export async function getFleetHealthSummary(db: D1Database): Promise<FleetHealthSummary> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_open,
         SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS errors,
         SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warnings,
         SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) AS infos,
         MAX(generated_at) AS newest_generated_at,
         COUNT(DISTINCT repo_full_name) AS open_repos
       FROM fleet_health_findings
       WHERE status = 'new'`
    )
    .first<{
      total_open: number | null
      errors: number | null
      warnings: number | null
      infos: number | null
      newest_generated_at: string | null
      open_repos: number | null
    }>()

  return {
    total_open: row?.total_open ?? 0,
    by_severity: {
      error: row?.errors ?? 0,
      warning: row?.warnings ?? 0,
      info: row?.infos ?? 0,
    },
    newest_generated_at: row?.newest_generated_at ?? null,
    open_repos: row?.open_repos ?? 0,
  }
}

/**
 * Manually resolve a single finding (e.g., Captain triaged it).
 */
export async function manuallyResolveFleetFinding(db: D1Database, id: string): Promise<boolean> {
  const now = nowIso()
  const result = await db
    .prepare(
      `UPDATE fleet_health_findings
       SET status = 'resolved',
           resolved_at = ?,
           resolve_reason = 'manual',
           updated_at = ?
       WHERE id = ? AND status = 'new'`
    )
    .bind(now, now, id)
    .run()

  return (result.meta?.changes ?? 0) > 0
}
