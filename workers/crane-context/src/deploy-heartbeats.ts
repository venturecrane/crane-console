/**
 * Crane Context Worker - Deploy Heartbeats Data Access Layer
 *
 * Plan §B.6: deploy pipeline cold detector. The cold signal is
 * COMMITS-WITHOUT-DEPLOY, NOT a flat threshold:
 *
 *   cold = last_main_commit_at > last_success_at
 *        AND (now - last_main_commit_at) > cold_threshold_days
 *        AND NOT suppressed
 *
 * A repo with no recent commits is NOT cold. A template repo with no main
 * activity is NOT cold. A dormant repo is NOT cold. Only active commits
 * stuck without deploy trigger the signal.
 */

import { nowIso } from './utils'

// ============================================================================
// Types
// ============================================================================

export interface DeployHeartbeat {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch: string

  last_main_commit_at: string | null
  last_main_commit_sha: string | null

  last_success_at: string | null
  last_success_sha: string | null
  last_success_run_id: number | null

  last_run_at: string | null
  last_run_id: number | null
  last_run_conclusion: string | null

  consecutive_failures: number
  suppressed: number
  suppress_reason: string | null
  suppress_until: string | null
  cold_threshold_days: number

  created_at: string
  updated_at: string
}

export interface CommitObservation {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  commit_at: string // ISO8601
  commit_sha: string
}

export interface RunObservation {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  run_id: number
  run_at: string // ISO8601
  conclusion: string // 'success' | 'failure' | 'cancelled' | 'neutral' | etc
  head_sha: string | null
}

export interface SuppressParams {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  reason: string
  until?: string | null
}

export interface ColdHeartbeat extends DeployHeartbeat {
  /** ms since the stuck commit was pushed (always > cold_threshold_days * 86400000). */
  age_ms: number
}

// ============================================================================
// Cold detection
// ============================================================================

/**
 * Returns true if the heartbeat is COLD per the §B.6 commits-without-deploy
 * condition. Pure function — no I/O. The runner queries the table and feeds
 * each row through this. Suppressed rows are never cold by definition.
 */
export function isHeartbeatCold(hb: DeployHeartbeat, now: Date = new Date()): boolean {
  if (hb.suppressed === 1) return false

  // Honor suppress_until — if it's in the future, treat as suppressed.
  if (hb.suppress_until) {
    const until = Date.parse(hb.suppress_until)
    if (Number.isFinite(until) && until > now.getTime()) return false
  }

  if (!hb.last_main_commit_at) return false

  // No success ever, but a commit exists → potentially cold.
  // OR success exists but is older than the latest commit → cold candidate.
  const commitMs = Date.parse(hb.last_main_commit_at)
  if (!Number.isFinite(commitMs)) return false

  if (hb.last_success_at) {
    const successMs = Date.parse(hb.last_success_at)
    if (Number.isFinite(successMs) && successMs >= commitMs) {
      // Latest deploy is at or after the latest commit — not cold.
      return false
    }
  }

  // commit exists but never deployed (or last deploy is older).
  // Now check the threshold: the commit must be older than cold_threshold_days.
  const ageMs = now.getTime() - commitMs
  const thresholdMs = hb.cold_threshold_days * 86_400_000
  return ageMs > thresholdMs
}

// ============================================================================
// Upsert / observe
// ============================================================================

/**
 * Upsert a commit observation. Updates only the commit fields, leaving
 * deploy state alone. Called from the GitHub `push` webhook handler.
 *
 * If the row doesn't exist yet, creates it with default cold_threshold
 * (3 days — caller should override via discoverWorkflows for known
 * venture-class thresholds).
 */
export async function recordCommit(
  db: D1Database,
  obs: CommitObservation,
  defaultColdThresholdDays = 3
): Promise<void> {
  const now = nowIso()
  const branch = obs.branch ?? 'main'

  await db
    .prepare(
      `
      INSERT INTO deploy_heartbeats (
        venture, repo_full_name, workflow_id, branch,
        last_main_commit_at, last_main_commit_sha,
        cold_threshold_days, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(venture, repo_full_name, workflow_id, branch) DO UPDATE SET
        last_main_commit_at = excluded.last_main_commit_at,
        last_main_commit_sha = excluded.last_main_commit_sha,
        updated_at = excluded.updated_at
      `
    )
    .bind(
      obs.venture,
      obs.repo_full_name,
      obs.workflow_id,
      branch,
      obs.commit_at,
      obs.commit_sha,
      defaultColdThresholdDays,
      now,
      now
    )
    .run()
}

