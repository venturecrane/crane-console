/**
 * Crane Context Worker - Notifications Data Access Layer
 *
 * CRUD operations for CI/CD notifications from GitHub Actions and Vercel deployments.
 * Handles deduplication, retention filtering, and venture derivation.
 */

import {
  VENTURE_CONFIG,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATION_STATUSES,
  MAX_NOTIFICATION_DETAILS_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'
import type {
  NotificationRecord,
  NotificationSeverity,
  NotificationStatus,
  NotificationMatchKeyVersion,
  NotificationAutoResolveReason,
} from './types'
import {
  generateNotificationId,
  nowIso,
  sha256,
  sizeInBytes,
  encodeCursor,
  decodeCursor,
} from './utils'
import { logNotificationEvent } from './notifications-log'

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
    params.repo || '',
    params.branch || '',
    params.content_key,
  ].join('|')
  return sha256(input)
}

// ============================================================================
// Match Key Construction
// ============================================================================

/**
 * Inputs needed to compute a v2_id (numeric workflow_id) match key for a
 * GitHub workflow_run event.
 */
export interface BuildWorkflowRunMatchKeyParams {
  source: 'github'
  kind: 'workflow_run'
  repo_full_name: string // owner/repo - never bare repo name
  branch: string
  workflow_id: number
}

/**
 * Inputs needed to compute a v2_id match key for a GitHub check_suite event.
 */
export interface BuildCheckSuiteMatchKeyParams {
  source: 'github'
  kind: 'check_suite'
  repo_full_name: string
  branch: string
  app_id: number
}

/**
 * Inputs needed to compute a v2_id match key for a GitHub check_run event.
 */
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
 * projects in different teams can have the same `project_name` (operators
 * routinely call sites "marketing-site" or "console"). Without team_id in
 * the match key, a green deployment in one team would silently auto-resolve
 * a red deployment in another - the same class of cross-org collision bug
 * the GitHub match keys protect against via `owner/repo`.
 *
 * For Vercel events that arrive without a team_id (legacy webhook payloads
 * or single-team setups), pass the literal string "no-team" so the slot
 * is still occupied and the format remains unambiguous.
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
 *
 * The match key is the unique identifier the auto-resolver uses to find
 * prior failure notifications matching a green event. It uses the FULL
 * owner/repo (never the bare repo name) to prevent cross-org collisions:
 * a green from venturecrane/console must NOT auto-resolve a red from
 * siliconcrane/console.
 *
 * Returns the match key string and version marker. Version is always
 * 'v2_id' for new code; the legacy 'v1_name' format is only produced by
 * the migration 0023 backfill.
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
    // check_run
    return {
      match_key: `gh:cr:${params.repo_full_name}:${params.branch}:${params.app_id}:${params.name}`,
      match_key_version: 'v2_id',
    }
  }
  // vercel - includes vercel_team_id to prevent cross-team collision
  return {
    match_key: `vc:dpl:${params.repo_full_name}:${params.branch}:${params.vercel_team_id}:${params.project_name}:${params.target}`,
    match_key_version: 'v2_id',
  }
}

// ============================================================================
// Create
// ============================================================================

export interface CreateNotificationParams {
  source: string
  event_type: string
  severity: NotificationSeverity
  summary: string
  details_json: string
  external_id?: string
  dedupe_hash: string
  venture?: string | null
  repo?: string | null
  branch?: string | null
  environment?: string | null
  created_at?: string
  actor_key_id: string

  // Match-key fields (PR A2). Optional for backward compatibility with
  // call sites that haven't been updated yet, but new failure normalizers
  // populate them so subsequent green events can match.
  workflow_id?: number | null
  workflow_name?: string | null
  run_id?: number | null
  head_sha?: string | null
  check_suite_id?: number | null
  check_run_id?: number | null
  app_id?: number | null
  app_name?: string | null
  deployment_id?: string | null
  project_name?: string | null
  target?: string | null
  match_key?: string | null
  match_key_version?: NotificationMatchKeyVersion | null
  run_started_at?: string | null
}

export interface CreateNotificationResult {
  notification?: NotificationRecord
  duplicate: boolean
}

/**
 * Insert a notification, silently ignoring duplicates (INSERT OR IGNORE on dedupe_hash).
 */
