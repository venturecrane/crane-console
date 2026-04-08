/**
 * Crane Context Worker - Admin Notifications Endpoints
 *
 * Used by the one-shot backfill CLI in scripts/notifications/backfill-from-github.ts.
 *
 *   GET  /admin/notifications/pending-matches?cursor=&limit=
 *     Paginated list of distinct match_keys with at least one open notification.
 *
 *   POST /admin/notifications/:id/auto-resolve
 *     Resolve a single notification given a GitHub-API-discovered green run.
 *
 *   POST /admin/notifications/backfill-lock/acquire
 *     Acquire the global backfill lock (mutex against concurrent runs).
 *
 *   POST /admin/notifications/backfill-lock/release
 *     Release the global backfill lock.
 *
 * All endpoints require X-Admin-Key auth.
 */

import type { Env } from '../types'
import { HTTP_STATUS } from '../constants'
import { errorResponse, successResponse, generateCorrelationId } from '../utils'
import { verifyAdminKey } from './admin-shared'
import {
  acquireNotificationLock,
  releaseNotificationLock,
  listPendingMatches,
  adminAutoResolveNotification,
} from '../admin-notifications'
import type { NotificationAutoResolveReason } from '../types'

// ============================================================================
// GET /admin/notifications/pending-matches?cursor=&limit=
// ============================================================================

export async function handleListPendingMatches(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor') || undefined
    const limitStr = url.searchParams.get('limit')
    const limit = limitStr ? parseInt(limitStr, 10) : undefined

    if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 500)) {
      return errorResponse(
        'limit must be between 1 and 500',
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    const result = await listPendingMatches(env.DB, { cursor, limit })

    return successResponse(
      {
        matches: result.matches,
        pagination: result.next_cursor ? { next_cursor: result.next_cursor } : undefined,
      },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('GET /admin/notifications/pending-matches error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}

// ============================================================================
// POST /admin/notifications/:id/auto-resolve
// ============================================================================

interface AdminAutoResolveBody {
  matched_run_id: number | string
  matched_run_url: string
  matched_run_started_at: string
  reason?: NotificationAutoResolveReason
}

export async function handleAdminAutoResolveNotification(
  request: Request,
  env: Env,
  notificationId: string
): Promise<Response> {
  const correlationId = generateCorrelationId()
  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    const body = (await request.json()) as AdminAutoResolveBody

    if (body.matched_run_id === undefined || body.matched_run_id === null) {
      return errorResponse('matched_run_id is required', HTTP_STATUS.BAD_REQUEST, correlationId)
    }
    if (!body.matched_run_url || typeof body.matched_run_url !== 'string') {
      return errorResponse('matched_run_url is required', HTTP_STATUS.BAD_REQUEST, correlationId)
    }
    if (!body.matched_run_started_at || typeof body.matched_run_started_at !== 'string') {
      return errorResponse(
        'matched_run_started_at is required',
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    const reason = body.reason ?? 'github_api_backfill'

    const result = await adminAutoResolveNotification(env.DB, {
      notification_id: notificationId,
      matched_run_id: body.matched_run_id,
      matched_run_url: body.matched_run_url,
      matched_run_started_at: body.matched_run_started_at,
      reason,
      // The admin key holder is the actor for backfill resolves.
      actor_key_id: 'admin-backfill',
    })

    if (!result.ok) {
      return errorResponse(
        result.reason ?? 'auto-resolve failed',
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    return successResponse(
      {
        ok: true,
        already_resolved: result.already_resolved,
        resolved_id: result.resolved_id,
        green_notification_id: result.green_notification_id,
      },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('POST /admin/notifications/:id/auto-resolve error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}

// ============================================================================
// POST /admin/notifications/backfill-lock/acquire
// ============================================================================

interface AcquireLockBody {
  holder: string
  ttl_seconds?: number
  metadata?: Record<string, unknown>
}

export async function handleAcquireBackfillLock(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    const body = (await request.json()) as AcquireLockBody

    if (!body.holder || typeof body.holder !== 'string') {
      return errorResponse(
        'holder is required (e.g., hostname:pid)',
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    const ttlSeconds = body.ttl_seconds ?? 3600 // 1 hour default
    if (ttlSeconds < 60 || ttlSeconds > 86400) {
      return errorResponse(
        'ttl_seconds must be between 60 and 86400',
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    const result = await acquireNotificationLock(env.DB, {
      name: 'backfill-auto-resolve',
      holder: body.holder,
      ttl_seconds: ttlSeconds,
      metadata_json: body.metadata ? JSON.stringify(body.metadata) : undefined,
    })

    if (!result.acquired) {
      return new Response(
        JSON.stringify({
          acquired: false,
          existing_holder: result.lock?.holder ?? 'unknown',
          existing_expires_at: result.lock?.expires_at ?? 'unknown',
          reason: result.reason ?? 'lock contention',
          correlation_id: correlationId,
        }),
        {
          status: HTTP_STATUS.CONFLICT,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return successResponse(
      {
        acquired: true,
        lock: result.lock,
      },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('POST /admin/notifications/backfill-lock/acquire error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}

// ============================================================================
// POST /admin/notifications/backfill-lock/release
// ============================================================================

interface ReleaseLockBody {
  holder: string
}

export async function handleReleaseBackfillLock(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    const body = (await request.json()) as ReleaseLockBody

    if (!body.holder || typeof body.holder !== 'string') {
      return errorResponse('holder is required', HTTP_STATUS.BAD_REQUEST, correlationId)
    }

    const released = await releaseNotificationLock(env.DB, {
      name: 'backfill-auto-resolve',
      holder: body.holder,
    })

    return successResponse({ released }, HTTP_STATUS.OK, correlationId)
  } catch (error) {
    console.error('POST /admin/notifications/backfill-lock/release error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}
