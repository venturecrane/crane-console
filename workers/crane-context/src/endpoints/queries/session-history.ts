/**
 * Session history query handler and block-merging utilities.
 *
 * Implements GET /sessions/history (aggregated session history by venture and date)
 * and the block-merging logic used to project activity ranges into contiguous blocks.
 */

import type { Env, SessionHistoryEntry, SessionHistoryBlock } from '../../types'
import { buildRequestContext, isResponse } from '../../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../../utils'
import { HTTP_STATUS } from '../../constants'

// ============================================================================
// Block-merging constants and types
// ============================================================================

/** Gap threshold in milliseconds. Sessions separated by ≤ this are merged into one block. */
export const BLOCK_GAP_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export interface SessionForMerge {
  start: string
  ended_at: string
  display_end: string
  host: string | null
  repo: string | null
  branch: string | null
  issue_number: number | null
}

// ============================================================================
// Block accumulator helpers (module-private)
// ============================================================================

interface BlockAccumulator {
  start: string
  ended_at: string
  display_end: string
  session_count: number
  hosts: Set<string>
  repos: Set<string>
  branches: Set<string>
  issues: Set<number>
}

function newBlock(session: SessionForMerge): BlockAccumulator {
  const block: BlockAccumulator = {
    start: session.start,
    ended_at: session.ended_at,
    display_end: session.display_end,
    session_count: 1,
    hosts: new Set(),
    repos: new Set(),
    branches: new Set(),
    issues: new Set(),
  }
  if (session.host) block.hosts.add(session.host)
  if (session.repo) block.repos.add(session.repo)
  if (session.branch) block.branches.add(session.branch)
  if (session.issue_number) block.issues.add(session.issue_number)
  return block
}

function addToBlock(block: BlockAccumulator, session: SessionForMerge): void {
  if (session.ended_at > block.ended_at) block.ended_at = session.ended_at
  if (session.display_end > block.display_end) block.display_end = session.display_end
  block.session_count++
  if (session.host) block.hosts.add(session.host)
  if (session.repo) block.repos.add(session.repo)
  if (session.branch) block.branches.add(session.branch)
  if (session.issue_number) block.issues.add(session.issue_number)
}

function finalizeBlock(block: BlockAccumulator): SessionHistoryBlock {
  return {
    start: block.start,
    end: block.display_end,
    session_count: block.session_count,
    hosts: Array.from(block.hosts).sort(),
    repos: Array.from(block.repos).sort(),
    branches: Array.from(block.branches).sort(),
    issues: Array.from(block.issues).sort((a, b) => a - b),
  }
}

// ============================================================================
// Exported merging utilities
// ============================================================================

/**
 * Build activity ranges from a sorted list of minute_bucket timestamps.
 * A new range starts when the gap between consecutive buckets exceeds
 * BLOCK_GAP_THRESHOLD_MS, matching the threshold used by mergeSessionsIntoBlocks
 * so within-session and cross-session merging behaviors stay consistent.
 *
 * Each range's `end` is the LAST bucket plus 60s, so a 1-minute range covers
 * its own minute and downstream gap math sees a real interval, not a point.
 */
export function buildActivityRanges(buckets: string[]): Array<{ start: string; end: string }> {
  if (buckets.length === 0) return []
  const sorted = [...buckets].sort()
  const ranges: Array<{ start: string; end: string }> = []
  let curStart = sorted[0]
  let curEnd = sorted[0]
  const oneMinMs = 60 * 1000
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    const gap = new Date(cur).getTime() - new Date(curEnd).getTime()
    if (gap > BLOCK_GAP_THRESHOLD_MS) {
      ranges.push({
        start: curStart,
        end: new Date(new Date(curEnd).getTime() + oneMinMs).toISOString(),
      })
      curStart = cur
      curEnd = cur
    } else {
      curEnd = cur
    }
  }
  ranges.push({
    start: curStart,
    end: new Date(new Date(curEnd).getTime() + oneMinMs).toISOString(),
  })
  return ranges
}

/**
 * Merge sessions into contiguous blocks, preserving gaps > 30 minutes.
 *
 * Uses `ended_at` for gap calculation (reliable end time) and
 * `display_end` (last_activity_at || ended_at) for the block's display end time.
 */
export function mergeSessionsIntoBlocks(sessions: SessionForMerge[]): SessionHistoryBlock[] {
  if (sessions.length === 0) return []

  const sorted = [...sessions].sort((a, b) => a.start.localeCompare(b.start))
  const blocks: BlockAccumulator[] = [newBlock(sorted[0])]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const lastBlock = blocks[blocks.length - 1]
    const gap = new Date(current.start).getTime() - new Date(lastBlock.ended_at).getTime()
    if (gap <= BLOCK_GAP_THRESHOLD_MS) {
      addToBlock(lastBlock, current)
    } else {
      blocks.push(newBlock(current))
    }
  }

  return blocks.map(finalizeBlock)
}

// ============================================================================
// Session row type (module-private)
// ============================================================================

interface SessionRow {
  id: string
  venture: string
  created_at: string
  ended_at: string
  last_activity_at: string | null
  host: string | null
  repo: string | null
  branch: string | null
  issue_number: number | null
}

