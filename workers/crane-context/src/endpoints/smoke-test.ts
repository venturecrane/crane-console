/**
 * Crane Context Worker - Smoke Test Endpoints
 *
 * Plan v3.1 §D.5 / D-7. Staging-only endpoints that let
 * scripts/smoke-test-e2e.sh verify the auto-resolve mutation path
 * without touching real notifications data.
 *
 *   POST /smoke-test/ingest
 *     Inserts a synthetic notification into smoke_test_notifications.
 *     Body: { event: 'workflow_run', conclusion: 'failure' | 'success',
 *             run_id, workflow_id, head_sha, branch, repo }
 *
 *   POST /smoke-test/purge
 *     Deletes all rows older than 1 hour. Idempotent; safe to call
 *     at every smoke test entry point.
 *
 *   GET /smoke-test/notifications
 *     Lists rows from smoke_test_notifications. Supports status filter.
 *
 * Gated by env.ENVIRONMENT === 'staging'. In production, all three
 * return 403. This is the hard guarantee that mutation smoke tests
 * cannot touch real production data.
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, nowIso, generateNotificationId } from '../utils'
import { HTTP_STATUS } from '../constants'

function assertStaging(env: Env, correlationId: string): Response | null {
  const environment = (env as unknown as { ENVIRONMENT?: string }).ENVIRONMENT
  if (environment !== 'staging') {
    return errorResponse(
      'Smoke test endpoints are staging-only (ENVIRONMENT=production rejected)',
      HTTP_STATUS.UNAUTHORIZED,
      correlationId
    )
  }
  return null
}

// ============================================================================
// POST /smoke-test/purge
// ============================================================================

export async function handleSmokeTestPurge(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context
  const guard = assertStaging(env, context.correlationId)
  if (guard) return guard

  try {
    const cutoff = new Date(Date.now() - 3600_000).toISOString()
    const result = await env.DB.prepare(`DELETE FROM smoke_test_notifications WHERE created_at < ?`)
      .bind(cutoff)
      .run()

    return jsonResponse(
      {
        deleted: result.meta?.changes ?? 0,
        cutoff,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /smoke-test/purge error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /smoke-test/ingest
// ============================================================================

interface SmokeIngestBody {
  event: 'workflow_run'
  conclusion: 'failure' | 'success'
  run_id: number
  workflow_id: number
  head_sha: string
  branch: string
  repo: string
}

export async function handleSmokeTestIngest(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context
  const guard = assertStaging(env, context.correlationId)
  if (guard) return guard

  try {
    const body = (await request.json()) as SmokeIngestBody
    if (!body.event || !body.conclusion || !body.run_id || !body.workflow_id || !body.repo) {
      return errorResponse(
        'Required: event, conclusion, run_id, workflow_id, repo',
        HTTP_STATUS.BAD_REQUEST,
        context.correlationId
      )
    }

    const id = generateNotificationId()
    const now = nowIso()
    const severity = body.conclusion === 'failure' ? 'critical' : 'info'
    const status = body.conclusion === 'failure' ? 'new' : 'resolved'
    const matchKey = `gh:wf:${body.repo}:${body.branch}:${body.workflow_id}`
    const dedupeHash = `smoke:${body.repo}:${body.workflow_id}:${body.run_id}:${body.conclusion}`

    await env.DB.prepare(
      `INSERT INTO smoke_test_notifications (
        id, source, event_type, severity, status, summary, details_json,
        dedupe_hash, venture, repo, branch, created_at, received_at, updated_at,
        actor_key_id, workflow_id, run_id, head_sha, match_key, match_key_version,
        run_started_at
      ) VALUES (?, 'github', ?, ?, ?, ?, ?, ?, 'vc', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v2_id', ?)`
    )
      .bind(
        id,
        `workflow_run.${body.conclusion}`,
        severity,
        status,
        `Smoke test: ${body.repo} ${body.branch} ${body.conclusion}`,
        JSON.stringify({ smoke: true, run_id: body.run_id, head_sha: body.head_sha }),
        dedupeHash,
        body.repo,
        body.branch,
        now,
        now,
        now,
        context.actorKeyId,
        body.workflow_id,
        body.run_id,
        body.head_sha,
        matchKey,
        now
      )
      .run()

    // If this is a success, auto-resolve any prior failures for the same match_key
    let resolvedCount = 0
    if (body.conclusion === 'success') {
      const resolveResult = await env.DB.prepare(
        `UPDATE smoke_test_notifications
         SET status = 'resolved',
             auto_resolved_by_id = ?,
             auto_resolve_reason = 'green_workflow_run',
             resolved_at = ?,
             updated_at = ?
         WHERE match_key = ?
           AND status IN ('new', 'acked')
           AND auto_resolved_by_id IS NULL
           AND id != ?`
      )
        .bind(id, now, now, matchKey, id)
        .run()
      resolvedCount = resolveResult.meta?.changes ?? 0
    }

    return jsonResponse(
      {
        id,
        status,
        match_key: matchKey,
        resolved_count: resolvedCount,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /smoke-test/ingest error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// GET /smoke-test/notifications
// ============================================================================

export async function handleSmokeTestList(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context
  const guard = assertStaging(env, context.correlationId)
  if (guard) return guard

  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const matchKey = url.searchParams.get('match_key')

    const clauses: string[] = []
    const binds: unknown[] = []
    if (status) {
      clauses.push(`status = ?`)
      binds.push(status)
    }
    if (matchKey) {
      clauses.push(`match_key = ?`)
      binds.push(matchKey)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    const result = await env.DB.prepare(
      `SELECT id, source, event_type, severity, status, match_key, run_id,
              auto_resolved_by_id, resolved_at, created_at
       FROM smoke_test_notifications
       ${where}
       ORDER BY created_at DESC
       LIMIT 50`
    )
      .bind(...binds)
      .all()

    return jsonResponse(
      {
        notifications: result.results || [],
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /smoke-test/notifications error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
