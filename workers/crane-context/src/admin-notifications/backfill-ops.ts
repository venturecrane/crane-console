/**
 * D1 helpers for the in-table backfill path.
 *
 * Extracted from runInTableBackfill to keep each function within the 75-line
 * max-lines-per-function ceiling and complexity ≤ 15.
 */

import { logNotificationEvent } from '../notifications-log'
import { nowIso } from '../utils'

export interface OpenFailureRow {
  id: string
  match_key: string
  run_started_at: string | null
  head_sha: string | null
  created_at: string
}

/**
 * Look up the earliest green notification for `matchKey` whose
 * `run_started_at` is at or after `afterRunStartedAt` (or any green when
 * `afterRunStartedAt` is null). Returns null when no match exists.
 */
export async function findMatchingGreen(
  db: D1Database,
  matchKey: string,
  afterRunStartedAt: string | null
): Promise<{ id: string; run_started_at: string | null } | null> {
  if (afterRunStartedAt) {
    return db
      .prepare(
        `SELECT id, run_started_at FROM notifications
         WHERE match_key = ?
           AND status = 'resolved'
           AND auto_resolve_reason LIKE 'green_%'
           AND (run_started_at IS NULL OR run_started_at >= ?)
         ORDER BY run_started_at ASC LIMIT 1`
      )
      .bind(matchKey, afterRunStartedAt)
      .first<{ id: string; run_started_at: string | null }>()
  }
  return db
    .prepare(
      `SELECT id, run_started_at FROM notifications
       WHERE match_key = ?
         AND status = 'resolved'
         AND auto_resolve_reason LIKE 'green_%'
       ORDER BY run_started_at ASC LIMIT 1`
    )
    .bind(matchKey)
    .first<{ id: string; run_started_at: string | null }>()
}

/**
 * Mark `rowId` as resolved via `greenId`. Conditions on
 * `auto_resolved_by_id IS NULL` so concurrent callers are safe.
 *
 * Returns true when the row was actually updated.
 */
export async function applyInTableResolve(
  db: D1Database,
  rowId: string,
  greenId: string,
  now: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE notifications
       SET status = 'resolved',
           auto_resolved_by_id = ?,
           auto_resolve_reason = 'in_table_backfill',
           resolved_at = ?,
           updated_at = ?
       WHERE id = ?
         AND status IN ('new', 'acked')
         AND auto_resolved_by_id IS NULL`
    )
    .bind(greenId, now, now, rowId)
    .run()
  return (result.meta.changes ?? 0) > 0
}

/**
 * Process a single open-failure row: find a matching green and, unless
 * `dry_run`, apply the resolve. Returns `'resolved' | 'no_match'`.
 */
export async function processBackfillRow(
  db: D1Database,
  row: OpenFailureRow,
  dry_run: boolean,
  now: string
): Promise<'resolved' | 'no_match'> {
  const green = await findMatchingGreen(db, row.match_key, row.run_started_at)
  if (!green) {
    return 'no_match'
  }
  if (dry_run) {
    return 'resolved'
  }
  const updated = await applyInTableResolve(db, row.id, green.id, now)
  if (updated) {
    logNotificationEvent('notification_resolved_auto', {
      id: row.id,
      resolved_by_id: green.id,
      match_key: row.match_key,
      reason: 'in_table_backfill',
      prior_status: 'new',
    })
    return 'resolved'
  }
  // Race: another process resolved this row between our SELECT and UPDATE.
  return 'no_match'
}

export { nowIso }
