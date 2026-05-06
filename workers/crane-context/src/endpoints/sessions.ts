/**
 * Crane Context Worker - Session Lifecycle Endpoints
 *
 * Handlers for POST /sos, /eos, /update, /heartbeat, /checkpoint
 * and GET /checkpoints, /siblings.
 * Implements session lifecycle patterns from ADR 025.
 *
 * Large handlers are split into focused sub-modules under ./sessions/
 * to meet per-file and per-function line/complexity limits.
 * All public exports remain at this path for backward compatibility.
 */

import type { Env } from '../types'
import {
  resumeOrCreateSession,
  getSession,
  updateSession,
  updateHeartbeat,
  calculateNextHeartbeat,
  getSiblingSessionSummaries,
} from '../sessions'
import { createCheckpoint, getCheckpoints } from '../checkpoints'
import { extractIdempotencyKey, handleIdempotentRequest, storeIdempotencyKey } from '../idempotency'
import { buildRequestContext, isResponse } from '../auth'
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  payloadTooLargeResponse,
  isValidSessionId,
} from '../utils'
import { HTTP_STATUS, MAX_REQUEST_BODY_SIZE } from '../constants'
import { touchMachineByHostname } from '../machines'
import { fetchSosContext } from './sessions/sos-context'
import { buildSosResponse } from './sessions/sos-response'
import { executeEos } from './sessions/eos-core'
import { validateSosBody, validateEosBody, assertSessionActive } from './sessions/validate'

// Re-export body types (preserves public API surface)
export type {
  StartOfSessionBody,
  EndOfSessionBody,
  UpdateBody,
  HeartbeatBody,
  CheckpointBody,
} from './sessions/validate'

// ============================================================================
// POST /sos - Start of Session (Resume or Create Session)
// ============================================================================

async function parseSosRequest(
  request: Request,
  env: Env,
  correlationId: string
): Promise<
  | Response
  | { body: import('./sessions/validate').StartOfSessionBody; idempotencyKey: string | null }
> {
  const contentLength = request.headers.get('Content-Length')
  if (contentLength && parseInt(contentLength) > MAX_REQUEST_BODY_SIZE) {
    return payloadTooLargeResponse('Request body too large', correlationId, {
      max_size_bytes: MAX_REQUEST_BODY_SIZE,
    })
  }

  const body = (await request.json()) as import('./sessions/validate').StartOfSessionBody
  const validationError = validateSosBody(body, correlationId)
  if (validationError) return validationError

  const idempotencyKey = extractIdempotencyKey(request, body)
  const cached = await handleIdempotentRequest(env.DB, '/sos', idempotencyKey)
  if (cached) return cached

  return { body, idempotencyKey }
}

