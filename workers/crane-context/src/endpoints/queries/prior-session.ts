/**
 * Prior session query handler.
 *
 * Implements GET /sessions/prior — returns the single most recent ended/abandoned
 * session matching the (agent, venture, repo, [track], [host]) tuple within the
 * last `withinHours` hours. Used by crane_sos to locate a session whose Claude
 * Code JSONL transcript should be parsed for activity backfill.
 */

import type { Env } from '../../types'
import { buildRequestContext, isResponse } from '../../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../../utils'
import { HTTP_STATUS } from '../../constants'

// ============================================================================
// Parameter parsing helpers (module-private)
// ============================================================================

interface PriorSessionParams {
  agent: string
  venture: string
  repo: string
  track: number | null
  host: string | null
  withinHours: number
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; response: Response }

function parsePriorSessionParams(url: URL, correlationId: string): ParseResult<PriorSessionParams> {
  const agent = url.searchParams.get('agent')
  const venture = url.searchParams.get('venture')
  const repo = url.searchParams.get('repo')

  if (!agent || !venture || !repo) {
    return {
      ok: false,
      response: validationErrorResponse(
        [{ field: 'agent,venture,repo', message: 'All three are required' }],
        correlationId
      ),
    }
  }

  const trackParam = url.searchParams.get('track')
  let track: number | null = null
  if (trackParam !== null) {
    const parsed = parseInt(trackParam, 10)
    if (isNaN(parsed)) {
      return {
        ok: false,
        response: validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          correlationId
        ),
      }
    }
    track = parsed
  }

  const withinHoursParam = url.searchParams.get('within_hours')
  const withinHours = withinHoursParam ? parseInt(withinHoursParam, 10) : 48
  if (isNaN(withinHours) || withinHours < 1 || withinHours > 720) {
    return {
      ok: false,
      response: validationErrorResponse(
        [{ field: 'within_hours', message: 'Must be 1..720' }],
        correlationId
      ),
    }
  }

  return {
    ok: true,
    value: { agent, venture, repo, track, host: url.searchParams.get('host'), withinHours },
  }
}

// ============================================================================
// Query builder (module-private)
// ============================================================================

async function queryPriorSession(db: Env['DB'], params: PriorSessionParams): Promise<unknown> {
  const cutoff = new Date(Date.now() - params.withinHours * 60 * 60 * 1000).toISOString()

  let sql = `
    SELECT * FROM sessions
    WHERE status IN ('ended', 'abandoned')
      AND agent = ?
      AND venture = ?
      AND repo = ?
      AND ended_at >= ?
  `
  const bindings: (string | number | null)[] = [params.agent, params.venture, params.repo, cutoff]
  if (params.track !== null) {
    sql += ' AND track = ?'
    bindings.push(params.track)
  }
  if (params.host) {
    sql += ' AND host = ?'
    bindings.push(params.host)
  }
  sql += ' ORDER BY ended_at DESC LIMIT 1'

  return db
    .prepare(sql)
    .bind(...bindings)
    .first()
}

// ============================================================================
// GET /sessions/prior handler
// ============================================================================

/**
 * GET /sessions/prior - return the single most recent ended/abandoned session
 * matching the (agent, venture, repo, [track], [host]) tuple within the last
 * `withinHours` hours (default 48). Used by crane_sos to locate a session
 * whose Claude Code JSONL transcript should be parsed for activity backfill.
 *
 * Returns 200 with `{ session: SessionRecord | null }` — null when no candidate
 * exists. Never 404 (callers always treat null as "no backfill needed").
 */
export async function handleGetPriorSession(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const parsed = parsePriorSessionParams(url, context.correlationId)
    if (!parsed.ok) {
      return parsed.response
    }

    const row = await queryPriorSession(env.DB, parsed.value)

    return jsonResponse(
      { session: row || null, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /sessions/prior error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
