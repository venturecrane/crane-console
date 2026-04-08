/**
 * Crane Context Worker - Deploy Heartbeats Endpoints
 *
 * Plan §B.6. Surfaces the deploy_heartbeats DAL via HTTP for the
 * `crane_deploy_heartbeat` MCP tool and the System Health check.
 *
 *   GET    /deploy-heartbeats?venture=X         - list (with cold flag)
 *   POST   /deploy-heartbeats/observe-commit    - record a push event
 *   POST   /deploy-heartbeats/observe-run       - record a workflow_run
 *   POST   /deploy-heartbeats/suppress          - suppress a heartbeat
 *   POST   /deploy-heartbeats/unsuppress        - reverse a suppression
 *   POST   /deploy-heartbeats/threshold         - set per-row threshold
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS } from '../constants'
import {
  recordCommit,
  recordRun,
  listHeartbeats,
  findColdHeartbeats,
  findStaleWebhookHeartbeats,
  suppressHeartbeat,
  unsuppressHeartbeat,
  setColdThreshold,
  isHeartbeatCold,
} from '../deploy-heartbeats'

// ============================================================================
// GET /deploy-heartbeats
// ============================================================================

export async function handleListDeployHeartbeats(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const url = new URL(request.url)
    const venture = url.searchParams.get('venture')
    if (!venture) {
      return validationErrorResponse(
        [{ field: 'venture', message: 'Required query parameter' }],
        context.correlationId
      )
    }

    const now = new Date()
    const all = await listHeartbeats(env.DB, venture)
    const cold = await findColdHeartbeats(env.DB, venture, now)
    const staleWebhooks = await findStaleWebhookHeartbeats(env.DB, venture, 12, now)

    return jsonResponse(
      {
        venture,
        heartbeats: all.map((hb) => ({
          ...hb,
          is_cold: isHeartbeatCold(hb, now),
        })),
        cold,
        stale_webhooks: staleWebhooks,
        suppressed: all.filter((hb) => hb.suppressed === 1),
        window: {
          stale_webhook_hours: 12,
        },
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /deploy-heartbeats error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /deploy-heartbeats/observe-commit
// ============================================================================

interface ObserveCommitBody {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  commit_at: string
  commit_sha: string
  cold_threshold_days?: number
}

export async function handleObserveCommit(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as ObserveCommitBody
    const errors: { field: string; message: string }[] = []
    if (!body.venture) errors.push({ field: 'venture', message: 'Required' })
    if (!body.repo_full_name) errors.push({ field: 'repo_full_name', message: 'Required' })
    if (typeof body.workflow_id !== 'number')
      errors.push({ field: 'workflow_id', message: 'Required number' })
    if (!body.commit_at) errors.push({ field: 'commit_at', message: 'Required ISO8601' })
    if (!body.commit_sha) errors.push({ field: 'commit_sha', message: 'Required' })
    if (errors.length > 0) return validationErrorResponse(errors, context.correlationId)

    await recordCommit(
      env.DB,
      {
        venture: body.venture,
        repo_full_name: body.repo_full_name,
        workflow_id: body.workflow_id,
        branch: body.branch,
        commit_at: body.commit_at,
        commit_sha: body.commit_sha,
      },
      body.cold_threshold_days
    )

    return jsonResponse(
      { ok: true, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/observe-commit error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /deploy-heartbeats/observe-run
// ============================================================================

interface ObserveRunBody {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  run_id: number
  run_at: string
  conclusion: string
  head_sha: string | null
  cold_threshold_days?: number
}

export async function handleObserveRun(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as ObserveRunBody
    const errors: { field: string; message: string }[] = []
    if (!body.venture) errors.push({ field: 'venture', message: 'Required' })
    if (!body.repo_full_name) errors.push({ field: 'repo_full_name', message: 'Required' })
    if (typeof body.workflow_id !== 'number')
      errors.push({ field: 'workflow_id', message: 'Required number' })
    if (typeof body.run_id !== 'number')
      errors.push({ field: 'run_id', message: 'Required number' })
    if (!body.run_at) errors.push({ field: 'run_at', message: 'Required ISO8601' })
    if (!body.conclusion) errors.push({ field: 'conclusion', message: 'Required' })
    if (errors.length > 0) return validationErrorResponse(errors, context.correlationId)

    await recordRun(
      env.DB,
      {
        venture: body.venture,
        repo_full_name: body.repo_full_name,
        workflow_id: body.workflow_id,
        branch: body.branch,
        run_id: body.run_id,
        run_at: body.run_at,
        conclusion: body.conclusion,
        head_sha: body.head_sha,
      },
      body.cold_threshold_days
    )

    return jsonResponse(
      { ok: true, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/observe-run error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /deploy-heartbeats/suppress
// ============================================================================

interface SuppressBody {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  reason: string
  until?: string | null
}

export async function handleSuppressHeartbeat(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as SuppressBody
    if (
      !body.venture ||
      !body.repo_full_name ||
      typeof body.workflow_id !== 'number' ||
      !body.reason
    ) {
      return validationErrorResponse(
        [{ field: 'body', message: 'Required: venture, repo_full_name, workflow_id, reason' }],
        context.correlationId
      )
    }
    await suppressHeartbeat(env.DB, body)
    return jsonResponse(
      { ok: true, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/suppress error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /deploy-heartbeats/unsuppress
// ============================================================================

interface UnsuppressBody {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
}

export async function handleUnsuppressHeartbeat(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as UnsuppressBody
    if (!body.venture || !body.repo_full_name || typeof body.workflow_id !== 'number') {
      return validationErrorResponse(
        [{ field: 'body', message: 'Required: venture, repo_full_name, workflow_id' }],
        context.correlationId
      )
    }
    await unsuppressHeartbeat(env.DB, body)
    return jsonResponse(
      { ok: true, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/unsuppress error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /deploy-heartbeats/threshold
// ============================================================================

interface ThresholdBody {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  cold_threshold_days: number
}

export async function handleSetColdThreshold(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as ThresholdBody
    if (
      !body.venture ||
      !body.repo_full_name ||
      typeof body.workflow_id !== 'number' ||
      typeof body.cold_threshold_days !== 'number'
    ) {
      return validationErrorResponse(
        [
          {
            field: 'body',
            message: 'Required: venture, repo_full_name, workflow_id, cold_threshold_days',
          },
        ],
        context.correlationId
      )
    }
    await setColdThreshold(env.DB, body)
    return jsonResponse(
      { ok: true, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/threshold error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
