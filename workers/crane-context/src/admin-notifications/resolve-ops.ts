/**
 * D1 helpers for the admin auto-resolve path.
 *
 * Extracted from adminAutoResolveNotification to keep each function within
 * the 75-line max-lines-per-function ceiling.
 */

import type { NotificationAutoResolveReason } from '../types'
import type { NotificationRecord } from '../types'
import { generateNotificationId, nowIso, sha256 } from '../utils'

export interface GreenInsertParams {
  target: NotificationRecord
  matched_run_id: number | string
  matched_run_url: string
  matched_run_started_at: string
  reason: NotificationAutoResolveReason
  actor_key_id: string
}

/**
 * Insert the synthetic green notification row that records the GitHub-API
 * metadata for audit purposes. Idempotent via dedupe_hash UNIQUE constraint.
 *
 * Returns `{ greenId, greenDedupe, changes }` where `changes` is 0 on
 * duplicate (existing row already present) and 1 on fresh insert.
 */
export async function insertGreenRow(
  db: D1Database,
  params: GreenInsertParams
): Promise<{ greenId: string; greenDedupe: string; changes: number }> {
  const { target, matched_run_id, matched_run_url, matched_run_started_at, reason, actor_key_id } =
    params
  const greenId = generateNotificationId()
  const now = nowIso()
  const greenDedupeInput = `github|workflow_run.success|${target.repo ?? ''}|${target.branch ?? ''}|backfill:${matched_run_id}`
  const greenDedupe = await sha256(greenDedupeInput)

  const greenDetails = JSON.stringify({
    matched_run_id,
    matched_run_url,
    matched_run_started_at,
    source: 'github_api_backfill',
  })

  const insertResult = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications
       (id, source, event_type, severity, status, summary, details_json,
        external_id, dedupe_hash, venture, repo, branch, environment,
        created_at, received_at, updated_at, actor_key_id,
        match_key, match_key_version, run_started_at,
        auto_resolve_reason, resolved_at)
       VALUES (?, ?, ?, 'info', 'resolved', ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?,
               ?, ?, ?, ?, ?)`
    )
    .bind(
      greenId,
      target.source,
      'workflow_run.success',
      `Backfill auto-resolved via GitHub API: run ${matched_run_id}`,
      greenDetails,
      greenDedupe,
      target.venture,
      target.repo,
      target.branch,
      matched_run_started_at,
      now,
      now,
      actor_key_id,
      target.match_key,
      target.match_key_version,
      matched_run_started_at,
      reason
    )
    .run()

  return { greenId, greenDedupe, changes: insertResult.meta.changes ?? 0 }
}

/**
 * When the green INSERT was a no-op (dedupe collision), look up the existing
 * green row by dedupe hash so we can reference it as the resolver.
 *
 * Returns the existing row's id, or the provided `fallbackId` when the row
 * cannot be found (should not happen in normal operation).
 */
export async function resolveGreenId(
  db: D1Database,
  greenDedupe: string,
  fallbackId: string
): Promise<string> {
  const existing = await db
    .prepare('SELECT id FROM notifications WHERE dedupe_hash = ?')
    .bind(greenDedupe)
    .first<{ id: string }>()
  return existing ? existing.id : fallbackId
}

/**
 * Update a single open notification to `resolved`, linking it to the
 * green row that resolved it. The WHERE clause includes
 * `auto_resolved_by_id IS NULL` so concurrent resolvers are safe.
 *
 * Returns the number of rows changed (1 = success, 0 = race lost).
 */
export async function updateResolvedStatus(
  db: D1Database,
  notificationId: string,
  greenIdToUse: string,
  reason: NotificationAutoResolveReason,
  now: string
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE notifications
       SET status = 'resolved',
           auto_resolved_by_id = ?,
           auto_resolve_reason = ?,
           resolved_at = ?,
           updated_at = ?
       WHERE id = ? AND status IN ('new', 'acked') AND auto_resolved_by_id IS NULL`
    )
    .bind(greenIdToUse, reason, now, now, notificationId)
    .run()
  return result.meta.changes ?? 0
}
