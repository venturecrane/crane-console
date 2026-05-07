/**
 * Latest handoff query handler.
 *
 * Implements GET /handoffs/latest — returns the most recent handoff matching
 * one of three filter modes: by session_id, by (venture+repo+issue_number),
 * or by (venture+repo+track).
 */

import type { Env } from '../../types'
import { getLatestHandoff } from '../../handoffs'
import { buildRequestContext, isResponse } from '../../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../../utils'
import { HTTP_STATUS } from '../../constants'

// ============================================================================
// Filter type
// ============================================================================

type LatestHandoffFilters = {
  venture?: string
  repo?: string
  issue_number?: number
  track?: number
  session_id?: string
}

// ============================================================================
// Filter parsing helper (module-private)
// ============================================================================

type ParseResult<T> = { ok: true; value: T } | { ok: false; response: Response }

function parseLatestHandoffFilters(
  url: URL,
  correlationId: string
): ParseResult<LatestHandoffFilters> {
  const sessionId = url.searchParams.get('session_id')
  const venture = url.searchParams.get('venture')
  const repo = url.searchParams.get('repo')
  const issueNumberParam = url.searchParams.get('issue_number')
  const trackParam = url.searchParams.get('track')

  if (sessionId) {
    return { ok: true, value: { session_id: sessionId } }
  }

  if (venture && repo && issueNumberParam) {
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
    return { ok: true, value: { venture, repo, issue_number: issueNumber } }
  }

  if (venture && repo && trackParam) {
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
    return { ok: true, value: { venture, repo, track } }
  }

  return {
    ok: false,
    response: validationErrorResponse(
      [
        {
          field: 'query_params',
          message:
            'Provide session_id OR (venture + repo + issue_number) OR (venture + repo + track)',
        },
      ],
      correlationId
    ),
  }
}

// ============================================================================
// GET /handoffs/latest handler
// ============================================================================

/**
 * GET /handoffs/latest - Get most recent handoff for a context
 *
 * Query parameters (multiple modes supported):
 * Mode 1 - By Issue:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - issue_number: number (required)
 *
 * Mode 2 - By Track:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - track: number (required)
 *
 * Mode 3 - By Session:
 *   - session_id: string (required)
 *
 * Response:
 * {
 *   handoff: HandoffRecord | null
 * }
 */
export async function handleGetLatestHandoff(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const parsed = parseLatestHandoffFilters(url, context.correlationId)
    if (!parsed.ok) {
      return parsed.response
    }

    const handoff = await getLatestHandoff(env.DB, parsed.value)

    return jsonResponse(
      { handoff, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /handoffs/latest error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
