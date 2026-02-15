/**
 * Crane Context Worker - Schedule Endpoints
 *
 * Cadence Engine: briefing surface and completion recording.
 * Status is computed at read time from last_completed_at + cadence_days.
 */

import type { Env, ScheduleItemRecord } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse, nowIso } from '../utils'
import { HTTP_STATUS } from '../constants'

// ============================================================================
// Request/Response Types
// ============================================================================

interface CompleteScheduleBody {
  result: 'success' | 'warning' | 'failure' | 'skipped'
  summary?: string
  completed_by?: string
}

interface BriefingItem {
  name: string
  title: string
  description: string | null
  cadence_days: number
  scope: string
  priority: number
  status: 'overdue' | 'due' | 'untracked'
  days_since: number | null
  last_completed_at: string | null
  last_completed_by: string | null
  last_result: string | null
  last_result_summary: string | null
}

// ============================================================================
// GET /schedule/briefing - Compute and return non-current items
// ============================================================================

export async function handleGetScheduleBriefing(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope')

    // Query all enabled items, optionally filtered by scope
    let query: string
    let params: string[]

    if (scope) {
      // Return items matching the scope OR global items
      query =
        'SELECT * FROM schedule_items WHERE enabled = 1 AND (scope = ?1 OR scope = ?2) ORDER BY priority ASC'
      params = [scope, 'global']
    } else {
      query = 'SELECT * FROM schedule_items WHERE enabled = 1 ORDER BY priority ASC'
      params = []
    }

    const result = scope
      ? await env.DB.prepare(query)
          .bind(...params)
          .all<ScheduleItemRecord>()
      : await env.DB.prepare(query).all<ScheduleItemRecord>()

    const rows = result.results || []
    const now = Date.now()
    const DAY_MS = 86400000

    const items: BriefingItem[] = []
    let overdueCount = 0
    let dueCount = 0
    let untrackedCount = 0

    for (const row of rows) {
      const daysSince = row.last_completed_at
        ? Math.floor((now - Date.parse(row.last_completed_at)) / DAY_MS)
        : null

      const status =
        daysSince === null
          ? 'untracked'
          : daysSince >= row.cadence_days * 2
            ? 'overdue'
            : daysSince >= row.cadence_days
              ? 'due'
              : 'current'

      if (status === 'current') continue

      if (status === 'overdue') overdueCount++
      else if (status === 'due') dueCount++
      else untrackedCount++

      items.push({
        name: row.name,
        title: row.title,
        description: row.description,
        cadence_days: row.cadence_days,
        scope: row.scope,
        priority: row.priority,
        status,
        days_since: daysSince,
        last_completed_at: row.last_completed_at,
        last_completed_by: row.last_completed_by,
        last_result: row.last_result,
        last_result_summary: row.last_result_summary,
      })
    }

    // Sort: priority ASC, then days overdue DESC (nulls last for untracked)
    items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      const aDays = a.days_since ?? -1
      const bDays = b.days_since ?? -1
      return bDays - aDays
    })

    return jsonResponse(
      {
        items,
        overdue_count: overdueCount,
        due_count: dueCount,
        untracked_count: untrackedCount,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /schedule/briefing error:', error)
    return errorResponse(
      'Failed to compute schedule briefing',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /schedule/:name/complete - Record completion
// ============================================================================

export async function handleCompleteScheduleItem(
  request: Request,
  env: Env,
  name: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as CompleteScheduleBody

    // Validate result field
    const validResults = ['success', 'warning', 'failure', 'skipped']
    if (!body.result || !validResults.includes(body.result)) {
      return validationErrorResponse(
        [
          {
            field: 'result',
            message: `Required, must be one of: ${validResults.join(', ')}`,
          },
        ],
        context.correlationId
      )
    }

    // Find the schedule item by name
    const existing = await env.DB.prepare('SELECT id FROM schedule_items WHERE name = ?1')
      .bind(name)
      .first<{ id: string }>()

    if (!existing) {
      return errorResponse(
        `Schedule item not found: ${name}`,
        HTTP_STATUS.NOT_FOUND,
        context.correlationId
      )
    }

    const now = nowIso()

    await env.DB.prepare(
      `UPDATE schedule_items
       SET last_completed_at = ?1,
           last_completed_by = ?2,
           last_result = ?3,
           last_result_summary = ?4,
           updated_at = ?5
       WHERE name = ?6`
    )
      .bind(
        now,
        body.completed_by || context.actorKeyId,
        body.result,
        body.summary || null,
        now,
        name
      )
      .run()

    return jsonResponse(
      {
        name,
        completed_at: now,
        result: body.result,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error(`POST /schedule/${name}/complete error:`, error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
