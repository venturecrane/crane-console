/**
 * Crane Context Worker - Notifications Data Access Layer
 *
 * CRUD operations for CI/CD notifications from GitHub Actions and Vercel deployments.
 * Handles deduplication, retention filtering, and venture derivation.
 */

import { VENTURE_CONFIG, NOTIFICATION_RETENTION_DAYS } from './constants'
import type { NotificationMatchKeyVersion, NotificationAutoResolveReason } from './types'
import { nowIso, sha256, sizeInBytes, generateNotificationId } from './utils'
import { logNotificationEvent } from './notifications-log'
import { MAX_NOTIFICATION_DETAILS_SIZE } from './constants'

// Re-export from split modules (public API unchanged)
export type { CreateNotificationParams, CreateNotificationResult } from './notifications-write'
export { createNotification } from './notifications-write'

export type { ListNotificationsParams, ListNotificationsResult } from './notifications-query'
export { listNotifications } from './notifications-query'

export { updateNotificationStatus } from './notifications-status'

export type { CountNotificationsParams, NotificationCountsResult } from './notifications-aggregate'
export {
  countUnresolved,
  countNotifications,
  getOldestNotification,
} from './notifications-aggregate'

// ============================================================================
// Venture Derivation
// ============================================================================

/**
 * Derive venture code from a full repo name (org/repo).
 * Matches against VENTURE_CONFIG by org AND repo name.
 */
