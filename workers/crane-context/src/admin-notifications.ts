/**
 * Crane Context Worker - Admin Notifications Data Access Layer
 *
 * Backs the /admin/notifications/* endpoints used by the one-shot backfill
 * CLI in scripts/notifications/backfill-from-github.ts. Three operations:
 *
 *   1. Lock acquisition (notification_locks table) so concurrent backfill
 *      runs from different machines do not stomp on each other.
 *   2. Paginated query of distinct match_keys with at least one open
 *      notification (cursor-based for scalability to 100k+ rows).
 *   3. Single-notification auto-resolve given a GitHub-API-discovered green
 *      run, used to record `auto_resolve_reason='github_api_backfill'`.
 */

import { NOTIFICATION_RETENTION_DAYS, NOTIFICATION_AUTO_RESOLVE_REASONS } from './constants'
import type { NotificationRecord, NotificationAutoResolveReason } from './types'
import { nowIso } from './utils'
import { logNotificationEvent } from './notifications-log'
import {
  lockExpiresAt,
  tryInsertLock,
  fetchLock,
  tryReclaimExpiredLock,
  extendLock,
  buildAcquiredResponse,
} from './admin-notifications/lock-ops'
import {
  insertGreenRow,
  resolveGreenId,
  updateResolvedStatus,
} from './admin-notifications/resolve-ops'
import { processBackfillRow } from './admin-notifications/backfill-ops'
import type { OpenFailureRow } from './admin-notifications/backfill-ops'

// ============================================================================
// Types
// ============================================================================

export interface NotificationLockRecord {
  name: string
  holder: string
  acquired_at: string
  expires_at: string
  metadata_json: string | null
}

export interface PendingMatch {
  match_key: string
  match_key_version: string | null
  repo: string | null
  branch: string | null
  workflow_id: number | null
  workflow_name: string | null
  oldest_open_created_at: string
  count: number
}

export interface PendingMatchesResult {
  matches: PendingMatch[]
  next_cursor: string | null
}

export interface AdminAutoResolveParams {
  matched_run_id: number | string
  matched_run_url: string
  matched_run_started_at: string
  reason: NotificationAutoResolveReason
}

// ============================================================================
// Lock acquisition (notification_locks table)
// ============================================================================

/**
 * Acquire a notification lock. Returns the lock record on success, or
 * the existing holder's record on contention.
 *
 * The lock has a TTL: if `expires_at` has passed, the next acquirer can
 * claim it. Idempotent re-acquisition by the same holder extends the TTL.
 */
export async function acquireNotificationLock(
  db: D1Database,
  params: {
    name: string
    holder: string
    ttl_seconds: number
    metadata_json?: string
  }
): Promise<{ acquired: boolean; lock: NotificationLockRecord | null; reason?: string }> {
  const now = nowIso()
  const expiresAt = lockExpiresAt(params.ttl_seconds)

  const inserted = await tryInsertLock(db, params, now, expiresAt)
  if (inserted) {
    return buildAcquiredResponse(params, now, expiresAt)
  }

  // Someone else holds it. Inspect the existing lock.
  const existing = await fetchLock(db, params.name)
  if (!existing) {
    // Race: lock was deleted between INSERT and SELECT. Retry once.
    return acquireNotificationLock(db, params)
  }

  // If expired, reclaim it.
  if (existing.expires_at < now) {
    const reclaimed = await tryReclaimExpiredLock(db, params, now, expiresAt, existing.expires_at)
    if (reclaimed) {
      return buildAcquiredResponse(params, now, expiresAt)
    }
    // Lost the race to reclaim — fall through to contention response.
  }

  // Idempotent re-acquisition by the same holder: extend the TTL.
  if (existing.holder === params.holder) {
    await extendLock(db, params, expiresAt, existing)
    return { acquired: true, lock: { ...existing, expires_at: expiresAt } }
  }

  return {
    acquired: false,
    lock: existing,
    reason: `lock held by ${existing.holder} until ${existing.expires_at}`,
  }
}

/**
 * Release a notification lock. Only the current holder can release.
 * Returns true if the lock was released, false otherwise.
 */
