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
import { generateNotificationId, nowIso, sha256 } from './utils'
import { logNotificationEvent } from './notifications-log'

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
 * claim it. This handles the crash case where a holder dies without
 * releasing.
 *
 * Idempotent re-acquisition by the same holder: if the existing lock's
 * holder matches the requesting holder, the TTL is extended and the
 * acquisition succeeds. This lets a long-running backfill heartbeat to
 * its own lock.
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
  const expiresAt = new Date(Date.now() + params.ttl_seconds * 1000).toISOString()

  // Try to insert a new lock row. INSERT OR IGNORE makes this atomic.
  const insertResult = await db
    .prepare(
      `INSERT OR IGNORE INTO notification_locks
       (name, holder, acquired_at, expires_at, metadata_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(params.name, params.holder, now, expiresAt, params.metadata_json ?? null)
    .run()

  if (insertResult.meta.changes === 1) {
    // We acquired a fresh lock.
    return {
      acquired: true,
      lock: {
        name: params.name,
        holder: params.holder,
        acquired_at: now,
        expires_at: expiresAt,
        metadata_json: params.metadata_json ?? null,
      },
    }
  }

  // Someone else holds it. Inspect the existing lock.
  const existing = await db
    .prepare('SELECT * FROM notification_locks WHERE name = ?')
    .bind(params.name)
    .first<NotificationLockRecord>()

  if (!existing) {
    // Race: lock was deleted between our INSERT and SELECT. Retry once.
    return await acquireNotificationLock(db, params)
  }

  // If the existing lock has expired, reclaim it.
  if (existing.expires_at < now) {
    const updateResult = await db
      .prepare(
        `UPDATE notification_locks
         SET holder = ?, acquired_at = ?, expires_at = ?, metadata_json = ?
         WHERE name = ? AND expires_at = ?`
      )
      .bind(
        params.holder,
        now,
        expiresAt,
        params.metadata_json ?? null,
        params.name,
        existing.expires_at
      )
      .run()

    if (updateResult.meta.changes === 1) {
      return {
        acquired: true,
        lock: {
          name: params.name,
          holder: params.holder,
          acquired_at: now,
          expires_at: expiresAt,
          metadata_json: params.metadata_json ?? null,
        },
      }
    }
    // Lost the race to reclaim. Treat as contention.
  }

  // Idempotent re-acquisition by the same holder: extend the TTL.
  if (existing.holder === params.holder) {
    await db
      .prepare(
        `UPDATE notification_locks
         SET expires_at = ?, metadata_json = ?
         WHERE name = ? AND holder = ?`
      )
      .bind(expiresAt, params.metadata_json ?? existing.metadata_json, params.name, params.holder)
      .run()
    return {
      acquired: true,
      lock: { ...existing, expires_at: expiresAt },
    }
  }

  return {
    acquired: false,
    lock: existing,
    reason: `lock held by ${existing.holder} until ${existing.expires_at}`,
  }
}

/**
 * Release a notification lock. Only the current holder can release.
 *
 * Returns true if the lock was released, false if the caller did not hold
 * it (someone else's lock, or already expired and reclaimed).
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

/**
 * List distinct match_keys with at least one open notification, paginated
 * via opaque cursor. The CLI walks this list and queries the GitHub API
 * for each unique key.
 *
 * Cursor format: base64(`<oldest_open_created_at>|<match_key>`). Pagination
 * is stable under concurrent writes because the cursor anchors on
 * (created_at, match_key) which is monotonic.
 *
 * Default limit: 100. Max limit: 500.
 */
export async function listPendingMatches(
  db: D1Database,
  params: { cursor?: string; limit?: number }
): Promise<PendingMatchesResult> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500)
  const retentionCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Decode cursor if present.
  let cursorCreatedAt: string | null = null
  let cursorMatchKey: string | null = null
  if (params.cursor) {
    try {
      const decoded = atob(params.cursor)
      const sep = decoded.indexOf('|')
      if (sep > 0) {
        cursorCreatedAt = decoded.substring(0, sep)
        cursorMatchKey = decoded.substring(sep + 1)
      }
    } catch {
      // Invalid cursor — start from beginning
    }
  }

  // Aggregate open notifications by match_key, returning oldest_open_created_at
  // and one representative repo/branch/workflow_id per group. The cursor
  // predicate is on (oldest_open_created_at, match_key) which is well-defined
  // since we order by it.
  const conditions: string[] = [
    "status IN ('new', 'acked')",
    'match_key IS NOT NULL',
    'created_at > ?',
  ]
  const binds: (string | number)[] = [retentionCutoff]

  // For pagination we need to filter the GROUPed results, but SQLite cannot
  // filter HAVING with cursor predicates that use the aggregate. Instead we
  // pre-filter at the row level: any row with created_at >= cursor's
  // oldest_open_created_at AND match_key > cursor's match_key (or strictly
  // greater created_at). This is sound because each match_key's oldest row
  // is what determines its position in the result.
  if (cursorCreatedAt && cursorMatchKey) {
    conditions.push('(created_at > ? OR (created_at = ? AND match_key > ?))')
    binds.push(cursorCreatedAt, cursorCreatedAt, cursorMatchKey)
  }

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

  return {
    matches: rows,
    next_cursor: nextCursor,
  }
}

// ============================================================================
// Admin auto-resolve (single notification, by id)
// ============================================================================

/**
 * Resolve a single notification via the admin path, recording the
 * GitHub-API-discovered green run details. Used by the backfill CLI.
 *
 * Idempotent: if the notification is already resolved, returns
 * `{ already_resolved: true }`.
 *
 * Inserts a synthetic green notification row to record the audit trail
 * (so `crane_notifications --status resolved` shows the GitHub run URL
 * that resolved this row).
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
  // Validate reason
  if (!NOTIFICATION_AUTO_RESOLVE_REASONS.includes(params.reason)) {
    return { ok: false, already_resolved: false, reason: `invalid reason: ${params.reason}` }
  }

  // Fetch the target notification
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

  // Validate the target has a match_key (otherwise the auto-resolver wouldn't
  // have been able to match it via the normal path either).
  if (!target.match_key) {
    return {
      ok: false,
      already_resolved: false,
      reason: 'notification has no match_key (not eligible for auto-resolve)',
    }
  }

  // Insert a synthetic green notification row that records the GitHub-API
  // metadata. This is the audit trail for "the backfill CLI matched this
  // failure to GitHub run X via the admin path."
  const greenId = generateNotificationId()
  const now = nowIso()
  const greenDedupeInput = `github|workflow_run.success|${target.repo ?? ''}|${target.branch ?? ''}|backfill:${params.matched_run_id}`
  const greenDedupe = await sha256(greenDedupeInput)

  const greenDetails = JSON.stringify({
    matched_run_id: params.matched_run_id,
    matched_run_url: params.matched_run_url,
    matched_run_started_at: params.matched_run_started_at,
    source: 'github_api_backfill',
  })

  // INSERT the green row first (idempotent via dedupe_hash UNIQUE).
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
      `Backfill auto-resolved via GitHub API: run ${params.matched_run_id}`,
      greenDetails,
      greenDedupe,
      target.venture,
      target.repo,
      target.branch,
      params.matched_run_started_at,
      now,
      now,
      params.actor_key_id,
      target.match_key,
      target.match_key_version,
      params.matched_run_started_at,
      params.reason
    )
    .run()

  // Whether or not the green INSERT actually succeeded (it could be a
  // duplicate from a previous backfill run), update the target if it is
  // still open. Use the `auto_resolved_by_id IS NULL` predicate so we do
  // not overwrite a row that was already resolved by a different path.
  let greenIdToUse = greenId
  if (insertResult.meta.changes === 0) {
    // Find the existing green row with this dedupe to use as the resolver.
    const existingGreen = await db
      .prepare('SELECT id FROM notifications WHERE dedupe_hash = ?')
      .bind(greenDedupe)
      .first<{ id: string }>()
    if (existingGreen) {
      greenIdToUse = existingGreen.id
    }
  }

  const updateResult = await db
    .prepare(
      `UPDATE notifications
       SET status = 'resolved',
           auto_resolved_by_id = ?,
           auto_resolve_reason = ?,
           resolved_at = ?,
           updated_at = ?
       WHERE id = ? AND status IN ('new', 'acked') AND auto_resolved_by_id IS NULL`
    )
    .bind(greenIdToUse, params.reason, now, now, params.notification_id)
    .run()

  if ((updateResult.meta.changes ?? 0) > 0) {
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

/**
 * Walk open notifications and attempt to auto-resolve them using ONLY
 * green rows that already exist in the notifications table. Distinct from
 * the CLI backfill which queries the GitHub Actions API.
 *
 * Useful when:
 *   - A matcher fix is deployed and we want to apply it retroactively to
 *     in-table data (e.g., auto_resolve_reason was added later, or the
 *     match_key format was corrected and pre-existing greens should now
 *     resolve previously-unmatched failures).
 *   - The auto-resolver was briefly disabled and we want to reconcile any
 *     greens that arrived during the gap.
 *
 * NOT useful for the original 270-stale-notification incident: at that
 * point, no green webhook had ever been stored in the table, so this
 * function has nothing to match against. The CLI backfill is the right
 * tool for that case.
 *
 * Bounded to `max_rows` per invocation. Returns a cursor for pagination
 * across multiple calls.
 */
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

export async function runInTableBackfill(
  db: D1Database,
  params: InTableBackfillParams
): Promise<InTableBackfillResult> {
  const maxRows = Math.min(Math.max(params.max_rows ?? 1000, 1), 5000)
  const retentionCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Decode cursor (same opaque format as listPendingMatches)
  let cursorCreatedAt: string | null = null
  let cursorId: string | null = null
  if (params.cursor) {
    try {
      const decoded = atob(params.cursor)
      const sep = decoded.indexOf('|')
      if (sep > 0) {
        cursorCreatedAt = decoded.substring(0, sep)
        cursorId = decoded.substring(sep + 1)
      }
    } catch {
      // Invalid cursor — start from beginning
    }
  }

  // Fetch a page of open notifications with match_keys
  const conditions: string[] = [
    "status IN ('new', 'acked')",
    'match_key IS NOT NULL',
    'created_at > ?',
  ]
  const binds: (string | number)[] = [retentionCutoff]

  if (params.venture) {
    conditions.push('venture = ?')
    binds.push(params.venture)
  }

  if (cursorCreatedAt && cursorId) {
    conditions.push('(created_at > ? OR (created_at = ? AND id > ?))')
    binds.push(cursorCreatedAt, cursorCreatedAt, cursorId)
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
    .all<{
      id: string
      match_key: string
      run_started_at: string | null
      head_sha: string | null
      created_at: string
    }>()

  const rows = result.results || []
  let nextCursor: string | null = null
  if (rows.length > maxRows) {
    rows.pop()
    const last = rows[rows.length - 1]
    nextCursor = btoa(`${last.created_at}|${last.id}`)
  }

  let resolved = 0
  let noMatch = 0
  const now = nowIso()

  for (const row of rows) {
    // Look for a green notification row with the same match_key whose
    // run_started_at is later than this failure's run_started_at (or
    // any green if the failure has no run_started_at).
    const greenSql = row.run_started_at
      ? `SELECT id, run_started_at FROM notifications
         WHERE match_key = ?
           AND status = 'resolved'
           AND auto_resolve_reason LIKE 'green_%'
           AND (run_started_at IS NULL OR run_started_at >= ?)
         ORDER BY run_started_at ASC LIMIT 1`
      : `SELECT id, run_started_at FROM notifications
         WHERE match_key = ?
           AND status = 'resolved'
           AND auto_resolve_reason LIKE 'green_%'
         ORDER BY run_started_at ASC LIMIT 1`

    const greenBinds: (string | null)[] = row.run_started_at
      ? [row.match_key, row.run_started_at]
      : [row.match_key]

    const green = await db
      .prepare(greenSql)
      .bind(...greenBinds)
      .first<{ id: string; run_started_at: string | null }>()

    if (!green) {
      noMatch++
      continue
    }

    if (params.dry_run) {
      resolved++
      continue
    }

    // Resolve via the same idempotent UPDATE pattern
    const updateResult = await db
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
      .bind(green.id, now, now, row.id)
      .run()

    if ((updateResult.meta.changes ?? 0) > 0) {
      resolved++
      logNotificationEvent('notification_resolved_auto', {
        id: row.id,
        resolved_by_id: green.id,
        match_key: row.match_key,
        reason: 'in_table_backfill',
        prior_status: 'new',
      })
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