export async function createNotification(
  db: D1Database,
  params: CreateNotificationParams
): Promise<CreateNotificationResult> {
  // Validate details_json size
  if (sizeInBytes(params.details_json) > MAX_NOTIFICATION_DETAILS_SIZE) {
    throw new Error(`details_json exceeds maximum size of ${MAX_NOTIFICATION_DETAILS_SIZE} bytes`)
  }

  const id = generateNotificationId()
  const now = nowIso()
  const createdAt = params.created_at || now

  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications
       (id, source, event_type, severity, status, summary, details_json,
        external_id, dedupe_hash, venture, repo, branch, environment,
        created_at, received_at, updated_at, actor_key_id,
        workflow_id, workflow_name, run_id, head_sha,
        check_suite_id, check_run_id, app_id, app_name,
        deployment_id, project_name, target,
        match_key, match_key_version, run_started_at)
       VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?)`
    )
    .bind(
      id,
      params.source,
      params.event_type,
      params.severity,
      params.summary,
      params.details_json,
      params.external_id || null,
      params.dedupe_hash,
      params.venture || null,
      params.repo || null,
      params.branch || null,
      params.environment || null,
      createdAt,
      now,
      now,
      params.actor_key_id,
      params.workflow_id ?? null,
      params.workflow_name ?? null,
      params.run_id ?? null,
      params.head_sha ?? null,
      params.check_suite_id ?? null,
      params.check_run_id ?? null,
      params.app_id ?? null,
      params.app_name ?? null,
      params.deployment_id ?? null,
      params.project_name ?? null,
      params.target ?? null,
      params.match_key ?? null,
      params.match_key_version ?? null,
      params.run_started_at ?? null
    )
    .run()

  // If no rows changed, it was a duplicate (dedupe_hash already existed)
  if (result.meta.changes === 0) {
    return { duplicate: true }
  }

  // Fetch the created record
  const record = await db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .bind(id)
    .first<NotificationRecord>()

  if (record) {
    logNotificationEvent('notification_created', {
      id: record.id,
      source: record.source,
      severity: record.severity,
      match_key: record.match_key,
      repo: record.repo,
      branch: record.branch,
      workflow_id: record.workflow_id,
      dedupe_hash: record.dedupe_hash.slice(0, 8),
    })
  }

  return { notification: record || undefined, duplicate: false }
}

// ============================================================================
// List / Query
// ============================================================================

export interface ListNotificationsParams {
  status?: string
  severity?: string
  venture?: string
  repo?: string
  source?: string
  limit?: number
  cursor?: string
}

export interface ListNotificationsResult {
  notifications: NotificationRecord[]
  next_cursor?: string
}

/**
 * List notifications with filtering and pagination.
 * Automatically applies 30-day retention filter.
 */
export async function listNotifications(
  db: D1Database,
  params: ListNotificationsParams
): Promise<ListNotificationsResult> {
  const limit = Math.min(params.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const retentionCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const conditions: string[] = ['created_at > ?']
  const binds: (string | number)[] = [retentionCutoff]

  if (params.status) {
    conditions.push('status = ?')
    binds.push(params.status)
  }
  if (params.severity) {
    conditions.push('severity = ?')
    binds.push(params.severity)
  }
  if (params.venture) {
    conditions.push('venture = ?')
    binds.push(params.venture)
  }
  if (params.repo) {
    conditions.push('repo = ?')
    binds.push(params.repo)
  }
  if (params.source) {
    conditions.push('source = ?')
    binds.push(params.source)
  }

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor)
    conditions.push('(created_at < ? OR (created_at = ? AND id < ?))')
    binds.push(decoded.timestamp, decoded.timestamp, decoded.id)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `SELECT * FROM notifications ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
  binds.push(limit + 1)

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<NotificationRecord>()

  const notifications = result.results || []
  let next_cursor: string | undefined

  if (notifications.length > limit) {
    notifications.pop()
    const last = notifications[notifications.length - 1]
    next_cursor = encodeCursor({ timestamp: last.created_at, id: last.id })
  }

  return { notifications, next_cursor }
}

// ============================================================================
// Update Status
// ============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['acked', 'resolved'],
  acked: ['resolved'],
  resolved: [],
}

/**
 * Update a notification's status with validated state transitions.
 *
 * When transitioning to 'resolved', also stamps `resolved_at` and sets
 * `auto_resolve_reason = 'manual'` so the audit trail distinguishes
 * operator-initiated resolutions from auto-resolves.
 */