/**
 * Upsert a workflow run observation. Updates the deploy state — and if
 * the run was a success, advances `last_success_at` so the cold detector
 * stops firing. Called from the GitHub `workflow_run` webhook handler in
 * crane-watch.
 */
export async function recordRun(
  db: D1Database,
  obs: RunObservation,
  defaultColdThresholdDays = 3
): Promise<void> {
  const now = nowIso()
  const branch = obs.branch ?? 'main'
  const isSuccess = obs.conclusion === 'success'

  // We use a conditional UPDATE pattern: always update last_run_*, but
  // only advance last_success_* when the conclusion is 'success'. SQLite
  // ON CONFLICT allows referencing `excluded.column` and the existing
  // row's column for the conditional COALESCE pattern.
  await db
    .prepare(
      `
      INSERT INTO deploy_heartbeats (
        venture, repo_full_name, workflow_id, branch,
        last_run_at, last_run_id, last_run_conclusion,
        last_success_at, last_success_sha, last_success_run_id,
        consecutive_failures,
        cold_threshold_days, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(venture, repo_full_name, workflow_id, branch) DO UPDATE SET
        last_run_at = excluded.last_run_at,
        last_run_id = excluded.last_run_id,
        last_run_conclusion = excluded.last_run_conclusion,
        last_success_at = CASE
          WHEN ? = 1 THEN excluded.last_success_at
          ELSE deploy_heartbeats.last_success_at
        END,
        last_success_sha = CASE
          WHEN ? = 1 THEN excluded.last_success_sha
          ELSE deploy_heartbeats.last_success_sha
        END,
        last_success_run_id = CASE
          WHEN ? = 1 THEN excluded.last_success_run_id
          ELSE deploy_heartbeats.last_success_run_id
        END,
        consecutive_failures = CASE
          WHEN ? = 1 THEN 0
          ELSE deploy_heartbeats.consecutive_failures + 1
        END,
        updated_at = excluded.updated_at
      `
    )
    .bind(
      obs.venture,
      obs.repo_full_name,
      obs.workflow_id,
      branch,
      obs.run_at,
      obs.run_id,
      obs.conclusion,
      isSuccess ? obs.run_at : null,
      isSuccess ? obs.head_sha : null,
      isSuccess ? obs.run_id : null,
      isSuccess ? 0 : 1,
      defaultColdThresholdDays,
      now,
      now,
      isSuccess ? 1 : 0,
      isSuccess ? 1 : 0,
      isSuccess ? 1 : 0,
      isSuccess ? 1 : 0
    )
    .run()
}

// ============================================================================
// Queries
// ============================================================================

/**
 * List all heartbeats for a venture. Caller filters down to cold ones via
 * `isHeartbeatCold`. Suppressed rows are included so the SOS can render
 * the suppression list separately.
 */
export async function listHeartbeats(db: D1Database, venture: string): Promise<DeployHeartbeat[]> {
  const result = await db
    .prepare(
      `SELECT * FROM deploy_heartbeats WHERE venture = ? ORDER BY repo_full_name, workflow_id`
    )
    .bind(venture)
    .all<DeployHeartbeat>()

  return (result.results || []) as DeployHeartbeat[]
}

/**
 * List ALL heartbeats across all ventures. Used by the reconciliation
 * cron and the global SOS view.
 */
export async function listAllHeartbeats(db: D1Database): Promise<DeployHeartbeat[]> {
  const result = await db
    .prepare(`SELECT * FROM deploy_heartbeats ORDER BY venture, repo_full_name, workflow_id`)
    .all<DeployHeartbeat>()

  return (result.results || []) as DeployHeartbeat[]
}

/**
 * Find cold heartbeats for a venture. Composes `listHeartbeats` and
 * `isHeartbeatCold` for callers that just want the cold ones.
 */
export async function findColdHeartbeats(
  db: D1Database,
  venture: string,
  now: Date = new Date()
): Promise<ColdHeartbeat[]> {
  const all = await listHeartbeats(db, venture)
  const cold: ColdHeartbeat[] = []
  for (const hb of all) {
    if (!isHeartbeatCold(hb, now)) continue
    const ageMs = hb.last_main_commit_at ? now.getTime() - Date.parse(hb.last_main_commit_at) : 0
    cold.push({ ...hb, age_ms: ageMs })
  }
  return cold
}

