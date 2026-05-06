/**
 * Crane Context Worker - Notification Status Transitions
 *
 * updateNotificationStatus: validated state-machine transitions.
 */

import { NOTIFICATION_STATUSES } from './constants'
import type { NotificationRecord, NotificationStatus } from './types'
import { nowIso } from './utils'
import { logNotificationEvent } from './notifications-log'

// ============================================================================
// State machine
// ============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['acked', 'resolved'],
  acked: ['resolved'],
  resolved: [],
}

// ============================================================================
// Public API
// ============================================================================

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
  if (!NOTIFICATION_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`)
  }

  const current = await db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .bind(id)
    .first<NotificationRecord>()

  if (!current) return null

  const allowed = VALID_TRANSITIONS[current.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid state transition: ${current.status} -> ${newStatus}. Allowed: ${(allowed ?? []).join(', ') || 'none'}`
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
    logNotificationEvent('notification_resolved_manual', { id, prior_status: current.status })
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
