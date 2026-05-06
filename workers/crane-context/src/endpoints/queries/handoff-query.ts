/**
 * Handoff history query handler.
 *
 * Implements GET /handoffs — cursor-paginated query across handoff history,
 * supporting five filter modes: by session, by agent, by venture+repo
 * (optionally with issue_number or track), and by date range only.
 * Date filters (created_after, created_before) can combine with any mode.
 */

import type { Env } from '../../types'
import { queryHandoffs } from '../../handoffs'
import { buildRequestContext, isResponse } from '../../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../../utils'
import { HTTP_STATUS } from '../../constants'

// ============================================================================
// Filter type
// ============================================================================

type HandoffQueryFilters = {
  venture?: string
  repo?: string
  issue_number?: number
  track?: number
  session_id?: string
  from_agent?: string
  created_after?: string
  created_before?: string
}

// ============================================================================
// Validation helpers (module-private)
// ============================================================================

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/

type ParseResult<T> = { ok: true; value: T } | { ok: false; response: Response }

function validateDateParam(
  value: string | null,
  field: string,
  correlationId: string
): { ok: true } | { ok: false; response: Response } {
  if (value && !ISO_DATE_PATTERN.test(value)) {
    return {
      ok: false,
      response: validationErrorResponse(
        [{ field, message: 'Must be a valid ISO 8601 date string' }],
        correlationId
      ),
    }
  }
  return { ok: true }
}

function parseLimitParam(limitParam: string | null, correlationId: string): ParseResult<number> {
  if (!limitParam) return { ok: true, value: 20 }
  const parsed = parseInt(limitParam, 10)
  if (isNaN(parsed) || parsed < 1 || parsed > 100) {
    return {
      ok: false,
      response: validationErrorResponse(
        [{ field: 'limit', message: 'Must be an integer between 1 and 100' }],
        correlationId
      ),
    }
  }
  return { ok: true, value: parsed }
}

function parseModeFilters(url: URL, correlationId: string): ParseResult<HandoffQueryFilters> {
  const sessionId = url.searchParams.get('session_id')
  const fromAgent = url.searchParams.get('from_agent')
  const venture = url.searchParams.get('venture')
  const repo = url.searchParams.get('repo')
  const issueNumberParam = url.searchParams.get('issue_number')
  const trackParam = url.searchParams.get('track')
  const createdAfter = url.searchParams.get('created_after')

  if (sessionId) return { ok: true, value: { session_id: sessionId } }
  if (fromAgent) return { ok: true, value: { from_agent: fromAgent } }

  if (venture && repo) {
    const filters: HandoffQueryFilters = { venture, repo }
    if (issueNumberParam) {
      const issueNumber = parseInt(issueNumberParam, 10)
      if (isNaN(issueNumber)) {
        return {
          ok: false,
          response: validationErrorResponse(
            [{ field: 'issue_number', message: 'Must be a valid integer' }],
            correlationId
          ),
        }
      }
      filters.issue_number = issueNumber
    } else if (trackParam) {
      const track = parseInt(trackParam, 10)
      if (isNaN(track)) {
        return {
          ok: false,
          response: validationErrorResponse(
            [{ field: 'track', message: 'Must be a valid integer' }],
            correlationId
          ),
        }
      }
      filters.track = track
    }
    return { ok: true, value: filters }
  }

  // Date-range-only mode
  if (createdAfter) return { ok: true, value: {} }

  return {
    ok: false,
    response: validationErrorResponse(
      [
        {
          field: 'query_params',
          message:
            'Provide session_id OR from_agent OR (venture + repo) with optional issue_number/track OR created_after for date-range query',
        },
      ],
      correlationId
    ),
  }
}

// ============================================================================
// GET /handoffs handler
// ============================================================================

/**
 * GET /handoffs - Query handoff history with cursor-based pagination
 *
 * Supported filter modes (date filters combinable with any mode):
 * - session_id
 * - from_agent
 * - venture + repo (+ optional issue_number or track)
 * - created_after (date-range only)
 *
 * Pagination: cursor + limit (default 20, max 100)
 */
export async function handleQueryHandoffs(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const createdAfter = url.searchParams.get('created_after')
    const createdBefore = url.searchParams.get('created_before')

    const afterCheck = validateDateParam(createdAfter, 'created_after', context.correlationId)
    if (!afterCheck.ok) return afterCheck.response
    const beforeCheck = validateDateParam(createdBefore, 'created_before', context.correlationId)
    if (!beforeCheck.ok) return beforeCheck.response

    const limitResult = parseLimitParam(url.searchParams.get('limit'), context.correlationId)
    if (!limitResult.ok) return limitResult.response

    const modeResult = parseModeFilters(url, context.correlationId)
    if (!modeResult.ok) return modeResult.response

    const filters: HandoffQueryFilters = { ...modeResult.value }
    if (createdAfter) filters.created_after = createdAfter
    if (createdBefore) filters.created_before = createdBefore

    const cursor = url.searchParams.get('cursor') || undefined
    const result = await queryHandoffs(env.DB, filters, { cursor, limit: limitResult.value })

    return jsonResponse(
      {
        handoffs: result.handoffs,
        next_cursor: result.next_cursor,
        has_more: result.has_more,
        count: result.handoffs.length,
        total: result.total,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /handoffs error:', error)
    if (error instanceof Error && error.message.includes('Invalid cursor')) {
      return validationErrorResponse(
        [{ field: 'cursor', message: error.message }],
        context.correlationId
      )
    }
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
