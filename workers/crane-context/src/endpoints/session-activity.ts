/**
 * Crane Context Worker - Session Activity Endpoint
 *
 * POST /sessions/:session_id/activity
 *
 * Persists per-minute activity buckets for a session. Source of truth is the
 * Claude Code JSONL transcript; this endpoint accepts batches extracted by
 * crane_sos (for the prior session) and crane_eos (for the current session).
 *
 * The endpoint is keyed by the crane sess_ULID (not client_session_id) because
 * the calling MCP tool always knows which session a batch is for. This avoids
 * the ambiguity of one client_session_id mapping to multiple ended crane
 * sessions over time.
 */

import type { Env } from '../types'
import { getSession } from '../sessions'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse, isValidSessionId } from '../utils'
import { HTTP_STATUS } from '../constants'

interface ActivityEvent {
  ts: string // ISO 8601
}

interface ActivityBody {
  events: ActivityEvent[]
  source?: string // 'cc_jsonl' (default)
}

/** Match the URL pattern for this endpoint. Returns sessionId on match, null otherwise. */
export function matchActivityRoute(pathname: string): string | null {
  const m = pathname.match(/^\/sessions\/([^/]+)\/activity$/)
  return m ? m[1] : null
}

/**
 * Default retention window for session_activity rows.
 * Bounds D1 growth — at the projected ~5MB/year/venture, 180 days is the
 * smallest window that comfortably covers a quarterly client-billing audit
 * cycle plus an earlier reconciliation buffer.
 */
export const ACTIVITY_RETENTION_DAYS = 180

/**
 * Cron sweep: delete session_activity rows older than the retention cutoff.
 * Invoked from the scheduled() handler in index.ts; safe to run repeatedly.
 *
 * @returns number of rows deleted
 */
export async function runActivityRetention(
  db: D1Database,
  retentionDays = ACTIVITY_RETENTION_DAYS
): Promise<{ deleted: number; cutoff: string }> {
  // SQLite has no Date type; minute_bucket is ISO8601 string. Compare lexically
  // against an ISO cutoff floored to minute.
  const cutoffIso =
    new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 16) + ':00Z'

  const result = await db
    .prepare('DELETE FROM session_activity WHERE minute_bucket < ?')
    .bind(cutoffIso)
    .run()

  const deleted = (result.meta as { changes?: number } | undefined)?.changes ?? 0
  if (deleted > 0) {
    console.log('session_activity_retention_sweep', {
      deleted,
      cutoff: cutoffIso,
      retention_days: retentionDays,
    })
  }
  return { deleted, cutoff: cutoffIso }
}

/**
 * Floor an ISO timestamp to the start of its minute, in UTC.
 * "2026-04-29T14:32:47.123Z" → "2026-04-29T14:32:00Z"
 */
export function floorToMinute(iso: string): string {
  // Slice "YYYY-MM-DDTHH:MM" + ":00Z"
  return iso.slice(0, 16) + ':00Z'
}

/**
 * POST /sessions/:session_id/activity
 *
 * Body:
 * {
 *   events: [{ ts: ISO8601 }, ...],
 *   source?: 'cc_jsonl' (default)
 * }
 *
 * Validation:
 * - session_id must match sess_<ULID>
 * - session must exist (404 otherwise)
 *
 * Behavior:
 * - Events outside the session window (ts < created_at OR ts > ended_at when
 *   ended_at is set) are silently dropped and counted in
 *   `skipped_out_of_window`. Practical sources of slop: Claude Code's
 *   session-start hook entries pre-date /sos's recorded created_at by a few
 *   seconds; clock skew; agent restarts mid-/eos. Failing the whole batch
 *   on these would mean every /eos activity write 422s and the work tracking
 *   is silently lost — so we tolerate per-event drops instead.
 * - Floor each in-window ts to minute granularity
 * - INSERT OR IGNORE per minute bucket (PK on (session_id, minute_bucket))
 * - Returns { recorded, skipped, skipped_out_of_window }:
 *     recorded = unique buckets inserted
 *     skipped = duplicate buckets that hit the PK (already recorded)
 *     skipped_out_of_window = events dropped because of session window
 *
 * Auth: X-Relay-Key.
 */