export function repoToVenture(fullRepo: string): string | null {
  const parts = fullRepo.split('/')
  if (parts.length !== 2) return null
  const [org, name] = parts
  for (const [code, config] of Object.entries(VENTURE_CONFIG)) {
    if (config.org === org && config.repos.includes(name)) return code
  }
  return null
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Compute a dedupe hash for a notification.
 * Combines source, event_type, repo, branch, and a content-specific key.
 */
export async function computeDedupeHash(params: {
  source: string
  event_type: string
  repo: string | null
  branch: string | null
  content_key: string
}): Promise<string> {
  const input = [
    params.source,
    params.event_type,
    params.repo ?? '',
    params.branch ?? '',
    params.content_key,
  ].join('|')
  return sha256(input)
}

// ============================================================================
// Match Key Construction
// ============================================================================

export interface BuildWorkflowRunMatchKeyParams {
  source: 'github'
  kind: 'workflow_run'
  repo_full_name: string
  branch: string
  workflow_id: number
}

export interface BuildCheckSuiteMatchKeyParams {
  source: 'github'
  kind: 'check_suite'
  repo_full_name: string
  branch: string
  app_id: number
}

export interface BuildCheckRunMatchKeyParams {
  source: 'github'
  kind: 'check_run'
  repo_full_name: string
  branch: string
  app_id: number
  name: string
}

/**
 * Inputs needed to compute a match key for a Vercel deployment event.
 *
 * `vercel_team_id` is REQUIRED for cross-team collision safety. Two Vercel
 * projects in different teams can have the same `project_name`. Without
 * team_id, a green deployment in one team would silently auto-resolve a red
 * deployment in another. Pass "no-team" for legacy payloads without team_id.
 */
export interface BuildVercelMatchKeyParams {
  source: 'vercel'
  repo_full_name: string
  branch: string
  vercel_team_id: string
  project_name: string
  target: string
}

export type BuildMatchKeyParams =
  | BuildWorkflowRunMatchKeyParams
  | BuildCheckSuiteMatchKeyParams
  | BuildCheckRunMatchKeyParams
  | BuildVercelMatchKeyParams

/**
 * Construct the canonical v2_id match key for a notification.
 * Uses full owner/repo to prevent cross-org collisions.
 */
export function buildMatchKey(params: BuildMatchKeyParams): {
  match_key: string
  match_key_version: NotificationMatchKeyVersion
} {
  if (params.source === 'github') {
    if (params.kind === 'workflow_run') {
      return {
        match_key: `gh:wf:${params.repo_full_name}:${params.branch}:${params.workflow_id}`,
        match_key_version: 'v2_id',
      }
    }
    if (params.kind === 'check_suite') {
      return {
        match_key: `gh:cs:${params.repo_full_name}:${params.branch}:${params.app_id}`,
        match_key_version: 'v2_id',
      }
    }
    return {
      match_key: `gh:cr:${params.repo_full_name}:${params.branch}:${params.app_id}:${params.name}`,
      match_key_version: 'v2_id',
    }
  }
  return {
    match_key: `vc:dpl:${params.repo_full_name}:${params.branch}:${params.vercel_team_id}:${params.project_name}:${params.target}`,
    match_key_version: 'v2_id',
  }
}

// ============================================================================
// Auto-Resolve (branch-deleted and stale-branch TTL)
// ============================================================================

export interface ResolveByBranchResult {
  resolved_count: number
  matched_ids: string[]
}

/**
 * Resolve every open notification on (repo, branch). Idempotent.
 */
export async function resolveNotificationsByBranch(
  db: D1Database,
  repo: string,
  branch: string,
  reason: NotificationAutoResolveReason
): Promise<ResolveByBranchResult> {
  const now = nowIso()
  const openRows = await db
    .prepare(`SELECT id FROM notifications WHERE status = 'new' AND repo = ? AND branch = ?`)
    .bind(repo, branch)
    .all<{ id: string }>()

  const matched_ids = (openRows.results ?? []).map((r) => r.id)
  if (matched_ids.length === 0) return { resolved_count: 0, matched_ids: [] }

  await db
    .prepare(
      `UPDATE notifications
       SET status = 'resolved', updated_at = ?, resolved_at = ?, auto_resolve_reason = ?
       WHERE status = 'new' AND repo = ? AND branch = ?`
    )
    .bind(now, now, reason, repo, branch)
    .run()

  logNotificationEvent('notifications_resolved_by_branch', {
    repo,
    branch,
    reason,
    count: matched_ids.length,
  })
  return { resolved_count: matched_ids.length, matched_ids }
}

export interface StaleBranchSweepResult {
  resolved_count: number
  cutoff_days: number
}

/**
 * Resolve open notifications on non-protected branches older than N days.
 * Steady state should resolve zero rows; nonzero means something bypassed
 * the protected-branch gate at ingest time.
 */
export async function runStaleBranchSweep(
  db: D1Database,
  cutoffDays = 1
): Promise<StaleBranchSweepResult> {
  const cutoffIso = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString()
  const now = nowIso()
  const result = await db
    .prepare(
      `UPDATE notifications
       SET status = 'resolved', updated_at = ?, resolved_at = ?,
           auto_resolve_reason = 'aged_out_non_main'
       WHERE status = 'new'
         AND branch IS NOT NULL
         AND branch NOT IN ('main', 'master', 'production')
         AND created_at < ?`
    )
    .bind(now, now, cutoffIso)
    .run()

  const resolved_count = result.meta?.changes ?? 0
  if (resolved_count > 0) {
    logNotificationEvent('notifications_stale_branch_sweep_unexpected', {
      cutoff_days: cutoffDays,
      count: resolved_count,
      note: 'expected zero rows in steady state post-protected-branch-gate',
    })
  }
  return { resolved_count, cutoff_days: cutoffDays }
}

/**
 * One-shot drain: resolve all open non-main-branch notifications with no
 * age cutoff. Used post-deploy of the protected-branch gate. Idempotent.
 */
export async function runNonMainCleanup(db: D1Database): Promise<StaleBranchSweepResult> {
  const now = nowIso()
  const result = await db
    .prepare(
      `UPDATE notifications
       SET status = 'resolved', updated_at = ?, resolved_at = ?,
           auto_resolve_reason = 'aged_out_non_main'
       WHERE status = 'new'
         AND branch IS NOT NULL
         AND branch NOT IN ('main', 'master', 'production')`
    )
    .bind(now, now)
    .run()

  const resolved_count = result.meta?.changes ?? 0
  logNotificationEvent('notifications_non_main_cleanup', { count: resolved_count })
  return { resolved_count, cutoff_days: 0 }
}

// ============================================================================
// Auto-Resolve (processGreenEvent)
// ============================================================================

export interface ProcessGreenEventParams {
  source: 'github' | 'vercel'
  event_type: string
  match_key: string
  match_key_version: NotificationMatchKeyVersion
  run_started_at: string
  head_sha: string | null
  is_schedule_like: boolean
  repo: string | null
  branch: string | null
  venture: string | null
  details_json: string
  summary: string
  dedupe_hash: string
  auto_resolve_reason: NotificationAutoResolveReason
  workflow_id?: number | null
  workflow_name?: string | null
  run_id?: number | null
  check_suite_id?: number | null
  check_run_id?: number | null
  app_id?: number | null
  app_name?: string | null
  deployment_id?: string | null
  project_name?: string | null
  target?: string | null
  actor_key_id: string
}

export interface ProcessGreenEventResult {
  green_notification_id: string | null
  resolved_count: number
  matched_ids: string[]
  duplicate: boolean
}

// Normalize undefined → null for D1 bind parameters
function n<T>(v: T | null | undefined): T | null {
  return v ?? null
}

const GREEN_INSERT_SQL = `INSERT OR IGNORE INTO notifications
   (id, source, event_type, severity, status, summary, details_json,
    external_id, dedupe_hash, venture, repo, branch, environment,
    created_at, received_at, updated_at, actor_key_id,
    workflow_id, workflow_name, run_id, head_sha,
    check_suite_id, check_run_id, app_id, app_name,
    deployment_id, project_name, target,
    match_key, match_key_version, run_started_at,
    auto_resolve_reason, resolved_at)
   VALUES (?, ?, ?, 'info', 'resolved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?,
           ?, ?, ?,
           ?, ?)`

function greenInsertBinds(
  greenId: string,
  now: string,
  p: ProcessGreenEventParams
): (string | number | null)[] {
  return [
    greenId,
    p.source,
    p.event_type,
    p.summary,
    p.details_json,
    null,
    p.dedupe_hash,
    p.venture,
    p.repo,
    p.branch,
    null,
    p.run_started_at,
    now,
    now,
    p.actor_key_id,
    n(p.workflow_id),
    n(p.workflow_name),
    n(p.run_id),
    p.head_sha,
    n(p.check_suite_id),
    n(p.check_run_id),
    n(p.app_id),
    n(p.app_name),
    n(p.deployment_id),
    n(p.project_name),
    n(p.target),
    p.match_key,
    p.match_key_version,
    p.run_started_at,
    p.auto_resolve_reason,
    now,
  ]
}

async function fetchResolvedIds(
  db: D1Database,
  matchKey: string,
  greenId: string
): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT id FROM notifications WHERE match_key = ? AND auto_resolved_by_id = ?`)
    .bind(matchKey, greenId)
    .all<{ id: string }>()
  return (rows.results ?? []).map((r) => r.id)
}

/**
 * Process a green CI/CD event: insert a synthetic resolved notification row,
 * then atomically resolve all matching open prior failure notifications.
 *
 * Race safety: the `auto_resolved_by_id IS NULL` predicate in the UPDATE
 * ensures concurrent greens for the same match_key cannot double-resolve.
 * Forward-in-time predicate handles out-of-order webhook delivery.
 * Schedule-like events require same head_sha.
 */
export async function processGreenEvent(
  db: D1Database,
  params: ProcessGreenEventParams
): Promise<ProcessGreenEventResult> {
  if (sizeInBytes(params.details_json) > MAX_NOTIFICATION_DETAILS_SIZE) {
    throw new Error(`details_json exceeds maximum size of ${MAX_NOTIFICATION_DETAILS_SIZE} bytes`)
  }

  const greenId = generateNotificationId()
  const now = nowIso()
  const cutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const insertResult = await db
    .prepare(GREEN_INSERT_SQL)
    .bind(...greenInsertBinds(greenId, now, params))
    .run()

  if (insertResult.meta.changes === 0) {
    logNotificationEvent('green_event_idempotent_skip', {
      match_key: params.match_key,
      run_id: n(params.run_id),
      dedupe_hash: params.dedupe_hash.slice(0, 8),
    })
    return { green_notification_id: null, resolved_count: 0, matched_ids: [], duplicate: true }
  }

  const { sql, binds } = buildResolveQuery(greenId, now, cutoff, params)
  const updateResult = await db
    .prepare(sql)
    .bind(...binds)
    .run()
  const resolvedCount = updateResult.meta.changes ?? 0

  const matchedIds = resolvedCount > 0 ? await fetchResolvedIds(db, params.match_key, greenId) : []

  if (resolvedCount > 0) {
    logNotificationEvent('success_event_received_match', {
      match_key: params.match_key,
      resolved_count: resolvedCount,
      matched_ids: matchedIds,
      run_id: n(params.run_id),
      head_sha: params.head_sha,
    })
  } else {
    logNotificationEvent('success_event_received_no_match', {
      match_key: params.match_key,
      run_id: n(params.run_id),
      head_sha: params.head_sha,
      reason: 'no_open_for_key_or_race_lost',
    })
  }

  return {
    green_notification_id: greenId,
    resolved_count: resolvedCount,
    matched_ids: matchedIds,
    duplicate: false,
  }
}

// buildResolveQuery is declared after processGreenEvent (function hoisting makes it
// callable above). Both branches embed the `auto_resolved_by_id IS NULL` predicate
// so the SQL-invariant test can find at least two occurrences in the post-declaration
// source slice.
function buildResolveQuery(
  greenId: string,
  now: string,
  cutoff: string,
  p: ProcessGreenEventParams
): { sql: string; binds: (string | number | null)[] } {
  if (p.is_schedule_like) {
    return {
      sql: `UPDATE notifications
       SET status = 'resolved', auto_resolved_by_id = ?, auto_resolve_reason = ?,
           resolved_at = ?, updated_at = ?
       WHERE match_key = ? AND status IN ('new', 'acked')
         AND auto_resolved_by_id IS NULL AND created_at > ?
         AND head_sha = ?
         AND (run_started_at IS NULL OR run_started_at <= ?)`,
      binds: [
        greenId,
        p.auto_resolve_reason,
        now,
        now,
        p.match_key,
        cutoff,
        p.head_sha,
        p.run_started_at,
      ],
    }
  }
  return {
    sql: `UPDATE notifications
       SET status = 'resolved', auto_resolved_by_id = ?, auto_resolve_reason = ?,
           resolved_at = ?, updated_at = ?
       WHERE match_key = ? AND status IN ('new', 'acked')
         AND auto_resolved_by_id IS NULL AND created_at > ?
         AND (run_started_at IS NULL OR run_started_at <= ?)`,
    binds: [greenId, p.auto_resolve_reason, now, now, p.match_key, cutoff, p.run_started_at],
  }
}
