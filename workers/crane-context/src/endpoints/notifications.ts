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
import {
  createNotification,
  listNotifications,
  updateNotificationStatus,
  processGreenEvent,
  countNotifications,
  getOldestNotification,
} from '../notifications'
import { normalizeGitHubEvent, computeGitHubDedupeHash } from '../notifications-github'
import { normalizeVercelDeployment, computeVercelDedupeHash } from '../notifications-vercel'
import { classifyGreenEvent, computeGreenDedupeHash } from '../notifications-green'

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

    // Route to appropriate normalizer.
    //
    // Failure path is unchanged from the original behavior. If the failure
    // normalizer returns null AND the auto-resolve feature flag is enabled,
    // we attempt to classify the event as a green and run processGreenEvent.
    // The two paths never interact: a bug in the green classifier cannot
    // misclassify a real failure as green, because the green classifier
    // never runs on payloads the failure path accepted.
    const autoResolveEnabled = env.NOTIFICATIONS_AUTO_RESOLVE_ENABLED === 'true'
    let normalized
    let dedupeHash: string

    if (body.source === 'github') {
      normalized = normalizeGitHubEvent(body.event_type, body.payload)
      if (!normalized) {
        // Failure normalizer returned null. Try the green classifier if the
        // feature flag is enabled.
        if (autoResolveEnabled) {
          const green = classifyGreenEvent('github', body.event_type, body.payload)
          if (green) {
            const greenDedupe = await computeGreenDedupeHash(green)
            const result = await processGreenEvent(env.DB, {
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
              actor_key_id: context.actorKeyId,
            })
            return jsonResponse(
              {
                green_event: true,
                resolved_count: result.resolved_count,
                matched_ids: result.matched_ids,
                green_notification_id: result.green_notification_id,
                duplicate: result.duplicate,
                correlation_id: context.correlationId,
              },
              HTTP_STATUS.OK,
              context.correlationId
            )
          }
        }
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
        if (autoResolveEnabled) {
          const green = classifyGreenEvent('vercel', body.event_type, body.payload)
          if (green) {
            const greenDedupe = await computeGreenDedupeHash(green)
            const result = await processGreenEvent(env.DB, {
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
              deployment_id: green.deployment_id,
              project_name: green.project_name,
              target: green.target,
              actor_key_id: context.actorKeyId,
            })
            return jsonResponse(
              {
                green_event: true,
                resolved_count: result.resolved_count,
                matched_ids: result.matched_ids,
                green_notification_id: result.green_notification_id,
                duplicate: result.duplicate,
                correlation_id: context.correlationId,
              },
              HTTP_STATUS.OK,
              context.correlationId
            )
          }
        }
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

    // Create notification (failure path) — pass through the new structural
    // fields so future greens can match this failure via match_key.
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
      workflow_id: normalized.workflow_id,
      workflow_name: normalized.workflow_name,
      run_id: normalized.run_id,
      head_sha: normalized.head_sha,
      check_suite_id: normalized.check_suite_id,
      check_run_id: normalized.check_run_id,
      app_id: normalized.app_id,
      app_name: normalized.app_name,
      deployment_id: normalized.deployment_id,
      project_name: normalized.project_name,
      target: normalized.target,
      match_key: normalized.match_key,
      match_key_version: normalized.match_key_version,
      run_started_at: normalized.run_started_at,
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

// ============================================================================
// GET /notifications/counts
// ============================================================================
//
// Plan §B.3: returns true counts (not paginated slices) so the SOS can show
// "270 alerts (12 critical, 45 warning)" instead of `${array.length}` from a
// limit:10 query. This is the missing endpoint that fixes defect #1.

export async function handleNotificationCounts(request: Request, env: Env): Promise<Response> {
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
    }

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

    const result = await countNotifications(env.DB, params)
    return jsonResponse(
      { ...result, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /notifications/counts error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// GET /notifications/oldest
// ============================================================================
//
// Plan §B.7: used by the notification-retention-window health check. If the
// oldest open notification is older than NOTIFICATION_RETENTION_DAYS, the
// retention filter is broken or the auto-resolver is failing.

export async function handleNotificationOldest(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const url = new URL(request.url)
    const params = {
      status: url.searchParams.get('status') || undefined,
      venture: url.searchParams.get('venture') || undefined,
      severity: url.searchParams.get('severity') || undefined,
    }

    const oldest = await getOldestNotification(env.DB, params)
    return jsonResponse(
      {
        notification: oldest,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /notifications/oldest error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
