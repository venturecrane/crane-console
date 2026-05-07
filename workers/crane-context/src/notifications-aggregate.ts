/**
 * Crane Context Worker - Notification Aggregate Queries
 *
 * countUnresolved, countNotifications, getOldestNotification.
 */

import { NOTIFICATION_RETENTION_DAYS } from './constants'
import type { NotificationRecord } from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * Truthful count of notifications matching a filter, broken down by status
 * and severity. The SOS uses this to display "270 alerts (12 critical, 45 warning)"
 * instead of `${notifications.length}` from a paginated slice.
 *
 * Plan §B.3: this is the missing endpoint that fixes the loudest defect
 * (defect #1 — SOS displaying "10 unresolved" when DB has 270).
 */
export interface CountNotificationsParams {
  status?: string
  severity?: string
  venture?: string
  repo?: string
  source?: string
  /**
   * When 'venture', the response includes a `by_venture` map keyed by
   * venture code. Rows where venture IS NULL are excluded from the map
   * but still count toward the top-level `total`, so the invariant is
   * `Σ by_venture[v].total ≤ total`.
   */
  group_by?: 'venture'
}

export interface NotificationCountsResult {
  total: number
  by_severity: {
    critical: number
    warning: number
    info: number
  }
  by_status: {
    new: number
    acked: number
    resolved: number
  }
  by_venture?: Record<string, { critical: number; warning: number; info: number; total: number }>
  window: {
    retention_days: number
    filters: CountNotificationsParams
  }
}

// ============================================================================
// Helpers
// ============================================================================

function retentionCutoff(): string {
  return new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

function buildFilterConditions(
  params: Pick<CountNotificationsParams, 'status' | 'severity' | 'venture' | 'repo' | 'source'>,
  initialConditions: string[],
  initialBinds: (string | number)[]
): { conditions: string[]; binds: (string | number)[] } {
  const conditions = [...initialConditions]
  const binds: (string | number)[] = [...initialBinds]
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
  return { conditions, binds }
}

type SeverityBucket = { critical: number; warning: number; info: number; total: number }

function tallySeverityRows(rows: { severity: string; count: number }[]): {
  total: number
  by_severity: { critical: number; warning: number; info: number }
} {
  const by_severity = { critical: 0, warning: 0, info: 0 }
  let total = 0
  for (const row of rows) {
    total += row.count
    if (row.severity === 'critical') by_severity.critical = row.count
    else if (row.severity === 'warning') by_severity.warning = row.count
    else if (row.severity === 'info') by_severity.info = row.count
  }
  return { total, by_severity }
}

function tallyStatusRows(rows: { status: string; count: number }[]): {
  new: number
  acked: number
  resolved: number
} {
  const by_status = { new: 0, acked: 0, resolved: 0 }
  for (const row of rows) {
    if (row.status === 'new') by_status.new = row.count
    else if (row.status === 'acked') by_status.acked = row.count
    else if (row.status === 'resolved') by_status.resolved = row.count
  }
  return by_status
}

function tallyVentureRows(
  rows: { venture: string; severity: string; count: number }[]
): Record<string, SeverityBucket> {
  const by_venture: Record<string, SeverityBucket> = {}
  for (const row of rows) {
    const v = row.venture
    const bucket: SeverityBucket = by_venture[v] ?? { critical: 0, warning: 0, info: 0, total: 0 }
    if (row.severity === 'critical') bucket.critical = row.count
    else if (row.severity === 'warning') bucket.warning = row.count
    else if (row.severity === 'info') bucket.info = row.count
    bucket.total = bucket.critical + bucket.warning + bucket.info
    by_venture[v] = bucket
  }
  return by_venture
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Count unresolved (new + acked) notifications, optionally filtered by venture.
 */
export async function countUnresolved(
  db: D1Database,
  venture?: string
): Promise<{ total: number; critical: number; warning: number }> {
  const cutoff = retentionCutoff()
  let sql = `SELECT severity, COUNT(*) as count FROM notifications
    WHERE status IN ('new', 'acked') AND created_at > ?`
  const binds: string[] = [cutoff]

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
  for (const row of result.results ?? []) {
    counts.total += row.count
    if (row.severity === 'critical') counts.critical = row.count
    if (row.severity === 'warning') counts.warning = row.count
  }
  return counts
}

export async function countNotifications(
  db: D1Database,
  params: CountNotificationsParams
): Promise<NotificationCountsResult> {
  const cutoff = retentionCutoff()
  const { conditions, binds } = buildFilterConditions(params, ['created_at > ?'], [cutoff])
  const where = `WHERE ${conditions.join(' AND ')}`

  const severitySql = `SELECT severity, COUNT(*) as count FROM notifications ${where} GROUP BY severity`
  const statusSql = `SELECT status, COUNT(*) as count FROM notifications ${where} GROUP BY status`
  const ventureSql = `SELECT venture, severity, COUNT(*) as count FROM notifications ${where} AND venture IS NOT NULL GROUP BY venture, severity`

  const wantVenture = params.group_by === 'venture'

  const [sevResult, statusResult, ventureResult] = await Promise.all([
    db
      .prepare(severitySql)
      .bind(...binds)
      .all<{ severity: string; count: number }>(),
    db
      .prepare(statusSql)
      .bind(...binds)
      .all<{ status: string; count: number }>(),
    wantVenture
      ? db
          .prepare(ventureSql)
          .bind(...binds)
          .all<{ venture: string; severity: string; count: number }>()
      : Promise.resolve(null),
  ])

  const { total, by_severity } = tallySeverityRows(sevResult.results ?? [])
  const by_status = tallyStatusRows(statusResult.results ?? [])
  const by_venture = ventureResult ? tallyVentureRows(ventureResult.results ?? []) : undefined

  return {
    total,
    by_severity,
    by_status,
    ...(by_venture !== undefined ? { by_venture } : {}),
    window: { retention_days: NOTIFICATION_RETENTION_DAYS, filters: params },
  }
}

/**
 * Get the oldest notification matching a filter. Used by the
 * notification-retention-window health check (plan §B.7) to verify the
 * retention filter is actually working: if the oldest open notification
 * is older than NOTIFICATION_RETENTION_DAYS, something is broken.
 */
export async function getOldestNotification(
  db: D1Database,
  params: CountNotificationsParams
): Promise<NotificationRecord | null> {
  const { conditions, binds } = buildFilterConditions(params, [], [])
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT * FROM notifications ${where} ORDER BY created_at ASC LIMIT 1`
  return db
    .prepare(sql)
    .bind(...binds)
    .first<NotificationRecord>()
}
