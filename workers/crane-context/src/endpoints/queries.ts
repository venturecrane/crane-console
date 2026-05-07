/**
 * Crane Context Worker - Query Endpoints
 *
 * Handlers for GET /active, /sessions/prior, /handoffs/latest, /handoffs,
 * POST /handoffs/:id/status, GET /docs, GET /docs/audit, GET /docs/:scope/:doc_name,
 * GET /ventures, GET /sessions/history.
 *
 * Implements query patterns from ADR 025.
 *
 * Large handlers and utilities are split into focused sub-modules under
 * ./queries/ to meet per-file and per-function line/complexity limits.
 * All public exports remain at this path for backward compatibility.
 */

import type { Env } from '../types'
import { findActiveSessions } from '../sessions'
import { updateHandoffStatus } from '../handoffs'
import { fetchDocsMetadata, fetchDoc } from '../docs'
import { runDocAudit, runDocAuditAll } from '../audit'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS, VENTURE_CONFIG } from '../constants'

// Sub-module re-exports (preserves public API surface)
export {
  buildActivityRanges,
  mergeSessionsIntoBlocks,
  handleGetSessionHistory,
} from './queries/session-history'
export type { SessionForMerge } from './queries/session-history'
export { handleGetPriorSession } from './queries/prior-session'
export { handleGetLatestHandoff } from './queries/handoff-latest'
export { handleQueryHandoffs } from './queries/handoff-query'

// ============================================================================
// GET /active - Query Active Sessions
// ============================================================================

/**
 * GET /active - Query active sessions by filters
 *
 * Query parameters (all optional):
 * - agent, venture, repo, track
 *
 * Response: { sessions: SessionRecord[], count: number }
 */
export async function handleGetActiveSessions(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const agent = url.searchParams.get('agent') || null
    const venture = url.searchParams.get('venture') || null
    const repo = url.searchParams.get('repo') || null
    const trackParam = url.searchParams.get('track')

    let track: number | null = null
    if (trackParam !== null) {
      const parsedTrack = parseInt(trackParam, 10)
      if (isNaN(parsedTrack)) {
        return validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          context.correlationId
        )
      }
      track = parsedTrack
    }

    const sessions = await findActiveSessions(env.DB, agent, venture, repo, track)

    return jsonResponse(
      { sessions, count: sessions.length, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /active error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /handoffs/:id/status - Update Handoff Status
// ============================================================================

/**
 * POST /handoffs/:id/status - Update status_label on an existing handoff
 *
 * Body: { status_label: "done" | "in_progress" | "blocked" | "ready" }
 * Response: { handoff: HandoffRecord }
 */
export async function handleUpdateHandoffStatus(
  request: Request,
  env: Env,
  handoffId: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as { status_label?: string }

    if (!body.status_label || typeof body.status_label !== 'string') {
      return validationErrorResponse(
        [{ field: 'status_label', message: 'Required string field' }],
        context.correlationId
      )
    }

    const validStatuses = ['done', 'in_progress', 'blocked', 'ready']
    if (!validStatuses.includes(body.status_label)) {
      return validationErrorResponse(
        [{ field: 'status_label', message: `Must be one of: ${validStatuses.join(', ')}` }],
        context.correlationId
      )
    }

    const handoff = await updateHandoffStatus(env.DB, handoffId, body.status_label)

    if (!handoff) {
      return errorResponse('Handoff not found', HTTP_STATUS.NOT_FOUND, context.correlationId, {
        handoff_id: handoffId,
      })
    }

    return jsonResponse(
      { handoff, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /handoffs/:id/status error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /docs - List Documents (Public)
// ============================================================================

/**
 * GET /docs - List document metadata for a venture
 *
 * Query parameters: venture (required)
 * Response: { docs: Array<{ scope, doc_name, content_hash, title, version }>, count: number }
 */
export async function handleListDocsPublic(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const venture = url.searchParams.get('venture')

    if (!venture) {
      return validationErrorResponse(
        [{ field: 'venture', message: 'Required query parameter' }],
        context.correlationId
      )
    }

    const result = await fetchDocsMetadata(env.DB, venture)

    return jsonResponse(
      { docs: result.docs, count: result.count, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /docs error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /ventures - List Ventures (Public, No Auth)
// ============================================================================

/**
 * GET /ventures - List all ventures with metadata
 *
 * No authentication required — public configuration data.
 * Response: { ventures: Array<{ code, name, org }> }
 */
export async function handleGetVentures(): Promise<Response> {
  const ventures = Object.entries(VENTURE_CONFIG).map(([code, config]) => ({
    code,
    ...config,
  }))

  return jsonResponse({ ventures }, HTTP_STATUS.OK)
}

// ============================================================================
// GET /docs/audit - Documentation Audit
// ============================================================================

/**
 * GET /docs/audit - Run documentation audit for a venture or all ventures
 *
 * Query parameters: venture (optional — if omitted, audits all ventures)
 * Response: { audit: DocAuditResult } or { audits: DocAuditResult[] }
 */
export async function handleDocAudit(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const venture = url.searchParams.get('venture')

    if (venture) {
      const result = await runDocAudit(env.DB, venture)
      return jsonResponse(
        { audit: result, correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    const results = await runDocAuditAll(env.DB)
    return jsonResponse(
      { audits: results, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /docs/audit error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /docs/:scope/:doc_name - Get Single Document (Public)
// ============================================================================

/**
 * GET /docs/:scope/:doc_name - Fetch a single document with content
 *
 * Path parameters: scope (global or venture code), doc_name
 * Response: { doc: { scope, doc_name, content, content_hash, title, description, version } | null }
 */
export async function handleGetDoc(
  request: Request,
  env: Env,
  scope: string,
  docName: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const doc = await fetchDoc(env.DB, scope, docName)

    if (!doc) {
      return errorResponse(
        `Document not found: ${scope}/${docName}`,
        HTTP_STATUS.NOT_FOUND,
        context.correlationId
      )
    }

    return jsonResponse(
      { doc, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /docs/:scope/:doc_name error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