/**
 * Find heartbeats with a stale webhook signal — last commit was recent
 * but no run has been recorded in `staleWebhookHours`. Used by the
 * reconciliation cron to detect dropped webhook deliveries.
 */
export async function findStaleWebhookHeartbeats(
  db: D1Database,
  venture: string,
  staleWebhookHours = 12,
  now: Date = new Date()
): Promise<DeployHeartbeat[]> {
  const all = await listHeartbeats(db, venture)
  const cutoff = now.getTime() - staleWebhookHours * 3_600_000
  return all.filter((hb) => {
    if (hb.suppressed === 1) return false
    if (!hb.last_main_commit_at) return false
    const commitMs = Date.parse(hb.last_main_commit_at)
    if (!Number.isFinite(commitMs)) return false
    // Recent commit AND no run recorded since the commit
    if (commitMs < cutoff) return false
    if (!hb.last_run_at) return true
    return Date.parse(hb.last_run_at) < commitMs
  })
}

// ============================================================================
// Suppression (explicit, auditable, reversible — Plan §B.2 T8)
// ============================================================================

export async function suppressHeartbeat(db: D1Database, params: SuppressParams): Promise<void> {
  const branch = params.branch ?? 'main'
  await db
    .prepare(
      `
      UPDATE deploy_heartbeats
      SET suppressed = 1,
          suppress_reason = ?,
          suppress_until = ?,
          updated_at = ?
      WHERE venture = ? AND repo_full_name = ? AND workflow_id = ? AND branch = ?
      `
    )
    .bind(
      params.reason,
      params.until ?? null,
      nowIso(),
      params.venture,
      params.repo_full_name,
      params.workflow_id,
      branch
    )
    .run()
}

export async function unsuppressHeartbeat(
  db: D1Database,
  params: { venture: string; repo_full_name: string; workflow_id: number; branch?: string }
): Promise<void> {
  const branch = params.branch ?? 'main'
  await db
    .prepare(
      `
      UPDATE deploy_heartbeats
      SET suppressed = 0,
          suppress_reason = NULL,
          suppress_until = NULL,
          updated_at = ?
      WHERE venture = ? AND repo_full_name = ? AND workflow_id = ? AND branch = ?
      `
    )
    .bind(nowIso(), params.venture, params.repo_full_name, params.workflow_id, branch)
    .run()
}

/**
 * Seed an empty heartbeat row for a (venture, repo, workflow_id, branch).
 * Used by the manual seeding flow before reconciliation cron exists, and
 * by the cron itself once it ships. Idempotent — second seed is a no-op.
 *
 * The row is created with no commit or run state. Subsequent push and
 * workflow_run webhooks fill in the actual data.
 */
export async function seedHeartbeat(
  db: D1Database,
  params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
    cold_threshold_days?: number
  }
): Promise<void> {
  const branch = params.branch ?? 'main'
  const now = nowIso()
  await db
    .prepare(
      `
      INSERT INTO deploy_heartbeats (
        venture, repo_full_name, workflow_id, branch,
        cold_threshold_days, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(venture, repo_full_name, workflow_id, branch) DO NOTHING
      `
    )
    .bind(
      params.venture,
      params.repo_full_name,
      params.workflow_id,
      branch,
      params.cold_threshold_days ?? 3,
      now,
      now
    )
    .run()
}

/**
 * Set the cold threshold for a heartbeat. Called by the discovery
 * action that reads `config/ventures.json deploy_cold_threshold_days`
 * and applies the per-venture-class default.
 */
export async function setColdThreshold(
  db: D1Database,
  params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
    cold_threshold_days: number
  }
): Promise<void> {
  const branch = params.branch ?? 'main'
  await db
    .prepare(
      `
      UPDATE deploy_heartbeats
      SET cold_threshold_days = ?, updated_at = ?
      WHERE venture = ? AND repo_full_name = ? AND workflow_id = ? AND branch = ?
      `
    )
    .bind(
      params.cold_threshold_days,
      nowIso(),
      params.venture,
      params.repo_full_name,
      params.workflow_id,
      branch
    )
    .run()
}
