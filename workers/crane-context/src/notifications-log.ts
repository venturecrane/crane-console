/**
 * Crane Context Worker - Notification Structured Logging
 *
 * Every notification state transition emits exactly one structured log line.
 * This is the observability layer for the auto-resolver: operators tail
 * `wrangler tail --env production --format pretty` and grep for these
 * events to see auto-resolves happening in real time.
 *
 * The contract test in test/notifications-log.test.ts asserts that each
 * transition function in notifications.ts produces exactly one log line.
 */

/**
 * Notification event types emitted by the data layer.
 *
 * - `notification_created`: a failure notification was inserted
 * - `notification_resolved_auto`: prior failures auto-resolved by a green event
 * - `notification_resolved_manual`: an operator called updateNotificationStatus
 * - `success_event_received_match`: a green event matched and resolved 1+ rows
 * - `success_event_received_no_match`: a green event matched zero rows
 *   (could be: no open notifications for this key, or race lost to another green)
 * - `green_event_idempotent_skip`: the same green webhook was delivered twice;
 *   the second was a no-op via dedupe_hash UNIQUE
 * - `auto_resolve_failed`: an unexpected error during processGreenEvent
 */
export type NotificationLogEvent =
  | 'notification_created'
  | 'notification_resolved_auto'
  | 'notification_resolved_manual'
  | 'success_event_received_match'
  | 'success_event_received_no_match'
  | 'green_event_idempotent_skip'
  | 'auto_resolve_failed'
  // Issue #563: bulk-resolve paths.
  | 'notifications_resolved_by_branch'
  | 'notifications_stale_branch_sweep'

/**
 * Emit a structured log line for a notification state transition.
 *
 * Output is JSON on a single line so `wrangler tail | jq` is clean.
 * Cloudflare Workers Logs (when enabled) indexes the JSON for search.
 */
export function logNotificationEvent(
  event: NotificationLogEvent,
  data: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...data,
    })
  )
}