function validateActivityBody(body: Partial<ActivityBody>, correlationId: string): Response | null {
  if (!body || !Array.isArray(body.events)) {
    return validationErrorResponse(
      [{ field: 'events', message: 'Required array of {ts}' }],
      correlationId
    )
  }
  if (body.events.length > 5000) {
    return validationErrorResponse(
      [{ field: 'events', message: 'Maximum 5000 events per request' }],
      correlationId
    )
  }
  for (let i = 0; i < body.events.length; i++) {
    const ev = body.events[i]
    if (!ev || typeof ev.ts !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ev.ts)) {
      return validationErrorResponse(
        [{ field: `events[${i}].ts`, message: 'Required, must be ISO 8601' }],
        correlationId
      )
    }
  }
  return null
}

function filterToWindow(
  events: ActivityEvent[],
  windowStart: string,
  windowEnd: string | null
): { inWindow: ActivityEvent[]; skippedOutOfWindow: number } {
  const inWindow: ActivityEvent[] = []
  let skippedOutOfWindow = 0
  for (const ev of events) {
    if (ev.ts < windowStart || (windowEnd !== null && ev.ts > windowEnd)) {
      skippedOutOfWindow++
    } else {
      inWindow.push(ev)
    }
  }
  return { inWindow, skippedOutOfWindow }
}

async function writeBuckets(
  db: D1Database,
  sessionId: string,
  buckets: Set<string>,
  source: string,
  now: string
): Promise<{ recorded: number; skipped: number }> {
  let recorded = 0
  let skipped = 0
  for (const bucket of buckets) {
    const result = await db
      .prepare(
        'INSERT OR IGNORE INTO session_activity (session_id, minute_bucket, source, recorded_at) VALUES (?, ?, ?, ?)'
      )
      .bind(sessionId, bucket, source, now)
      .run()
    const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0
    if (changes > 0) recorded++
    else skipped++
  }
  return { recorded, skipped }
}

interface WriteActivityOpts {
  sessionId: string
  events: ActivityEvent[]
  windowStart: string
  windowEnd: string | null
  source: string
  correlationId: string
}

async function writeActivityBuckets(env: Env, opts: WriteActivityOpts): Promise<Response> {
  const { sessionId, events, windowStart, windowEnd, source, correlationId } = opts
  const { inWindow, skippedOutOfWindow } = filterToWindow(events, windowStart, windowEnd)
  const buckets = new Set<string>(inWindow.map((ev) => floorToMinute(ev.ts)))

  if (buckets.size === 0) {
    return jsonResponse(
      {
        recorded: 0,
        skipped: 0,
        skipped_out_of_window: skippedOutOfWindow,
        correlation_id: correlationId,
      },
      HTTP_STATUS.OK,
      correlationId
    )
  }

  const now = new Date().toISOString()
  const { recorded, skipped } = await writeBuckets(env.DB, sessionId, buckets, source, now)
  const sortedBuckets = Array.from(buckets).sort()
  console.log('session_activity_write', {
    session_id: sessionId,
    source,
    recorded,
    skipped,
    skipped_out_of_window: skippedOutOfWindow,
    min: sortedBuckets[0],
    max: sortedBuckets[sortedBuckets.length - 1],
    correlation_id: correlationId,
  })
  return jsonResponse(
    { recorded, skipped, skipped_out_of_window: skippedOutOfWindow, correlation_id: correlationId },
    HTTP_STATUS.OK,
    correlationId
  )
}

export async function handlePostSessionActivity(
  request: Request,
  env: Env,
  sessionId: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    if (!isValidSessionId(sessionId)) {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Must match pattern: sess_<ULID>' }],
        context.correlationId
      )
    }

    const body = (await request.json()) as Partial<ActivityBody>
    const bodyError = validateActivityBody(body, context.correlationId)
    if (bodyError) return bodyError

    const events = body.events as ActivityEvent[]
    if (events.length === 0) {
      return jsonResponse(
        { recorded: 0, skipped: 0, correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    const session = await getSession(env.DB, sessionId)
    if (!session) {
      return errorResponse('Session not found', HTTP_STATUS.NOT_FOUND, context.correlationId, {
        session_id: sessionId,
      })
    }

    return await writeActivityBuckets(env, {
      sessionId,
      events,
      windowStart: session.created_at,
      windowEnd: session.ended_at,
      source: body.source || 'cc_jsonl',
      correlationId: context.correlationId,
    })
  } catch (error) {
    console.error('POST /sessions/:id/activity error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
