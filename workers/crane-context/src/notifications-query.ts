/**
 * Crane Context Worker - Notification List Query
 *
 * listNotifications: paginated, filtered notification reads.
 */

import { NOTIFICATION_RETENTION_DAYS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import type { NotificationRecord } from './types'
import { encodeCursor, decodeCursor } from './utils'

// ============================================================================
// Types
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

// ============================================================================
// Public API
// ============================================================================

/**
 * List notifications with filtering and pagination.
 * Automatically applies 30-day retention filter.
 */
export async function listNotifications(
  db: D1Database,
  params: ListNotificationsParams
): Promise<ListNotificationsResult> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
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

  const where = `WHERE ${conditions.join(' AND ')}`
  const sql = `SELECT * FROM notifications ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
  binds.push(limit + 1)

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<NotificationRecord>()
  const notifications = result.results ?? []
  let next_cursor: string | undefined

  if (notifications.length > limit) {
    notifications.pop()
    const last = notifications[notifications.length - 1]
    next_cursor = encodeCursor({ timestamp: last.created_at, id: last.id })
  }

  return { notifications, next_cursor }
}
