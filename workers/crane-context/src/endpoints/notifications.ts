/**
 * Crane Context Worker - Notifications Endpoints
 *
 * POST /notifications/ingest  - Receive normalized CI/CD events
 * GET  /notifications         - List/filter notifications
 * POST /notifications/:id/status - Update notification status
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS, NOTIFICATION_SOURCES, NOTIFICATION_STATUSES } from '../constants'
import type { NotificationStatus } from '../types'
import { createNotification, listNotifications, updateNotificationStatus } from '../notifications'
import { normalizeGitHubEvent, computeGitHubDedupeHash } from '../notifications-github'
import { normalizeVercelDeployment, computeVercelDedupeHash } from '../notifications-vercel'

// ============================================================================
// Request Types
// ============================================================================

interface IngestBody {
  source: string
  event_type: string
  delivery_id?: string
  payload: Record<string, unknown>
}

interface UpdateStatusBody {
  status: 'acked' | 'resolved'
}

// ============================================================================
// POST /notifications/ingest
// ============================================================================

export async function handleIngestNotification(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as IngestBody

    // Validate required fields
    if (!body.source || typeof body.source !== 'string') {
      return validationErrorResponse(
        [{ field: 'source', message: 'Required string field' }],
        context.correlationId
      )
    }
    if (!body.event_type || typeof body.event_type !== 'string') {
      return validationErrorResponse(
        [{ field: 'event_type', message: 'Required string field' }],
        context.correlationId
      )
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return validationErrorResponse(
        [{ field: 'payload', message: 'Required object field' }],
        context.correlationId
      )
    }

    // Route to appropriate normalizer
    let normalized
    let dedupeHash: string

    if (body.source === 'github') {
      normalized = normalizeGitHubEvent(body.event_type, body.payload)
      if (!normalized) {
        return jsonResponse(
          { ignored: true, reason: 'event_not_actionable', correlation_id: context.correlationId },
          HTTP_STATUS.OK,
          context.correlationId
        )
      }
      dedupeHash = await computeGitHubDedupeHash(normalized)
    } else if (body.source === 'vercel') {
      normalized = normalizeVercelDeployment(body.event_type, body.payload)
      if (!normalized) {
        return jsonResponse(
          { ignored: true, reason: 'event_not_actionable', correlation_id: context.correlationId },
          HTTP_STATUS.OK,
          context.correlationId
        )
      }
      dedupeHash = await computeVercelDedupeHash(normalized)
    } else {
      return validationErrorResponse(
        [
          {
            field: 'source',
            message: `Unsupported source: ${body.source}. Expected: ${NOTIFICATION_SOURCES.join(', ')}`,
          },
        ],
        context.correlationId
      )
    }

    // Create notification
    const result = await createNotification(env.DB, {
      source: body.source,
      event_type: normalized.event_type,
      severity: normalized.severity,
      summary: normalized.summary,
      details_json: normalized.details_json,
      external_id: body.delivery_id,
      dedupe_hash: dedupeHash,
      venture: normalized.venture,
      repo: normalized.repo,
      branch: normalized.branch,
      environment: normalized.environment,
      actor_key_id: context.actorKeyId,
    })

    if (result.duplicate) {
      return jsonResponse(
        { duplicate: true, correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    return jsonResponse(
      { notification: result.notification, correlation_id: context.correlationId },
      HTTP_STATUS.CREATED,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /notifications/ingest error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message.includes('exceeds')
      ? HTTP_STATUS.BAD_REQUEST
      : HTTP_STATUS.INTERNAL_ERROR
    return errorResponse(message, status, context.correlationId)
  }
}

// ============================================================================
// GET /notifications
// ============================================================================

export async function handleListNotifications(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const url = new URL(request.url)

    const params = {
      status: url.searchParams.get('status') || undefined,
      severity: url.searchParams.get('severity') || undefined,
      venture: url.searchParams.get('venture') || undefined,
      repo: url.searchParams.get('repo') || undefined,
      source: url.searchParams.get('source') || undefined,
      limit: url.searchParams.get('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined,
      cursor: url.searchParams.get('cursor') || undefined,
    }

    // Validate enum params
    if (params.status && !NOTIFICATION_STATUSES.includes(params.status as NotificationStatus)) {
      return validationErrorResponse(
        [
          {
            field: 'status',
            message: `Invalid status. Expected: ${NOTIFICATION_STATUSES.join(', ')}`,
          },
        ],
        context.correlationId
      )
    }

    const result = await listNotifications(env.DB, params)

    return jsonResponse(
      {
        notifications: result.notifications,
        pagination: result.next_cursor ? { next_cursor: result.next_cursor } : undefined,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /notifications error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /notifications/:id/status
// ============================================================================

export async function handleUpdateNotificationStatus(
  request: Request,
  env: Env,
  notificationId: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as UpdateStatusBody

    if (!body.status || !['acked', 'resolved'].includes(body.status)) {
      return validationErrorResponse(
        [{ field: 'status', message: 'Required, must be "acked" or "resolved"' }],
        context.correlationId
      )
    }

    const updated = await updateNotificationStatus(
      env.DB,
      notificationId,
      body.status as NotificationStatus
    )

    if (!updated) {
      return errorResponse(
        `Notification not found: ${notificationId}`,
        HTTP_STATUS.NOT_FOUND,
        context.correlationId
      )
    }

    return jsonResponse(
      { notification: updated, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /notifications/:id/status error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message.includes('Invalid state transition')
      ? HTTP_STATUS.CONFLICT
      : HTTP_STATUS.INTERNAL_ERROR
    return errorResponse(message, status, context.correlationId)
  }
}
