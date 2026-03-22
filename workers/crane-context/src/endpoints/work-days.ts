/**
 * Crane Context Worker - Work Day Endpoints
 *
 * Tracks daily work windows for calendar integration.
 * Upsert semantics: single endpoint handles start, end, and calendar linking.
 */

import type { Env, WorkDayRecord } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse, nowIso } from '../utils'
import { HTTP_STATUS } from '../constants'

// ============================================================================
// Request/Response Types
// ============================================================================

interface UpsertWorkDayBody {
  action: 'start' | 'end'
  gcal_event_id?: string | null
}

// ============================================================================
// POST /work-day - Upsert work day record
// ============================================================================

export async function handleUpsertWorkDay(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as UpsertWorkDayBody

    if (!body.action || !['start', 'end'].includes(body.action)) {
      return validationErrorResponse(
        [
          {
            field: 'action',
            message: 'Required, must be one of: start, end',
          },
        ],
        context.correlationId
      )
    }

    const now = nowIso()
    const today = now.split('T')[0]

    if (body.action === 'start') {
      // Insert new work day or update gcal_event_id if already exists
      await env.DB.prepare(
        `INSERT INTO work_days (date, started_at, gcal_event_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?2, ?2)
         ON CONFLICT(date) DO UPDATE SET
           gcal_event_id = CASE WHEN ?3 IS NOT NULL THEN ?3 ELSE gcal_event_id END,
           updated_at = ?2`
      )
        .bind(today, now, body.gcal_event_id || null)
        .run()
    } else {
      // End action: update ended_at to MAX of existing and now
      await env.DB.prepare(
        `INSERT INTO work_days (date, started_at, ended_at, gcal_event_id, created_at, updated_at)
         VALUES (?1, ?2, ?2, ?3, ?2, ?2)
         ON CONFLICT(date) DO UPDATE SET
           ended_at = CASE WHEN ?2 > COALESCE(ended_at, '') THEN ?2 ELSE ended_at END,
           gcal_event_id = CASE WHEN ?3 IS NOT NULL THEN ?3 ELSE gcal_event_id END,
           updated_at = ?2`
      )
        .bind(today, now, body.gcal_event_id || null)
        .run()
    }

    // Fetch the current state
    const record = await env.DB.prepare('SELECT * FROM work_days WHERE date = ?1')
      .bind(today)
      .first<WorkDayRecord>()

    return jsonResponse(
      {
        work_day: record,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /work-day error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
