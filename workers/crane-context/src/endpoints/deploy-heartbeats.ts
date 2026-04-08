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
  seedHeartbeat,
  isHeartbeatCold,
} from '../deploy-heartbeats'
import {
  adaptPushPayload,
  adaptWorkflowRunPayload,
  defaultColdThresholdDays,
} from '../deploy-heartbeats-github'

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

// ============================================================================
// POST /deploy-heartbeats/seed
// ============================================================================
//
// Seed an empty heartbeat row so subsequent push events have something to
// update. Used during initial rollout (before reconciliation cron exists)
// and by the cron itself once it ships. Idempotent.

interface SeedBody {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch?: string
  cold_threshold_days?: number
}

export async function handleSeedHeartbeat(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const body = (await request.json()) as SeedBody
    if (!body.venture || !body.repo_full_name || typeof body.workflow_id !== 'number') {
      return validationErrorResponse(
        [{ field: 'body', message: 'Required: venture, repo_full_name, workflow_id' }],
        context.correlationId
      )
    }
    await seedHeartbeat(env.DB, body)
    return jsonResponse(
      { ok: true, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/seed error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /deploy-heartbeats/observe-github-workflow-run
// ============================================================================
//
// Plan §B.6. Accepts a raw GitHub `workflow_run` webhook payload from
// crane-watch and converts it via the adapter into a typed run observation
// before recording. The adapter handles venture lookup, default-branch
// filtering, completed-only filtering, and field extraction. Unknown
// ventures and feature-branch runs return 200 ignored — never an error.

export async function handleObserveGithubWorkflowRun(
  request: Request,
  env: Env
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const payload = (await request.json()) as unknown
    const obs = adaptWorkflowRunPayload(payload)

    if (!obs) {
      return jsonResponse(
        { ignored: true, reason: 'not_actionable', correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    await recordRun(env.DB, obs, defaultColdThresholdDays(obs.repo_full_name))

    return jsonResponse(
      {
        ok: true,
        venture: obs.venture,
        repo_full_name: obs.repo_full_name,
        workflow_id: obs.workflow_id,
        run_id: obs.run_id,
        conclusion: obs.conclusion,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/observe-github-workflow-run error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /deploy-heartbeats/observe-github-push
// ============================================================================
//
// Accepts a raw GitHub `push` webhook payload. Records the commit against
// EVERY workflow_id already discovered for the repo+branch. The
// reconciliation cron is responsible for seeding workflow_ids initially;
// pushes only update existing rows. This means a brand-new repo's first
// commit doesn't create heartbeat rows — that's intentional, since we'd
// have no idea which workflows to track until the cron discovers them.

export async function handleObserveGithubPush(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const payload = (await request.json()) as unknown
    const adapted = adaptPushPayload(payload)

    if (!adapted) {
      return jsonResponse(
        { ignored: true, reason: 'not_actionable', correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    // Update last_main_commit_at for every existing heartbeat row that
    // matches (venture, repo, branch). The DAL's recordCommit upserts on
    // the composite key — we have to fan out across the rows that already
    // exist for this repo+branch (one per workflow_id discovered by the cron).
    const existing = await env.DB.prepare(
      `SELECT workflow_id FROM deploy_heartbeats
       WHERE venture = ? AND repo_full_name = ? AND branch = ?`
    )
      .bind(adapted.venture, adapted.repo_full_name, adapted.branch)
      .all<{ workflow_id: number }>()

    const workflows = (existing.results || []) as { workflow_id: number }[]

    if (workflows.length === 0) {
      // No tracked workflows yet for this repo. The reconciliation cron
      // will pick up the commit on its next run; until then, we have
      // nothing to update. Return 200 with a clear reason so the caller
      // can log it without treating it as an error.
      return jsonResponse(
        {
          ignored: true,
          reason: 'no_workflows_tracked',
          venture: adapted.venture,
          repo_full_name: adapted.repo_full_name,
          correlation_id: context.correlationId,
        },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    for (const { workflow_id } of workflows) {
      await recordCommit(
        env.DB,
        {
          venture: adapted.venture,
          repo_full_name: adapted.repo_full_name,
          workflow_id,
          branch: adapted.branch,
          commit_at: adapted.commit_at,
          commit_sha: adapted.commit_sha,
        },
        defaultColdThresholdDays(adapted.repo_full_name)
      )
    }

    return jsonResponse(
      {
        ok: true,
        venture: adapted.venture,
        repo_full_name: adapted.repo_full_name,
        workflows_updated: workflows.length,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /deploy-heartbeats/observe-github-push error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
