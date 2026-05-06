import {
  notificationsInputSchema,
  executeNotifications,
  notificationUpdateInputSchema,
  executeNotificationUpdate,
} from '../tools/notifications.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const NOTIFICATION_TOOLS: ToolEntry[] = [
  makeEntry(
    {
      name: 'crane_notifications',
      description: 'List CI/CD failure notifications.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['new', 'acked', 'resolved'],
            description: 'Filter by status',
          },
          severity: {
            type: 'string',
            enum: ['critical', 'warning', 'info'],
            description: 'Filter by severity',
          },
          venture: {
            type: 'string',
            description: 'Filter by venture code',
          },
          repo: {
            type: 'string',
            description: 'Filter by repo (org/repo)',
          },
          source: {
            type: 'string',
            enum: ['github', 'vercel'],
            description: 'Filter by source',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 20, max 100)',
          },
        },
      },
    },
    notificationsInputSchema,
    executeNotifications,
    true
  ),
  makeEntry(
    {
      name: 'crane_notification_update',
      description: 'Acknowledge or resolve a CI/CD notification.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Notification ID to update',
          },
          status: {
            type: 'string',
            enum: ['acked', 'resolved'],
            description: 'New status',
          },
        },
        required: ['id', 'status'],
      },
    },
    notificationUpdateInputSchema,
    executeNotificationUpdate,
    false
  ),
]