export async function releaseNotificationLock(
  db: D1Database,
  params: { name: string; holder: string }
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM notification_locks WHERE name = ? AND holder = ?')
    .bind(params.name, params.holder)
    .run()
  return (result.meta.changes ?? 0) > 0
}

// ============================================================================
// Pending matches (paginated)
// ============================================================================

/** Decode an opaque pagination cursor into (createdAt, secondaryKey) parts. */
function decodeCursor(cursor: string): { createdAt: string; secondaryKey: string } | null {
  try {
    const decoded = atob(cursor)
    const sep = decoded.indexOf('|')
    if (sep > 0) {
      return { createdAt: decoded.substring(0, sep), secondaryKey: decoded.substring(sep + 1) }
    }
  } catch {
    // Invalid cursor - start from beginning
  }
  return null
}

/** Build the WHERE conditions and binds for a paginated open-notifications query. */
function buildOpenConditions(
  retentionCutoff: string,
  cursor: { createdAt: string; secondaryKey: string } | null,
  cursorMatchField: string
): { conditions: string[]; binds: (string | number)[] } {
  const conditions: string[] = [
    "status IN ('new', 'acked')",
    'match_key IS NOT NULL',
    'created_at > ?',
  ]
  const binds: (string | number)[] = [retentionCutoff]

  if (cursor) {
    conditions.push(`(created_at > ? OR (created_at = ? AND ${cursorMatchField} > ?))`)
    binds.push(cursor.createdAt, cursor.createdAt, cursor.secondaryKey)
  }

  return { conditions, binds }
}

/**
 * List distinct match_keys with at least one open notification, paginated
 * via opaque cursor. Default limit: 100. Max limit: 500.
 */
export async function listPendingMatches(
  db: D1Database,
  params: { cursor?: string; limit?: number }
): Promise<PendingMatchesResult> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500)
  const retentionCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const cursor = params.cursor ? decodeCursor(params.cursor) : null
  const { conditions, binds } = buildOpenConditions(retentionCutoff, cursor, 'match_key')

  const sql = `
    SELECT
      match_key,
      MAX(match_key_version) AS match_key_version,
      MAX(repo) AS repo,
      MAX(branch) AS branch,
      MAX(workflow_id) AS workflow_id,
      MAX(workflow_name) AS workflow_name,
      MIN(created_at) AS oldest_open_created_at,
      COUNT(*) AS count
    FROM notifications
    WHERE ${conditions.join(' AND ')}
    GROUP BY match_key
    ORDER BY oldest_open_created_at ASC, match_key ASC
    LIMIT ?
  `
  binds.push(limit + 1)

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<{
      match_key: string
      match_key_version: string | null
      repo: string | null
      branch: string | null
      workflow_id: number | null
      workflow_name: string | null
      oldest_open_created_at: string
      count: number
    }>()

  const rows = result.results || []
  let nextCursor: string | null = null
  if (rows.length > limit) {
    rows.pop()
    const last = rows[rows.length - 1]
    nextCursor = btoa(`${last.oldest_open_created_at}|${last.match_key}`)
  }

  return { matches: rows, next_cursor: nextCursor }
}

// ============================================================================
// Admin auto-resolve (single notification, by id)
// ============================================================================

/**
 * Resolve a single notification via the admin path, recording the
 * GitHub-API-discovered green run details. Idempotent: if already resolved,
 * returns `{ already_resolved: true }`.
 */
export async function adminAutoResolveNotification(
  db: D1Database,
  params: {
    notification_id: string
    matched_run_id: number | string
    matched_run_url: string
    matched_run_started_at: string
    reason: NotificationAutoResolveReason
    actor_key_id: string
  }
): Promise<{
  ok: boolean
  already_resolved: boolean
  resolved_id?: string
  green_notification_id?: string
  reason?: string
}> {
  if (!NOTIFICATION_AUTO_RESOLVE_REASONS.includes(params.reason)) {
    return { ok: false, already_resolved: false, reason: `invalid reason: ${params.reason}` }
  }

  const target = await db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .bind(params.notification_id)
    .first<NotificationRecord>()

  if (!target) {
    return { ok: false, already_resolved: false, reason: 'notification not found' }
  }

  if (target.status === 'resolved') {
    return { ok: true, already_resolved: true }
  }

  if (!target.match_key) {
    return {
      ok: false,
      already_resolved: false,
      reason: 'notification has no match_key (not eligible for auto-resolve)',
    }
  }

  return resolveWithGreenRow(db, target, params)
}

