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
import type { NotificationRecord, NotificationSeverity, NotificationStatus } from './types'
import {
  generateNotificationId,
  nowIso,
  sha256,
  sizeInBytes,
  encodeCursor,
  decodeCursor,
} from './utils'

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
        created_at, received_at, updated_at, actor_key_id)
       VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      params.actor_key_id
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
  await db
    .prepare('UPDATE notifications SET status = ?, updated_at = ? WHERE id = ?')
    .bind(newStatus, now, id)
    .run()

  return { ...current, status: newStatus, updated_at: now }
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
