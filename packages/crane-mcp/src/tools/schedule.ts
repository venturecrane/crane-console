/**
 * crane_schedule tool - Cadence Engine interface
 *
 * Two actions:
 * - list: fetch schedule briefing, render as table
 * - complete: record completion of a schedule item
 */

import { z } from 'zod'
import { CraneApi, ScheduleBriefingItem, ScheduleItem } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'

export const scheduleInputSchema = z.object({
  action: z
    .enum(['list', 'complete', 'items', 'link-calendar'])
    .describe(
      'Action: "list" to view briefing, "complete" to record completion, "items" to get all items with calendar state, "link-calendar" to store gcal_event_id'
    ),
  scope: z.string().optional().describe('Venture code to filter briefing (list action only)'),
  name: z
    .string()
    .optional()
    .describe('Schedule item name (required for complete and link-calendar actions)'),
  result: z
    .enum(['success', 'warning', 'failure', 'skipped'])
    .optional()
    .describe('Completion result (complete action only)'),
  summary: z.string().optional().describe('Brief outcome description (complete action only)'),
  completed_by: z.string().optional().describe('Who completed this (complete action only)'),
  gcal_event_id: z
    .string()
    .nullable()
    .optional()
    .describe('Google Calendar event ID (link-calendar action). Pass null to unlink.'),
})

export type ScheduleInput = z.infer<typeof scheduleInputSchema>

export interface ScheduleResult {
  success: boolean
  message: string
}

// Map schedule item names to actionable hints
const ACTION_HINTS: Record<string, string> = {
  'portfolio-review': '/portfolio-review',
  'weekly-plan': 'Update docs/planning/WEEKLY_PLAN.md',
  'fleet-health': 'scripts/fleet-health.sh',
  'command-sync': 'scripts/sync-commands.sh --fleet',
  'code-review-vc': '/code-review',
  'code-review-ke': '/code-review',
  'code-review-dfg': '/code-review',
  'code-review-sc': '/code-review',
  'code-review-dc': '/code-review',
  'enterprise-review': '/enterprise-review',
  'dependency-freshness': 'npm audit / npm outdated',
  'secrets-rotation-review': 'docs/infra/secrets-rotation-runbook.md',
  'content-scan': '/content-scan',
}

function priorityLabel(priority: number): string {
  switch (priority) {
    case 0:
      return 'P0'
    case 1:
      return 'HIGH'
    case 2:
      return 'NORMAL'
    case 3:
      return 'LOW'
    default:
      return `P${priority}`
  }
}

const SCOPE_LABELS: Record<string, string> = {
  vc: 'VC',
  ke: 'KE',
  dfg: 'DFG',
  sc: 'SC',
  dc: 'DC',
  global: 'CRANE',
}

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] || scope.toUpperCase()
}

function formatItemsTable(items: ScheduleItem[]): string {
  if (items.length === 0) {
    return 'No schedule items found.'
  }

  let table = '| Priority | Item | Status | Days Ago | Next Due | Calendar |\n'
  table += '|----------|------|--------|----------|----------|----------|\n'

  for (const item of items) {
    const priority = priorityLabel(item.priority)
    const status = item.status.toUpperCase()
    const daysAgo = item.days_since !== null ? String(item.days_since) : 'never'
    const nextDue = item.next_due_date || '-'
    const calendar = item.gcal_event_id ? 'linked' : '-'

    table += `| ${priority} | [${scopeLabel(item.scope)}] ${item.title} | ${status} | ${daysAgo} | ${nextDue} | ${calendar} |\n`
  }

  return table
}

function formatBriefingTable(items: ScheduleBriefingItem[]): string {
  if (items.length === 0) {
    return 'All schedule items are current. Nothing due.'
  }

  let table = '| Priority | Item | Status | Days Ago | Action |\n'
  table += '|----------|------|--------|----------|--------|\n'

  for (const item of items) {
    const priority = priorityLabel(item.priority)
    const status = item.status.toUpperCase()
    const daysAgo = item.days_since !== null ? String(item.days_since) : 'never'
    const action = ACTION_HINTS[item.name] || item.name

    table += `| ${priority} | ${item.title} | ${status} | ${daysAgo} | ${action} |\n`
  }

  return table
}

function getApiKey(): string | null {
  return process.env.CRANE_CONTEXT_KEY || null
}

export async function executeSchedule(input: ScheduleInput): Promise<ScheduleResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Launch with: crane vc',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  if (input.action === 'list') {
    try {
      const briefing = await api.getScheduleBriefing(input.scope)

      let message = '## Schedule Briefing\n\n'
      message += formatBriefingTable(briefing.items)

      if (briefing.items.length > 0) {
        const parts: string[] = []
        if (briefing.overdue_count > 0) parts.push(`${briefing.overdue_count} overdue`)
        if (briefing.due_count > 0) parts.push(`${briefing.due_count} due`)
        if (briefing.untracked_count > 0) parts.push(`${briefing.untracked_count} untracked`)
        message += `\n${parts.join(', ')}`
      }

      return { success: true, message }
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch schedule briefing: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  if (input.action === 'items') {
    try {
      const response = await api.getScheduleItems()

      let message = '## All Schedule Items\n\n'
      message += formatItemsTable(response.items)
      message += `\n${response.count} items total`

      return { success: true, message }
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch schedule items: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  if (input.action === 'link-calendar') {
    if (!input.name) {
      return {
        success: false,
        message: 'Schedule item name is required for the link-calendar action.',
      }
    }

    try {
      const gcalId = input.gcal_event_id === undefined ? null : input.gcal_event_id
      const response = await api.linkScheduleCalendar(input.name, gcalId)

      const action = response.gcal_event_id ? 'Linked' : 'Unlinked'
      return {
        success: true,
        message: `${action} calendar for **${response.name}** (gcal_event_id: ${response.gcal_event_id || 'null'})`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to link calendar: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  if (input.action === 'complete') {
    if (!input.name) {
      return {
        success: false,
        message: 'Schedule item name is required for the complete action.',
      }
    }
    if (!input.result) {
      return {
        success: false,
        message: 'Result is required for the complete action (success/warning/failure/skipped).',
      }
    }

    try {
      const response = await api.completeScheduleItem(input.name, {
        result: input.result,
        summary: input.summary,
        completed_by: input.completed_by,
      })

      let message = `Completed **${input.name}** at ${response.completed_at} (result: ${response.result}). Next due: ${response.next_due_date || 'unknown'}.`

      // Add calendar sync orchestration hints
      message += '\n\nCalendar sync:'
      if (response.gcal_event_id) {
        message += `\n1. Update Google Calendar: gcal_update_event(event_id: "${response.gcal_event_id}", date: ${response.next_due_date})`
      } else {
        message += '\n1. No Google Calendar event linked - consider creating one'
      }
      message += `\n2. Mark Apple Reminder complete (if exists): search for reminder matching "${input.name}"`

      return {
        success: true,
        message,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to complete schedule item: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  return {
    success: false,
    message: `Unknown action: ${input.action}. Use "list", "complete", "items", or "link-calendar".`,
  }
}