export async function handleStartOfSession(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const prelude = await parseSosRequest(request, env, context.correlationId)
    if (isResponse(prelude)) return prelude
    const { body, idempotencyKey } = prelude

    const session = await resumeOrCreateSession(env.DB, {
      agent: body.agent,
      client: body.client,
      client_version: body.client_version,
      client_session_id: body.client_session_id,
      host: body.host,
      venture: body.venture,
      repo: body.repo,
      track: body.track,
      issue_number: body.issue_number,
      branch: body.branch,
      commit_sha: body.commit_sha,
      session_group_id: body.session_group_id,
      actor_key_id: context.actorKeyId,
      creation_correlation_id: context.correlationId,
      meta: body.meta,
    })

    if (body.host) {
      touchMachineByHostname(env.DB, body.host).catch((err: unknown) =>
        console.error('Machine heartbeat failed (non-fatal)', {
          correlationId: context.correlationId,
          host: body.host,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      )
    }

    const ctx = await fetchSosContext(env.DB, {
      venture: body.venture,
      repo: body.repo,
      track: body.track,
      includeDocs: body.include_docs !== false,
      docsFormat: body.docs_format ?? 'index',
      includeScripts: body.include_scripts !== false,
      scriptsFormat: body.scripts_format ?? 'index',
      correlationId: context.correlationId,
    })
    const heartbeat = calculateNextHeartbeat()

    const responseData = buildSosResponse(session, heartbeat, ctx, context.correlationId)
    const response = jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId)

    if (idempotencyKey) {
      await storeIdempotencyKey(env.DB, '/sos', idempotencyKey, response, {
        actorKeyId: context.actorKeyId,
        correlationId: context.correlationId,
      })
    }

    return response
  } catch (error) {
    console.error('POST /sos error:', error, (error as Error).stack)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /eos - End of Session
// ============================================================================

export async function handleEndOfSession(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const contentLength = request.headers.get('Content-Length')
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_BODY_SIZE) {
      return payloadTooLargeResponse('Request body too large', context.correlationId, {
        max_size_bytes: MAX_REQUEST_BODY_SIZE,
      })
    }

    const body = (await request.json()) as import('./sessions/validate').EndOfSessionBody
    const validationError = validateEosBody(body, context.correlationId)
    if (validationError) return validationError

    if (!body.payload) body.payload = {}

    const idempotencyKey = extractIdempotencyKey(request, body)
    const cached = await handleIdempotentRequest(env.DB, '/eos', idempotencyKey)
    if (cached) return cached

    const session = await getSession(env.DB, body.session_id)
    const guardError = assertSessionActive(session, body.session_id, context.correlationId)
    if (guardError) return guardError

    return await executeEos({
      db: env.DB,
      body,
      session: session!,
      actorKeyId: context.actorKeyId,
      correlationId: context.correlationId,
      idempotencyKey,
    })
  } catch (error) {
    console.error('POST /eos error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /update - Update Session Fields
// ============================================================================

export async function handleUpdate(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as import('./sessions/validate').UpdateBody

    if (
      !body.session_id ||
      typeof body.session_id !== 'string' ||
      !isValidSessionId(body.session_id)
    ) {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Required, must match pattern: sess_<ULID>' }],
        context.correlationId
      )
    }

    const idempotencyKey = extractIdempotencyKey(request, body)
    const cached = await handleIdempotentRequest(env.DB, '/update', idempotencyKey)
    if (cached) return cached

    const session = await getSession(env.DB, body.session_id)
    const guardError = assertSessionActive(session, body.session_id, context.correlationId)
    if (guardError) return guardError

    const updatedAt = await updateSession(env.DB, body.session_id, {
      branch: body.branch,
      commit_sha: body.commit_sha,
      meta: body.meta,
      client_session_id: body.client_session_id,
    })

    const heartbeat = calculateNextHeartbeat()
    const responseData = {
      session_id: body.session_id,
      updated_at: updatedAt,
      next_heartbeat_at: heartbeat.next_heartbeat_at,
      heartbeat_interval_seconds: heartbeat.heartbeat_interval_seconds,
      correlation_id: context.correlationId,
    }

    const response = jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId)

    if (idempotencyKey) {
      await storeIdempotencyKey(env.DB, '/update', idempotencyKey, response, {
        actorKeyId: context.actorKeyId,
        correlationId: context.correlationId,
      })
    }

    return response
  } catch (error) {
    console.error('POST /update error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /heartbeat - Keep Session Alive
// ============================================================================

export async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as import('./sessions/validate').HeartbeatBody

    if (
      !body.session_id ||
      typeof body.session_id !== 'string' ||
      !isValidSessionId(body.session_id)
    ) {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Required, must match pattern: sess_<ULID>' }],
        context.correlationId
      )
    }

    const session = await getSession(env.DB, body.session_id)
    const guardError = assertSessionActive(session, body.session_id, context.correlationId)
    if (guardError) return guardError

    const lastHeartbeatAt = await updateHeartbeat(env.DB, body.session_id, body.client_session_id)
    const heartbeat = calculateNextHeartbeat()

    return jsonResponse(
      {
        session_id: body.session_id,
        last_heartbeat_at: lastHeartbeatAt,
        next_heartbeat_at: heartbeat.next_heartbeat_at,
        heartbeat_interval_seconds: heartbeat.heartbeat_interval_seconds,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /heartbeat error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /checkpoint - Save Work Progress Mid-Session
// ============================================================================

export async function handleCheckpoint(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as import('./sessions/validate').CheckpointBody

    if (!body.session_id || typeof body.session_id !== 'string') {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Required string field' }],
        context.correlationId
      )
    }
    if (!body.summary || typeof body.summary !== 'string') {
      return validationErrorResponse(
        [{ field: 'summary', message: 'Required string field' }],
        context.correlationId
      )
    }

    const session = await getSession(env.DB, body.session_id)
    const guardError = assertSessionActive(session, body.session_id, context.correlationId)
    if (guardError) return guardError

    const checkpoint = await createCheckpoint(env.DB, {
      session_id: body.session_id,
      venture: session!.venture,
      repo: session!.repo,
      track: session!.track || undefined,
      issue_number: session!.issue_number || undefined,
      branch: session!.branch || undefined,
      commit_sha: session!.commit_sha || undefined,
      summary: body.summary,
      work_completed: body.work_completed,
      blockers: body.blockers,
      next_actions: body.next_actions,
      notes: body.notes,
      actor_key_id: context.actorKeyId,
      correlation_id: context.correlationId,
    })

    await updateHeartbeat(env.DB, body.session_id)

    return jsonResponse(
      {
        checkpoint_id: checkpoint.id,
        checkpoint_number: checkpoint.checkpoint_number,
        session_id: checkpoint.session_id,
        created_at: checkpoint.created_at,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.CREATED,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /checkpoint error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /checkpoints - Query Checkpoints
// ============================================================================

export async function handleGetCheckpoints(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')
    const venture = url.searchParams.get('venture')
    const repo = url.searchParams.get('repo')
    const trackParam = url.searchParams.get('track')
    const limitParam = url.searchParams.get('limit')

    if (!sessionId && !venture) {
      return validationErrorResponse(
        [{ field: 'query_params', message: 'At least session_id or venture is required' }],
        context.correlationId
      )
    }

    let limit = 20
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10)
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return validationErrorResponse(
          [{ field: 'limit', message: 'Must be an integer between 1 and 100' }],
          context.correlationId
        )
      }
      limit = parsedLimit
    }

    let track: number | undefined
    if (trackParam) {
      const parsedTrack = parseInt(trackParam, 10)
      if (isNaN(parsedTrack)) {
        return validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          context.correlationId
        )
      }
      track = parsedTrack
    }

    const checkpoints = await getCheckpoints(
      env.DB,
      {
        session_id: sessionId || undefined,
        venture: venture || undefined,
        repo: repo || undefined,
        track,
      },
      limit
    )

    return jsonResponse(
      { checkpoints, count: checkpoints.length, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /checkpoints error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /siblings - Query Sibling Sessions in Same Group
// ============================================================================

export async function handleGetSiblings(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const url = new URL(request.url)
    const sessionGroupId = url.searchParams.get('session_group_id')
    const excludeSessionId = url.searchParams.get('exclude_session_id')

    if (!sessionGroupId) {
      return validationErrorResponse(
        [{ field: 'session_group_id', message: 'Required query parameter' }],
        context.correlationId
      )
    }

    const siblings = await getSiblingSessionSummaries(
      env.DB,
      sessionGroupId,
      excludeSessionId || undefined
    )

    return jsonResponse(
      {
        siblings,
        count: siblings.length,
        session_group_id: sessionGroupId,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /siblings error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
