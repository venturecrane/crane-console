/**
 * Crane Context Worker - Memory Invocation Endpoints
 *
 * Handlers for recording and querying memory invocation telemetry.
 * POST /memory/invocations     — record an event
 * GET  /memory/invocations     — usage query for a specific memory_id
 * GET  /memory/invocations/all — fleet-wide usage grouped by memory_id
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS } from '../constants'
import { ulid } from 'ulidx'

// ============================================================================
// Types
// ============================================================================

const VALID_EVENTS = ['surfaced', 'cited', 'parse_error'] as const
type MemoryEvent = (typeof VALID_EVENTS)[number]

interface RecordMemoryInvocationBody {
  memory_id: string
  event: MemoryEvent
  session_id?: string
  venture?: string
  repo?: string
}

// ============================================================================
// POST /memory/invocations — Record a Memory Invocation
// ============================================================================

export async function handleRecordMemoryInvocation(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as RecordMemoryInvocationBody

    if (!body.memory_id || typeof body.memory_id !== 'string') {
      return validationErrorResponse(
        [{ field: 'memory_id', message: 'Required string field' }],
        context.correlationId
      )
    }

    if (!body.event || !VALID_EVENTS.includes(body.event as MemoryEvent)) {
      return validationErrorResponse(
        [{ field: 'event', message: 'Must be one of: surfaced, cited, parse_error' }],
        context.correlationId
      )
    }

    const id = `minv_${ulid()}`
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO memory_invocations
        (id, memory_id, event, session_id, venture, repo, actor_key_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.memory_id,
        body.event,
        body.session_id ?? null,
        body.venture ?? null,
        body.repo ?? null,
        context.actorKeyId,
        now
      )
      .run()

    return jsonResponse(
      {
        invocation: {
          id,
          memory_id: body.memory_id,
          event: body.event,
          created_at: now,
        },
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.CREATED,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /memory/invocations error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /memory/invocations?memory_id=...&since=... — Usage Query
// ============================================================================

export async function handleGetMemoryInvocations(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const memoryId = url.searchParams.get('memory_id')
    const sinceParam = url.searchParams.get('since') ?? '30d'

    if (!memoryId) {
      return validationErrorResponse(
        [{ field: 'memory_id', message: 'Required query parameter' }],
        context.correlationId
      )
    }

    const sinceDate = resolveSinceParam(sinceParam)
    if (!sinceDate) {
      return validationErrorResponse(
        [{ field: 'since', message: 'Must be an ISO date string or relative format like "30d"' }],
        context.correlationId
      )
    }

    const result = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN event = 'surfaced' THEN 1 ELSE 0 END) AS total_surfaced,
         SUM(CASE WHEN event = 'cited' THEN 1 ELSE 0 END) AS total_cited,
         SUM(CASE WHEN event = 'parse_error' THEN 1 ELSE 0 END) AS total_parse_error
       FROM memory_invocations
       WHERE memory_id = ?
         AND created_at >= ?`
    )
      .bind(memoryId, sinceDate)
      .first<{ total_surfaced: number; total_cited: number; total_parse_error: number }>()

    const recentEvents = await env.DB.prepare(
      `SELECT id, event, session_id, venture, repo, created_at
       FROM memory_invocations
       WHERE memory_id = ?
         AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
      .bind(memoryId, sinceDate)
      .all()

    return jsonResponse(
      {
        memory_id: memoryId,
        since: sinceDate,
        totals: {
          total_surfaced: result?.total_surfaced ?? 0,
          total_cited: result?.total_cited ?? 0,
          total_parse_error: result?.total_parse_error ?? 0,
        },
        recent_events: recentEvents.results,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /memory/invocations error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /memory/invocations/all?since=... — Fleet-Wide Usage
// ============================================================================

export async function handleGetAllMemoryInvocations(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const sinceParam = url.searchParams.get('since') ?? '30d'

    const sinceDate = resolveSinceParam(sinceParam)
    if (!sinceDate) {
      return validationErrorResponse(
        [{ field: 'since', message: 'Must be an ISO date string or relative format like "30d"' }],
        context.correlationId
      )
    }

    const result = await env.DB.prepare(
      `SELECT
         memory_id,
         SUM(CASE WHEN event = 'surfaced' THEN 1 ELSE 0 END) AS total_surfaced,
         SUM(CASE WHEN event = 'cited' THEN 1 ELSE 0 END) AS total_cited,
         SUM(CASE WHEN event = 'parse_error' THEN 1 ELSE 0 END) AS total_parse_error,
         COUNT(*) AS total_events,
         MAX(created_at) AS last_event_at
       FROM memory_invocations
       WHERE created_at >= ?
       GROUP BY memory_id
       ORDER BY total_events DESC`
    )
      .bind(sinceDate)
      .all<{
        memory_id: string
        total_surfaced: number
        total_cited: number
        total_parse_error: number
        total_events: number
        last_event_at: string
      }>()

    return jsonResponse(
      {
        since: sinceDate,
        stats: result.results,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /memory/invocations/all error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

function resolveSinceParam(sinceParam: string): string | null {
  const relativeMatch = sinceParam.match(/^(\d+)d$/)
  if (relativeMatch) {
    const days = parseInt(relativeMatch[1], 10)
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }
  const parsed = new Date(sinceParam)
  if (isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString()
}