// ============================================================================
// Activity fetch helper
// ============================================================================

async function fetchActivityBySessionId(
  db: Env['DB'],
  rows: SessionRow[]
): Promise<Map<string, string[]>> {
  const activityBySessionId = new Map<string, string[]>()
  if (rows.length === 0) return activityBySessionId

  const sessionIds = rows.map((r) => r.id)
  // D1 caps a single statement at 100 bound parameters, so the session-id
  // list is passed as a JSON array and expanded via json_each() instead of
  // a parameterized IN list. Without this, windows that touch >100 ended
  // sessions return HTTP 500 ("too many SQL variables").
  const actResult = await db
    .prepare(
      `SELECT session_id, minute_bucket
       FROM session_activity
       WHERE session_id IN (SELECT value FROM json_each(?))
       ORDER BY session_id, minute_bucket ASC`
    )
    .bind(JSON.stringify(sessionIds))
    .all<{ session_id: string; minute_bucket: string }>()

  for (const a of actResult.results || []) {
    const list = activityBySessionId.get(a.session_id)
    if (list) {
      list.push(a.minute_bucket)
    } else {
      activityBySessionId.set(a.session_id, [a.minute_bucket])
    }
  }
  return activityBySessionId
}

// ============================================================================
// Grouping helper
// ============================================================================

const AZ_OFFSET_MS = -7 * 60 * 60 * 1000 // Arizona UTC-7 (no DST)
const VENTURE_ALIASES: Record<string, string> = { kidexpenses: 'ke' }

function normalizeVenture(v: string): string {
  const lower = v.toLowerCase()
  return VENTURE_ALIASES[lower] || lower
}

type GroupMap = Map<
  string,
  { venture: string; work_date: string; sessions: SessionForMerge[]; sessionIds: Set<string> }
>

function groupRowsIntoBlocks(
  rows: SessionRow[],
  activityBySessionId: Map<string, string[]>
): GroupMap {
  const groups: GroupMap = new Map()

  for (const row of rows) {
    const createdUtc = new Date(row.created_at)
    const azDate = new Date(createdUtc.getTime() + AZ_OFFSET_MS)
    const workDate = azDate.toISOString().split('T')[0]
    const venture = normalizeVenture(row.venture)
    const key = `${venture}:${workDate}`

    if (!groups.has(key)) {
      groups.set(key, { venture, work_date: workDate, sessions: [], sessionIds: new Set() })
    }

    const group = groups.get(key)!
    group.sessionIds.add(row.id)

    const buckets = activityBySessionId.get(row.id)
    if (buckets && buckets.length > 0) {
      for (const r of buildActivityRanges(buckets)) {
        group.sessions.push({
          start: r.start,
          ended_at: r.end,
          display_end: r.end,
          host: row.host,
          repo: row.repo,
          branch: row.branch,
          issue_number: row.issue_number,
        })
      }
    } else {
      group.sessions.push({
        start: row.created_at,
        ended_at: row.ended_at,
        display_end: row.last_activity_at || row.ended_at,
        host: row.host,
        repo: row.repo,
        branch: row.branch,
        issue_number: row.issue_number,
      })
    }
  }

  return groups
}

// ============================================================================
// GET /sessions/history handler
// ============================================================================

/**
 * GET /sessions/history - Query ended sessions aggregated by venture and date
 *
 * Query parameters:
 * - days: number (optional, default 7) - Number of days to look back
 *
 * Response:
 * {
 *   entries: SessionHistoryEntry[],
 *   count: number
 * }
 *
 * Only includes sessions with status='ended'. Abandoned sessions are excluded
 * because heartbeat data is unreliable.
 *
 * Dates are computed in application layer with UTC-7 offset (Arizona, no DST).
 */
export async function handleGetSessionHistory(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const daysParam = url.searchParams.get('days')
    const days = daysParam ? parseInt(daysParam, 10) : 7

    if (isNaN(days) || days < 1 || days > 90) {
      return validationErrorResponse(
        [{ field: 'days', message: 'Must be an integer between 1 and 90' }],
        context.correlationId
      )
    }

    const cutoff = new Date(Date.now() - days * 86400000).toISOString()

    const result = await env.DB.prepare(
      `SELECT id, venture, created_at, ended_at, last_activity_at, host, repo, branch, issue_number
       FROM sessions
       WHERE status = 'ended'
         AND ended_at IS NOT NULL
         AND created_at >= ?
       ORDER BY created_at ASC`
    )
      .bind(cutoff)
      .all<SessionRow>()

    const rows = result.results || []
    const activityBySessionId = await fetchActivityBySessionId(env.DB, rows)
    const groups = groupRowsIntoBlocks(rows, activityBySessionId)

    const entries: SessionHistoryEntry[] = Array.from(groups.values())
      .map((g) => ({
        venture: g.venture,
        work_date: g.work_date,
        blocks: mergeSessionsIntoBlocks(g.sessions),
        total_sessions: g.sessionIds.size,
      }))
      .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.venture.localeCompare(b.venture))

    return jsonResponse(
      { entries, count: entries.length, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /sessions/history error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
