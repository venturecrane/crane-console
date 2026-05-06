/**
 * Low-level D1 operations for the notification_locks table.
 *
 * These helpers are intentionally narrow: each performs exactly one SQL
 * statement. Callers (acquireNotificationLock / releaseNotificationLock)
 * compose them for the full lock-acquisition protocol.
 */

import type { NotificationLockRecord } from '../admin-notifications'
import { nowIso } from '../utils'

export interface LockUpsertParams {
  name: string
  holder: string
  ttl_seconds: number
  metadata_json?: string
}

/** Build the expires_at timestamp for a lock with the given TTL. */
export function lockExpiresAt(ttl_seconds: number): string {
  return new Date(Date.now() + ttl_seconds * 1000).toISOString()
}

/**
 * Attempt an INSERT OR IGNORE into notification_locks.
 * Returns `true` when the row was created (acquired), `false` on conflict.
 */
export async function tryInsertLock(
  db: D1Database,
  params: LockUpsertParams,
  now: string,
  expiresAt: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO notification_locks
       (name, holder, acquired_at, expires_at, metadata_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(params.name, params.holder, now, expiresAt, params.metadata_json ?? null)
    .run()
  return result.meta.changes === 1
}

/**
 * Read the current lock row for `name`. Returns null if absent.
 */
export async function fetchLock(
  db: D1Database,
  name: string
): Promise<NotificationLockRecord | null> {
  return db
    .prepare('SELECT * FROM notification_locks WHERE name = ?')
    .bind(name)
    .first<NotificationLockRecord>()
}

/**
 * Attempt to reclaim an expired lock via an optimistic UPDATE that
 * conditions on the old `expires_at` value. Returns `true` when exactly
 * one row was updated (raced successfully).
 */
export async function tryReclaimExpiredLock(
  db: D1Database,
  params: LockUpsertParams,
  now: string,
  expiresAt: string,
  oldExpiresAt: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE notification_locks
       SET holder = ?, acquired_at = ?, expires_at = ?, metadata_json = ?
       WHERE name = ? AND expires_at = ?`
    )
    .bind(params.holder, now, expiresAt, params.metadata_json ?? null, params.name, oldExpiresAt)
    .run()
  return result.meta.changes === 1
}

/**
 * Extend the TTL for a lock that is already held by the same holder.
 * Used for idempotent re-acquisition (heartbeat path).
 */
export async function extendLock(
  db: D1Database,
  params: LockUpsertParams,
  expiresAt: string,
  existing: NotificationLockRecord
): Promise<void> {
  await db
    .prepare(
      `UPDATE notification_locks
       SET expires_at = ?, metadata_json = ?
       WHERE name = ? AND holder = ?`
    )
    .bind(expiresAt, params.metadata_json ?? existing.metadata_json, params.name, params.holder)
    .run()
}

/** Build a successful acquisition response from the given parameters. */
export function buildAcquiredResponse(
  params: LockUpsertParams,
  now: string,
  expiresAt: string
): { acquired: true; lock: NotificationLockRecord } {
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

export { nowIso }