export async function updateNotificationStatus(
  db: D1Database,
  id: string,
  newStatus: NotificationStatus
): Promise<NotificationRecord | null> {
  // Validate status value
  if (!NOTIFICATION_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`)
  }

  // Get current record
  const current = await db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .bind(id)
    .first<NotificationRecord>()

  if (!current) return null

  // Validate state transition
  const allowed = VALID_TRANSITIONS[current.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid state transition: ${current.status} -> ${newStatus}. Allowed: ${(allowed || []).join(', ') || 'none'}`
    )
  }

  const now = nowIso()
  if (newStatus === 'resolved') {
    await db
      .prepare(
        `UPDATE notifications
         SET status = ?, updated_at = ?, resolved_at = ?, auto_resolve_reason = 'manual'
         WHERE id = ?`
      )
      .bind(newStatus, now, now, id)
      .run()
    logNotificationEvent('notification_resolved_manual', {
      id,
      prior_status: current.status,
    })
    return {
      ...current,
      status: newStatus,
      updated_at: now,
      resolved_at: now,
      auto_resolve_reason: 'manual',
    }
  }

  await db
    .prepare('UPDATE notifications SET status = ?, updated_at = ? WHERE id = ?')
    .bind(newStatus, now, id)
    .run()

  return { ...current, status: newStatus, updated_at: now }
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
  // Structural identifiers (carried through to the synthetic green row)
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
  duplicate: boolean // true if this exact green was already processed
}

/**
 * Process a green CI/CD event: insert a synthetic resolved notification row,
 * then atomically resolve all matching open prior failure notifications.
 *
 * Concurrency model (race-safe under any D1 isolation level):
 *
 *   1. INSERT OR IGNORE the green row first. The dedupe_hash UNIQUE
 *      constraint makes this idempotent: a duplicate webhook delivery
 *      results in the second insert being a no-op.
 *
 *   2. UPDATE all open notifications matching this match_key, with the
 *      idempotent predicate `WHERE auto_resolved_by_id IS NULL`. Two
 *      concurrent greens for the same match_key (different run_ids) both
 *      INSERT successfully (different dedupe_hashes), but only the first
 *      UPDATE acquires the rows by setting `auto_resolved_by_id`. The
 *      second UPDATE finds zero matching rows (the predicate fails). No
 *      double-resolution. No corrupted history.
 *
 *   3. Forward-in-time predicate: only resolve notifications whose
 *      `run_started_at` is older than (or NULL, for legacy rows) the
 *      green's `run_started_at`. Handles out-of-order webhook delivery.
 *
 *   4. Schedule-like events (cron, repository_dispatch) require same SHA:
 *      a nightly cron success the day after a nightly cron failure does
 *      NOT prove the underlying issue was fixed. Only re-running the same
 *      commit and getting green proves it.
 *
 *   5. Retention guard: never resolve notifications older than the
 *      retention window (30 days). They will fall out of the read filter
 *      anyway and there is no value in updating them.
 *
 * Returns the green notification id (if successfully inserted), the count
 * and ids of resolved prior notifications, and a `duplicate` flag if the
 * exact green event was already processed.
 */