/** Insert green row, find its id, then update the target. */
async function resolveWithGreenRow(
  db: D1Database,
  target: NotificationRecord,
  params: {
    notification_id: string
    matched_run_id: number | string
    matched_run_url: string
    matched_run_started_at: string
    reason: NotificationAutoResolveReason
    actor_key_id: string
  }
): Promise<{
  ok: boolean
  already_resolved: boolean
  resolved_id?: string
  green_notification_id?: string
  reason?: string
}> {
  const now = nowIso()
  const { greenId, greenDedupe, changes } = await insertGreenRow(db, { target, ...params })

  let greenIdToUse = greenId
  if (changes === 0) {
    greenIdToUse = await resolveGreenId(db, greenDedupe, greenId)
  }

  const updated = await updateResolvedStatus(
    db,
    params.notification_id,
    greenIdToUse,
    params.reason,
    now
  )
  if (updated > 0) {
    logNotificationEvent('notification_resolved_auto', {
      id: params.notification_id,
      resolved_by_id: greenIdToUse,
      match_key: target.match_key,
      reason: params.reason,
      prior_status: target.status,
    })
    return {
      ok: true,
      already_resolved: false,
      resolved_id: params.notification_id,
      green_notification_id: greenIdToUse,
    }
  }

  // Race: someone else resolved it between our SELECT and UPDATE.
  return { ok: true, already_resolved: true }
}

// ============================================================================
// In-table-data backfill (no GitHub API)
// ============================================================================

export interface InTableBackfillParams {
  dry_run: boolean
  max_rows?: number
  cursor?: string
  venture?: string
}

export interface InTableBackfillResult {
  processed: number
  resolved: number
  no_match: number
  next_cursor: string | null
  dry_run: boolean
}

/** Fetch a page of open notifications with match_keys for in-table backfill. */
async function fetchBackfillPage(
  db: D1Database,
  retentionCutoff: string,
  maxRows: number,
  cursor: { createdAt: string; secondaryKey: string } | null,
  venture: string | undefined
): Promise<{ rows: OpenFailureRow[]; nextCursor: string | null }> {
  const { conditions, binds } = buildOpenConditions(retentionCutoff, cursor, 'id')

  if (venture) {
    conditions.push('venture = ?')
    binds.push(venture)
  }

  const sql = `SELECT id, match_key, run_started_at, head_sha, created_at
               FROM notifications
               WHERE ${conditions.join(' AND ')}
               ORDER BY created_at ASC, id ASC
               LIMIT ?`
  binds.push(maxRows + 1)

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<OpenFailureRow>()

  const rows = result.results || []
  let nextCursor: string | null = null
  if (rows.length > maxRows) {
    rows.pop()
    const last = rows[rows.length - 1]
    nextCursor = btoa(`${last.created_at}|${last.id}`)
  }

  return { rows, nextCursor }
}

/**
 * Walk open notifications and auto-resolve them using green rows already in
 * the notifications table. Bounded to `max_rows` per call, cursor-paginated.
 */
export async function runInTableBackfill(
  db: D1Database,
  params: InTableBackfillParams
): Promise<InTableBackfillResult> {
  const maxRows = Math.min(Math.max(params.max_rows ?? 1000, 1), 5000)
  const retentionCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()
  const cursor = params.cursor ? decodeCursor(params.cursor) : null
  const now = nowIso()

  const { rows, nextCursor } = await fetchBackfillPage(
    db,
    retentionCutoff,
    maxRows,
    cursor,
    params.venture
  )

  let resolved = 0
  let noMatch = 0

  for (const row of rows) {
    const outcome = await processBackfillRow(db, row, params.dry_run, now)
    if (outcome === 'resolved') {
      resolved++
    } else {
      noMatch++
    }
  }

  return {
    processed: rows.length,
    resolved,
    no_match: noMatch,
    next_cursor: nextCursor,
    dry_run: params.dry_run,
  }
}
