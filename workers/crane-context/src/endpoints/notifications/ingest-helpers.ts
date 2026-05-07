/**
 * Notifications ingest helpers
 *
 * Extracted from notifications.ts to satisfy structural lint thresholds
 * (max-lines-per-function: 75, complexity: 15, max-depth: 4).
 * All types and logic are internal to the ingest flow — nothing here is
 * a public contract.
 */

import type { Env } from '../../types'
import { jsonResponse, validationErrorResponse } from '../../utils'
import { HTTP_STATUS, NOTIFICATION_SOURCES } from '../../constants'
import { processGreenEvent } from '../../notifications'
import { normalizeGitHubEvent, computeGitHubDedupeHash } from '../../notifications-github'
import { normalizeVercelDeployment, computeVercelDedupeHash } from '../../notifications-vercel'
import { classifyGreenEvent, computeGreenDedupeHash } from '../../notifications-green'

// ============================================================================
// Shared types
// ============================================================================

export interface IngestBody {
  source: string
  event_type: string
  delivery_id?: string
  payload: Record<string, unknown>
}

/** Validated, normalized result from routing the ingest payload. */
export interface RouteResult {
  normalized:
    | NonNullable<ReturnType<typeof normalizeGitHubEvent>>
    | NonNullable<ReturnType<typeof normalizeVercelDeployment>>
  dedupeHash: string
}

/** Early-exit response — returned when the handler should stop and reply. */
export interface EarlyResponse {
  response: Response
}

export function isEarlyResponse(r: RouteResult | EarlyResponse): r is EarlyResponse {
  return 'response' in r
}

// ============================================================================
// Validation
// ============================================================================

export function validateIngestBody(body: IngestBody, correlationId: string): Response | null {
  if (!body.source || typeof body.source !== 'string') {
    return validationErrorResponse(
      [{ field: 'source', message: 'Required string field' }],
      correlationId
    )
  }
  if (!body.event_type || typeof body.event_type !== 'string') {
    return validationErrorResponse(
      [{ field: 'event_type', message: 'Required string field' }],
      correlationId
    )
  }
  if (!body.payload || typeof body.payload !== 'object') {
    return validationErrorResponse(
      [{ field: 'payload', message: 'Required object field' }],
      correlationId
    )
  }
  return null
}

// ============================================================================
// Internal context type (groups DB + caller identity to stay under max-params)
// ============================================================================

interface IngestCtx {
  db: Env['DB']
  actorKeyId: string
  correlationId: string
}

// ============================================================================
// Green event processing
// ============================================================================

async function tryProcessGreen(
  ctx: IngestCtx,
  source: 'github' | 'vercel',
  eventType: string,
  payload: Record<string, unknown>
): Promise<Response | null> {
  const green = classifyGreenEvent(source, eventType, payload)
  if (!green) return null

  const greenDedupe = await computeGreenDedupeHash(green)
  const result = await processGreenEvent(ctx.db, {
    source: green.source,
    event_type: green.event_type,
    match_key: green.match_key,
    match_key_version: green.match_key_version,
    run_started_at: green.run_started_at,
    head_sha: green.head_sha,
    is_schedule_like: green.is_schedule_like,
    repo: green.repo,
    branch: green.branch,
    venture: green.venture,
    details_json: green.details_json,
    summary: green.summary,
    dedupe_hash: greenDedupe,
    auto_resolve_reason: green.auto_resolve_reason,
    workflow_id: green.workflow_id,
    workflow_name: green.workflow_name,
    run_id: green.run_id,
    check_suite_id: green.check_suite_id,
    check_run_id: green.check_run_id,
    app_id: green.app_id,
    app_name: green.app_name,
    deployment_id: green.deployment_id,
    project_name: green.project_name,
    target: green.target,
    actor_key_id: ctx.actorKeyId,
  })

  return jsonResponse(
    {
      green_event: true,
      resolved_count: result.resolved_count,
      matched_ids: result.matched_ids,
      green_notification_id: result.green_notification_id,
      duplicate: result.duplicate,
      correlation_id: ctx.correlationId,
    },
    HTTP_STATUS.OK,
    ctx.correlationId
  )
}

function ignoredResponse(correlationId: string): Response {
  return jsonResponse(
    { ignored: true, reason: 'event_not_actionable', correlation_id: correlationId },
    HTTP_STATUS.OK,
    correlationId
  )
}

// ============================================================================
// Source routing
// ============================================================================

async function routeGitHub(
  body: IngestBody,
  ctx: IngestCtx,
  autoResolveEnabled: boolean
): Promise<RouteResult | EarlyResponse> {
  const normalized = normalizeGitHubEvent(body.event_type, body.payload)
  if (!normalized) {
    if (autoResolveEnabled) {
      const resp = await tryProcessGreen(ctx, 'github', body.event_type, body.payload)
      if (resp) return { response: resp }
    }
    return { response: ignoredResponse(ctx.correlationId) }
  }
  const dedupeHash = await computeGitHubDedupeHash(normalized)
  return { normalized, dedupeHash }
}

async function routeVercel(
  body: IngestBody,
  ctx: IngestCtx,
  autoResolveEnabled: boolean
): Promise<RouteResult | EarlyResponse> {
  const normalized = normalizeVercelDeployment(body.event_type, body.payload)
  if (!normalized) {
    if (autoResolveEnabled) {
      const resp = await tryProcessGreen(ctx, 'vercel', body.event_type, body.payload)
      if (resp) return { response: resp }
    }
    return { response: ignoredResponse(ctx.correlationId) }
  }
  const dedupeHash = await computeVercelDedupeHash(normalized)
  return { normalized, dedupeHash }
}

export async function routeIngestSource(
  body: IngestBody,
  db: Env['DB'],
  autoResolveEnabled: boolean,
  actorKeyId: string,
  correlationId: string
): Promise<RouteResult | EarlyResponse> {
  const ctx: IngestCtx = { db, actorKeyId, correlationId }
  if (body.source === 'github') {
    return routeGitHub(body, ctx, autoResolveEnabled)
  }
  if (body.source === 'vercel') {
    return routeVercel(body, ctx, autoResolveEnabled)
  }
  return {
    response: validationErrorResponse(
      [
        {
          field: 'source',
          message: `Unsupported source: ${body.source}. Expected: ${NOTIFICATION_SOURCES.join(', ')}`,
        },
      ],
      correlationId
    ),
  }
}