export async function processGreenEvent(
  db: D1Database,
  params: ProcessGreenEventParams
): Promise<ProcessGreenEventResult> {
  // Validate details size
  if (sizeInBytes(params.details_json) > MAX_NOTIFICATION_DETAILS_SIZE) {
    throw new Error(`details_json exceeds maximum size of ${MAX_NOTIFICATION_DETAILS_SIZE} bytes`)
  }

  const greenId = generateNotificationId()
  const now = nowIso()
  const retentionCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Step 1: INSERT the green notification row (idempotent via dedupe_hash UNIQUE).
  const insertResult = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications
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
    )
    .bind(
      greenId,
      params.source,
      params.event_type,
      params.summary,
      params.details_json,
      null, // external_id
      params.dedupe_hash,
      params.venture,
      params.repo,
      params.branch,
      null, // environment - greens are not env-specific in the same way as failures
      params.run_started_at,
      now,
      now,
      params.actor_key_id,
      params.workflow_id ?? null,
      params.workflow_name ?? null,
      params.run_id ?? null,
      params.head_sha,
      params.check_suite_id ?? null,
      params.check_run_id ?? null,
      params.app_id ?? null,
      params.app_name ?? null,
      params.deployment_id ?? null,
      params.project_name ?? null,
      params.target ?? null,
      params.match_key,
      params.match_key_version,
      params.run_started_at,
      params.auto_resolve_reason,
      now
    )
    .run()

  if (insertResult.meta.changes === 0) {
    // Duplicate green delivery. Don't double-process.
    logNotificationEvent('green_event_idempotent_skip', {
      match_key: params.match_key,
      run_id: params.run_id ?? null,
      dedupe_hash: params.dedupe_hash.slice(0, 8),
    })
    return {
      green_notification_id: null,
      resolved_count: 0,
      matched_ids: [],
      duplicate: true,
    }
  }

  // Step 2: UPDATE matching open notifications. Idempotent via the
  // `auto_resolved_by_id IS NULL` predicate (race-safe across concurrent
  // greens for the same match_key).
  let updateSql: string
  let updateBinds: (string | number | null)[]

  if (params.is_schedule_like) {
    // Schedule-like events require same head_sha.
    updateSql = `UPDATE notifications
       SET status = 'resolved',
           auto_resolved_by_id = ?,
           auto_resolve_reason = ?,
           resolved_at = ?,
           updated_at = ?
       WHERE match_key = ?
         AND status IN ('new', 'acked')
         AND auto_resolved_by_id IS NULL
         AND created_at > ?
         AND head_sha = ?
         AND (run_started_at IS NULL OR run_started_at <= ?)`
    updateBinds = [
      greenId,
      params.auto_resolve_reason,
      now,
      now,
      params.match_key,
      retentionCutoff,
      params.head_sha,
      params.run_started_at,
    ]
  } else {
    // Normal events: forward-in-time predicate, any SHA on the same branch.
    updateSql = `UPDATE notifications
       SET status = 'resolved',
           auto_resolved_by_id = ?,
           auto_resolve_reason = ?,
           resolved_at = ?,
           updated_at = ?
       WHERE match_key = ?
         AND status IN ('new', 'acked')
         AND auto_resolved_by_id IS NULL
         AND created_at > ?
         AND (run_started_at IS NULL OR run_started_at <= ?)`
    updateBinds = [
      greenId,
      params.auto_resolve_reason,
      now,
      now,
      params.match_key,
      retentionCutoff,
      params.run_started_at,
    ]
  }

  const updateResult = await db
    .prepare(updateSql)
    .bind(...updateBinds)
    .run()

  const resolvedCount = updateResult.meta.changes || 0

  // Fetch the matched ids for the audit trail (small set, this query is fine).
  let matchedIds: string[] = []
  if (resolvedCount > 0) {
    const matchedRows = await db
      .prepare(
        `SELECT id FROM notifications
         WHERE match_key = ? AND auto_resolved_by_id = ?`
      )
      .bind(params.match_key, greenId)
      .all<{ id: string }>()
    matchedIds = (matchedRows.results || []).map((r) => r.id)
  }

  if (resolvedCount > 0) {
    logNotificationEvent('success_event_received_match', {
      match_key: params.match_key,
      resolved_count: resolvedCount,
      matched_ids: matchedIds,
      run_id: params.run_id ?? null,
      head_sha: params.head_sha,
    })
  } else {
    logNotificationEvent('success_event_received_no_match', {
      match_key: params.match_key,
      run_id: params.run_id ?? null,
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

// ============================================================================
// Aggregates
// ============================================================================

/**
 * Count unresolved (new + acked) notifications, optionally filtered by venture.
 */
export async function countUnresolved(
  db: D1Database,
  venture?: string
): Promise<{ total: number; critical: number; warning: number }> {
  const retentionCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  let sql = `SELECT severity, COUNT(*) as count FROM notifications
    WHERE status IN ('new', 'acked') AND created_at > ?`
  const binds: string[] = [retentionCutoff]

  if (venture) {
    sql += ' AND venture = ?'
    binds.push(venture)
  }

  sql += ' GROUP BY severity'

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<{ severity: string; count: number }>()

  const counts = { total: 0, critical: 0, warning: 0 }
  for (const row of result.results || []) {
    counts.total += row.count
    if (row.severity === 'critical') counts.critical = row.count
    if (row.severity === 'warning') counts.warning = row.count
  }

  return counts
}
