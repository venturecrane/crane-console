/**
 * Crane Context Worker - Planned Events Endpoints
 *
 * CRUD for planned and actual work events used by /calendar-sync.
 * Tracks Google Calendar event IDs and sync state.
 */

import type { Env, PlannedEventRecord } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse, nowIso } from '../utils'
import { HTTP_STATUS, ID_PREFIXES } from '../constants'
import { ulid } from 'ulidx'

// ============================================================================
// Request Types
// ============================================================================

interface CreatePlannedEventBody {
  event_date: string
  venture: string
  title: string
  start_time: string
  end_time: string
  gcal_event_id?: string | null
  type?: 'planned' | 'actual' | 'cancelled'
}

interface UpdatePlannedEventBody {
  title?: string
  type?: 'planned' | 'actual' | 'cancelled'
  start_time?: string
  end_time?: string
  sync_status?: 'pending' | 'synced' | 'error'
  gcal_event_id?: string | null
}

// ============================================================================
// GET /planned-events - List planned events in a date range
// ============================================================================

export async function handleGetPlannedEvents(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const type = url.searchParams.get('type')

    if (!from || !to) {
      return validationErrorResponse(
        [{ field: 'from,to', message: 'Both from and to date parameters are required' }],
        context.correlationId
      )
    }

    let query: string
    const bindings: string[] = [from, to]

    if (type) {
      query =
        'SELECT * FROM planned_events WHERE event_date >= ?1 AND event_date <= ?2 AND type = ?3 ORDER BY event_date ASC'
      bindings.push(type)
    } else {
      query =
        'SELECT * FROM planned_events WHERE event_date >= ?1 AND event_date <= ?2 ORDER BY event_date ASC'
    }

    const result = await env.DB.prepare(query)
      .bind(...bindings)
      .all<PlannedEventRecord>()

    return jsonResponse(
      {
        events: result.results || [],
        count: (result.results || []).length,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /planned-events error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /planned-events - Create a planned event record
// ============================================================================

export async function handleCreatePlannedEvent(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as CreatePlannedEventBody

    // Validate required fields
    const errors: Array<{ field: string; message: string }> = []
    if (!body.event_date) errors.push({ field: 'event_date', message: 'Required' })
    if (!body.venture) errors.push({ field: 'venture', message: 'Required' })
    if (!body.title) errors.push({ field: 'title', message: 'Required' })
    if (!body.start_time) errors.push({ field: 'start_time', message: 'Required' })
    if (!body.end_time) errors.push({ field: 'end_time', message: 'Required' })

    if (errors.length > 0) {
      return validationErrorResponse(errors, context.correlationId)
    }

    const now = nowIso()
    const id = `${ID_PREFIXES.PLANNED_EVENT}${ulid()}`

    await env.DB.prepare(
      `INSERT INTO planned_events (id, event_date, venture, gcal_event_id, title, start_time, end_time, type, sync_status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
    )
      .bind(
        id,
        body.event_date,
        body.venture,
        body.gcal_event_id || null,
        body.title,
        body.start_time,
        body.end_time,
        body.type || 'planned',
        body.gcal_event_id ? 'synced' : 'pending',
        now
      )
      .run()

    const record = await env.DB.prepare('SELECT * FROM planned_events WHERE id = ?1')
      .bind(id)
      .first<PlannedEventRecord>()

    return jsonResponse(
      {
        event: record,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.CREATED,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /planned-events error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// PATCH /planned-events/:id - Update a planned event
// ============================================================================

export async function handleUpdatePlannedEvent(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    // Verify event exists
    const existing = await env.DB.prepare('SELECT id FROM planned_events WHERE id = ?1')
      .bind(id)
      .first<{ id: string }>()

    if (!existing) {
      return errorResponse('Planned event not found', HTTP_STATUS.NOT_FOUND, context.correlationId)
    }

    const body = (await request.json()) as UpdatePlannedEventBody
    const now = nowIso()

    // Build dynamic UPDATE query
    const setClauses: string[] = ['updated_at = ?1']
    const bindings: (string | null)[] = [now]
    let paramIndex = 2

    if (body.title !== undefined) {
      setClauses.push(`title = ?${paramIndex}`)
      bindings.push(body.title)
      paramIndex++
    }
    if (body.type !== undefined) {
      setClauses.push(`type = ?${paramIndex}`)
      bindings.push(body.type)
      paramIndex++
    }
    if (body.start_time !== undefined) {
      setClauses.push(`start_time = ?${paramIndex}`)
      bindings.push(body.start_time)
      paramIndex++
    }
    if (body.end_time !== undefined) {
      setClauses.push(`end_time = ?${paramIndex}`)
      bindings.push(body.end_time)
      paramIndex++
    }
    if (body.sync_status !== undefined) {
      setClauses.push(`sync_status = ?${paramIndex}`)
      bindings.push(body.sync_status)
      paramIndex++
    }
    if (body.gcal_event_id !== undefined) {
      setClauses.push(`gcal_event_id = ?${paramIndex}`)
      bindings.push(body.gcal_event_id)
      paramIndex++
    }

    // Add the WHERE clause binding
    bindings.push(id)

    await env.DB.prepare(
      `UPDATE planned_events SET ${setClauses.join(', ')} WHERE id = ?${paramIndex}`
    )
      .bind(...bindings)
      .run()

    const record = await env.DB.prepare('SELECT * FROM planned_events WHERE id = ?1')
      .bind(id)
      .first<PlannedEventRecord>()

    return jsonResponse(
      {
        event: record,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('PATCH /planned-events/:id error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// DELETE /planned-events - Bulk delete future planned events
// ============================================================================

export async function handleDeletePlannedEvents(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const type = url.searchParams.get('type') || 'planned'

    if (!from) {
      return validationErrorResponse(
        [{ field: 'from', message: 'Required - start date for deletion range' }],
        context.correlationId
      )
    }

    const result = await env.DB.prepare(
      'DELETE FROM planned_events WHERE event_date >= ?1 AND type = ?2'
    )
      .bind(from, type)
      .run()

    return jsonResponse(
      {
        deleted: result.meta.changes || 0,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('DELETE /planned-events error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
