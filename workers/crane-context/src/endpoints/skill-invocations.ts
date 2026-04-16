/**
 * Crane Context Worker - Skill Invocation Endpoints
 *
 * Handlers for recording and querying skill invocation telemetry.
 * POST /skills/invocations  — record a skill invocation
 * GET  /skills/usage        — aggregate usage stats by skill
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS } from '../constants'
import { ulid } from 'ulidx'

// ============================================================================
// Types
// ============================================================================

interface RecordSkillInvocationBody {
  skill_name: string
  session_id?: string
  venture?: string
  repo?: string
  status?: 'started' | 'completed' | 'failed'
  duration_ms?: number
  error_message?: string
}

// ============================================================================
// POST /skills/invocations — Record a Skill Invocation
// ============================================================================

export async function handleRecordSkillInvocation(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as RecordSkillInvocationBody

    if (!body.skill_name || typeof body.skill_name !== 'string') {
      return validationErrorResponse(
        [{ field: 'skill_name', message: 'Required string field' }],
        context.correlationId
      )
    }

    const validStatuses = ['started', 'completed', 'failed']
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      return validationErrorResponse(
        [{ field: 'status', message: 'Must be one of: started, completed, failed' }],
        context.correlationId
      )
    }

    const id = `inv_${ulid()}`
    const now = new Date().toISOString()
    const status = body.status ?? 'started'

    await env.DB.prepare(
      `INSERT INTO skill_invocations
        (id, skill_name, session_id, venture, repo, status, duration_ms, error_message, created_at, updated_at, actor_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        body.skill_name,
        body.session_id ?? null,
        body.venture ?? null,
        body.repo ?? null,
        status,
        body.duration_ms ?? null,
        body.error_message ?? null,
        now,
        now,
        context.actorKeyId
      )
      .run()

    return jsonResponse(
      {
        invocation: {
          id,
          skill_name: body.skill_name,
          status,
          created_at: now,
        },
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.CREATED,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /skills/invocations error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /skills/usage — Aggregate Usage Stats
// ============================================================================

export async function handleGetSkillUsage(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const sinceParam = url.searchParams.get('since') ?? '30d'
    const skillName = url.searchParams.get('skill_name') || undefined

    // Resolve since param: ISO date string or relative like "30d" / "90d"
    let sinceDate: string
    const relativeMatch = sinceParam.match(/^(\d+)d$/)
    if (relativeMatch) {
      const days = parseInt(relativeMatch[1], 10)
      const d = new Date()
      d.setDate(d.getDate() - days)
      sinceDate = d.toISOString()
    } else {
      // Treat as ISO date string — validate it parses cleanly
      const parsed = new Date(sinceParam)
      if (isNaN(parsed.getTime())) {
        return validationErrorResponse(
          [{ field: 'since', message: 'Must be an ISO date string or relative format like "30d"' }],
          context.correlationId
        )
      }
      sinceDate = parsed.toISOString()
    }

    let result: D1Result<{ skill_name: string; invocation_count: number; last_invoked_at: string }>

    if (skillName) {
      result = await env.DB.prepare(
        `SELECT skill_name,
                COUNT(*) AS invocation_count,
                MAX(created_at) AS last_invoked_at
           FROM skill_invocations
          WHERE created_at >= ?
            AND skill_name = ?
          GROUP BY skill_name
          ORDER BY invocation_count DESC`
      )
        .bind(sinceDate, skillName)
        .all()
    } else {
      result = await env.DB.prepare(
        `SELECT skill_name,
                COUNT(*) AS invocation_count,
                MAX(created_at) AS last_invoked_at
           FROM skill_invocations
          WHERE created_at >= ?
          GROUP BY skill_name
          ORDER BY invocation_count DESC`
      )
        .bind(sinceDate)
        .all()
    }

    return jsonResponse(
      {
        since: sinceDate,
        stats: result.results,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /skills/usage error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
