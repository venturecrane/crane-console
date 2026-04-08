/**
 * crane_notifications / crane_notification_update tools
 *
 * List, filter, and manage CI/CD notifications from GitHub Actions and Vercel deployments.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import { truncate, formatTruthfulCount } from '../lib/truthful-display.js'

// ============================================================================
// Schemas
// ============================================================================

export const notificationsInputSchema = z.object({
  status: z
    .enum(['new', 'acked', 'resolved'])
    .optional()
    .describe('Filter by status (default: all)'),
  severity: z.enum(['critical', 'warning', 'info']).optional().describe('Filter by severity'),
  venture: z.string().optional().describe('Filter by venture code'),
  repo: z.string().optional().describe('Filter by repo (org/repo)'),
  source: z.enum(['github', 'vercel']).optional().describe('Filter by source'),
  limit: z.number().optional().describe('Max results (default 20, max 100)'),
})

export type NotificationsInput = z.infer<typeof notificationsInputSchema>

export const notificationUpdateInputSchema = z.object({
  id: z.string().describe('Notification ID to update'),
  status: z.enum(['acked', 'resolved']).describe('New status'),
})

export type NotificationUpdateInput = z.infer<typeof notificationUpdateInputSchema>

// ============================================================================
// Result Types
// ============================================================================

export interface NotificationsResult {
  success: boolean
  message: string
}

// ============================================================================
// Helpers
// ============================================================================

function getApiKey(): string | null {
  return process.env.CRANE_CONTEXT_KEY || null
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'CRIT'
    case 'warning':
      return 'WARN'
    case 'info':
      return 'INFO'
    default:
      return severity
  }
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ============================================================================
// Execute: crane_notifications
// ============================================================================

export async function executeNotifications(
  input: NotificationsInput
): Promise<NotificationsResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Launch with: crane vc',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  try {
    // Parallel counts + list (Plan §B.2/B.3 — defect #12). The same
    // pattern the SOS uses: counts call is the source of truth for the
    // header, list call provides the table rows. The two calls run in
    // parallel so the tool doesn't pay double latency.
    const [counts, result] = await Promise.all([
      api
        .getNotificationCounts({
          status: input.status,
          severity: input.severity,
          venture: input.venture,
          repo: input.repo,
          source: input.source,
        })
        .catch(() => null),
      api.listNotifications({
        status: input.status,
        severity: input.severity,
        venture: input.venture,
        repo: input.repo,
        source: input.source,
        limit: input.limit,
      }),
    ])

    const notifications = result.notifications

    if (notifications.length === 0 && (counts == null || counts.total === 0)) {
      const filters: string[] = []
      if (input.status) filters.push(`status=${input.status}`)
      if (input.severity) filters.push(`severity=${input.severity}`)
      if (input.venture) filters.push(`venture=${input.venture}`)
      if (input.source) filters.push(`source=${input.source}`)

      return {
        success: true,
        message: `No notifications found${filters.length > 0 ? ` (filters: ${filters.join(', ')})` : ''}.`,
      }
    }

    // Truthful header. If the counts call succeeded use the true total;
    // otherwise fall back to the helper which knows how to render an
    // unknown total.
    let header: string
    if (counts) {
      const breakdown: string[] = []
      if (counts.by_severity.critical > 0) breakdown.push(`${counts.by_severity.critical} critical`)
      if (counts.by_severity.warning > 0) breakdown.push(`${counts.by_severity.warning} warning`)
      if (counts.by_severity.info > 0) breakdown.push(`${counts.by_severity.info} info`)
      const breakdownStr = breakdown.length > 0 ? ` (${breakdown.join(', ')})` : ''
      header = `## CI/CD Notifications — ${counts.total} total${breakdownStr}\n`
      if (notifications.length > 0) {
        const moreSuffix =
          counts.total > notifications.length
            ? `, +${counts.total - notifications.length} more — narrow filter or paginate`
            : ''
        header += `Showing ${notifications.length}${moreSuffix}:\n`
      }
    } else {
      const truncated = truncate(notifications, notifications.length)
      header = `## ${formatTruthfulCount(truncated, 'CI/CD Notification(s)')}\n`
    }

    let message = `${header}\n`
    if (notifications.length > 0) {
      message += `| Severity | Status | Source | Summary | Time | ID |\n`
      message += `|----------|--------|--------|---------|------|----|\n`

      for (const n of notifications) {
        const sev = severityIcon(n.severity)
        const time = relativeTime(n.created_at)
        const summary = n.summary.length > 80 ? n.summary.slice(0, 77) + '...' : n.summary
        message += `| ${sev} | ${n.status} | ${n.source} | ${summary} | ${time} | ${n.id} |\n`
      }
    }

    if (result.pagination?.next_cursor) {
      message += `\n_Next page: pass cursor parameter._`
    }

    message += `\n\nTo acknowledge: \`crane_notification_update(id: "<id>", status: "acked")\``
    message += `\nTo resolve: \`crane_notification_update(id: "<id>", status: "resolved")\``

    return { success: true, message }
  } catch (error) {
    return {
      success: false,
      message: `Failed to fetch notifications: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// ============================================================================
// Execute: crane_notification_update
// ============================================================================

export async function executeNotificationUpdate(
  input: NotificationUpdateInput
): Promise<NotificationsResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Launch with: crane vc',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  try {
    const result = await api.updateNotificationStatus(input.id, input.status)
    const n = result.notification

    return {
      success: true,
      message: `Notification ${n.id} updated to **${n.status}**.\n\n${n.summary}`,
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to update notification: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
