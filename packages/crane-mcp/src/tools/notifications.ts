/**
 * crane_notifications / crane_notification_update tools
 *
 * List, filter, and manage CI/CD notifications from GitHub Actions and Vercel deployments.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'

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
    const result = await api.listNotifications({
      status: input.status,
      severity: input.severity,
      venture: input.venture,
      repo: input.repo,
      source: input.source,
      limit: input.limit,
    })

    const notifications = result.notifications

    if (notifications.length === 0) {
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

    let message = `## CI/CD Notifications (${notifications.length})\n\n`
    message += `| Severity | Status | Source | Summary | Time | ID |\n`
    message += `|----------|--------|--------|---------|------|----|\n`

    for (const n of notifications) {
      const sev = severityIcon(n.severity)
      const time = relativeTime(n.created_at)
      const summary = n.summary.length > 80 ? n.summary.slice(0, 77) + '...' : n.summary
      message += `| ${sev} | ${n.status} | ${n.source} | ${summary} | ${time} | ${n.id} |\n`
    }

    if (result.pagination?.next_cursor) {
      message += `\n_More results available. Use cursor for pagination._`
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
