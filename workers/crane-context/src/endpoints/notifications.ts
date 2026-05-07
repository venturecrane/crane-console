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
import { HTTP_STATUS, NOTIFICATION_STATUSES } from '../constants'
import type { NotificationStatus } from '../types'
import {
  createNotification,
  listNotifications,
  updateNotificationStatus,
  countNotifications,
  getOldestNotification,
  resolveNotificationsByBranch,
} from '../notifications'
import {
  validateIngestBody,
  routeIngestSource,
  isEarlyResponse,
} from './notifications/ingest-helpers'
import type { IngestBody } from './notifications/ingest-helpers'

// ============================================================================
// Types
// ============================================================================

interface UpdateStatusBody {
  status: 'acked' | 'resolved'
}

interface BranchDeletedBody {
  repo: string
  branch: string
}

// ============================================================================
// POST /notifications/ingest
// ============================================================================

export async function handleIngestNotification(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as IngestBody
    const validationError = validateIngestBody(body, context.correlationId)
    if (validationError) return validationError

    const autoResolveEnabled = env.NOTIFICATIONS_AUTO_RESOLVE_ENABLED === 'true'
    const routed = await routeIngestSource(
      body,
      env.DB,
      autoResolveEnabled,
      context.actorKeyId,
      context.correlationId
    )
    if (isEarlyResponse(routed)) return routed.response

    const { normalized, dedupeHash } = routed

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
    const groupByRaw = url.searchParams.get('group_by') || undefined
    const params = {
      status: url.searchParams.get('status') || undefined,
      severity: url.searchParams.get('severity') || undefined,
      venture: url.searchParams.get('venture') || undefined,
      repo: url.searchParams.get('repo') || undefined,
      source: url.searchParams.get('source') || undefined,
      // Tolerant: only 'venture' triggers the grouped query; anything
      // else is silently ignored so the contract matches the existing
      // pattern for status/severity/etc.
      group_by: groupByRaw === 'venture' ? ('venture' as const) : undefined,
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

// ============================================================================
// POST /notifications/branch-deleted  (Issue #563)
// ============================================================================
//
// Called by crane-watch when GitHub emits a `delete` webhook with
// ref_type=branch. Resolves every open notification whose (repo, branch)
// matches the deleted branch. A deleted branch cannot produce a subsequent
// green workflow_run, so those notifications would otherwise pile up
// forever (see #563 motivation: 415 such rows were cleared by hand during
// the 2026-04-20 triage).

export async function handleBranchDeleted(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as BranchDeletedBody

    if (!body.repo || typeof body.repo !== 'string') {
      return validationErrorResponse(
        [{ field: 'repo', message: 'Required string field' }],
        context.correlationId
      )
    }
    if (!body.branch || typeof body.branch !== 'string') {
      return validationErrorResponse(
        [{ field: 'branch', message: 'Required string field' }],
        context.correlationId
      )
    }

    // Refuse to act on main/master. The caller should never send these
    // (GitHub blocks deleting a default branch), but defense-in-depth: a
    // misconfigured webhook must not silently clear real red signal.
    if (body.branch === 'main' || body.branch === 'master') {
      return jsonResponse(
        {
          ignored: true,
          reason: 'default_branch_refused',
          correlation_id: context.correlationId,
        },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    const result = await resolveNotificationsByBranch(
      env.DB,
      body.repo,
      body.branch,
      'branch_deleted'
    )

    return jsonResponse(
      {
        resolved_count: result.resolved_count,
        matched_ids: result.matched_ids,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /notifications/branch-deleted error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
