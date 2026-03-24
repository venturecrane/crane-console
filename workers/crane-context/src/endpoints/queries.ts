/**
 * Crane Context Worker - Query Endpoints
 *
 * Handlers for GET /active, /handoffs/latest, /handoffs
 * Implements query patterns from ADR 025.
 */

import type { Env, SessionHistoryEntry, SessionHistoryBlock } from '../types'
import { findActiveSessions } from '../sessions'
import { getLatestHandoff, queryHandoffs } from '../handoffs'
import { fetchDocsMetadata, fetchDoc } from '../docs'
import { runDocAudit, runDocAuditAll } from '../audit'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS, VENTURE_CONFIG } from '../constants'

// ============================================================================
// GET /active - Query Active Sessions
// ============================================================================

/**
 * GET /active - Query active sessions by filters
 *
 * Query parameters:
 * - agent: string (required)
 * - venture: string (required)
 * - repo: string (required)
 * - track?: number (optional)
 *
 * Response:
 * {
 *   sessions: SessionRecord[],
 *   count: number
 * }
 */
export async function handleGetActiveSessions(request: Request, env: Env): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters (all optional for unfiltered queries)
    const url = new URL(request.url)
    const agent = url.searchParams.get('agent') || null
    const venture = url.searchParams.get('venture') || null
    const repo = url.searchParams.get('repo') || null
    const trackParam = url.searchParams.get('track')

    // Parse optional track parameter
    let track: number | null = null
    if (trackParam !== null) {
      const parsedTrack = parseInt(trackParam, 10)
      if (isNaN(parsedTrack)) {
        return validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          context.correlationId
        )
      }
      track = parsedTrack
    }

    // 3. Query active sessions
    const sessions = await findActiveSessions(env.DB, agent, venture, repo, track)

    // 4. Build response
    const responseData = {
      sessions,
      count: sessions.length,
      correlation_id: context.correlationId,
    }

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId)
  } catch (error) {
    console.error('GET /active error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /handoffs/latest - Get Latest Handoff
// ============================================================================

/**
 * GET /handoffs/latest - Get most recent handoff for a context
 *
 * Query parameters (multiple modes supported):
 * Mode 1 - By Issue:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - issue_number: number (required)
 *
 * Mode 2 - By Track:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - track: number (required)
 *
 * Mode 3 - By Session:
 *   - session_id: string (required)
 *
 * Response:
 * {
 *   handoff: HandoffRecord | null
 * }
 */
export async function handleGetLatestHandoff(request: Request, env: Env): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')
    const venture = url.searchParams.get('venture')
    const repo = url.searchParams.get('repo')
    const issueNumberParam = url.searchParams.get('issue_number')
    const trackParam = url.searchParams.get('track')

    // Determine query mode and validate
    let filters: {
      venture?: string
      repo?: string
      issue_number?: number
      track?: number
      session_id?: string
    } = {}

    if (sessionId) {
      // Mode 3: By session
      filters.session_id = sessionId
    } else if (venture && repo && issueNumberParam) {
      // Mode 1: By issue
      const issueNumber = parseInt(issueNumberParam, 10)
      if (isNaN(issueNumber)) {
        return validationErrorResponse(
          [{ field: 'issue_number', message: 'Must be a valid integer' }],
          context.correlationId
        )
      }
      filters = { venture, repo, issue_number: issueNumber }
    } else if (venture && repo && trackParam) {
      // Mode 2: By track
      const track = parseInt(trackParam, 10)
      if (isNaN(track)) {
        return validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          context.correlationId
        )
      }
      filters = { venture, repo, track }
    } else {
      return validationErrorResponse(
        [
          {
            field: 'query_params',
            message:
              'Provide session_id OR (venture + repo + issue_number) OR (venture + repo + track)',
          },
        ],
        context.correlationId
      )
    }

    // 3. Query latest handoff
    const handoff = await getLatestHandoff(env.DB, filters)

    // 4. Build response
    const responseData = {
      handoff,
      correlation_id: context.correlationId,
    }

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId)
  } catch (error) {
    console.error('GET /handoffs/latest error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /handoffs - Query Handoff History with Pagination
// ============================================================================

/**
 * GET /handoffs - Query handoff history with cursor-based pagination
 *
 * Query parameters (multiple modes supported):
 * Mode 1 - By Issue:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - issue_number: number (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Mode 2 - By Track:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - track: number (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Mode 3 - By Session:
 *   - session_id: string (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Mode 4 - By Agent:
 *   - from_agent: string (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Mode 5 - By Date Range:
 *   - created_after: string (required, ISO 8601)
 *   - created_before?: string (optional, ISO 8601)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Date filters (created_after, created_before) can also combine with modes 1-4.
 *
 * Response:
 * {
 *   handoffs: HandoffRecord[],
 *   next_cursor: string | null,
 *   has_more: boolean,
 *   count: number
 * }
 */
export async function handleQueryHandoffs(request: Request, env: Env): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')
    const fromAgent = url.searchParams.get('from_agent')
    const venture = url.searchParams.get('venture')
    const repo = url.searchParams.get('repo')
    const issueNumberParam = url.searchParams.get('issue_number')
    const trackParam = url.searchParams.get('track')
    const createdAfter = url.searchParams.get('created_after')
    const createdBefore = url.searchParams.get('created_before')
    const cursor = url.searchParams.get('cursor')
    const limitParam = url.searchParams.get('limit')

    // Parse pagination parameters
    let limit = 20 // Default
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10)
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return validationErrorResponse(
          [{ field: 'limit', message: 'Must be an integer between 1 and 100' }],
          context.correlationId
        )
      }
      limit = parsedLimit
    }

    // Validate date params if provided (must be valid ISO 8601)
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/
    if (createdAfter && !isoDatePattern.test(createdAfter)) {
      return validationErrorResponse(
        [{ field: 'created_after', message: 'Must be a valid ISO 8601 date string' }],
        context.correlationId
      )
    }
    if (createdBefore && !isoDatePattern.test(createdBefore)) {
      return validationErrorResponse(
        [{ field: 'created_before', message: 'Must be a valid ISO 8601 date string' }],
        context.correlationId
      )
    }

    // Determine query mode and validate
    const filters: {
      venture?: string
      repo?: string
      issue_number?: number
      track?: number
      session_id?: string
      from_agent?: string
      created_after?: string
      created_before?: string
    } = {}

    if (sessionId) {
      // Mode 3: By session
      filters.session_id = sessionId
    } else if (fromAgent) {
      // Mode 4: By agent
      filters.from_agent = fromAgent
    } else if (venture && repo) {
      // Mode 1 or 2: By issue or track
      filters.venture = venture
      filters.repo = repo

      if (issueNumberParam) {
        const issueNumber = parseInt(issueNumberParam, 10)
        if (isNaN(issueNumber)) {
          return validationErrorResponse(
            [{ field: 'issue_number', message: 'Must be a valid integer' }],
            context.correlationId
          )
        }
        filters.issue_number = issueNumber
      } else if (trackParam) {
        const track = parseInt(trackParam, 10)
        if (isNaN(track)) {
          return validationErrorResponse(
            [{ field: 'track', message: 'Must be a valid integer' }],
            context.correlationId
          )
        }
        filters.track = track
      }
      // Note: venture + repo without issue/track is valid (queries all handoffs for repo)
    } else if (createdAfter) {
      // Mode 5: By date range only (no venture/repo required)
      // Date filters applied below
    } else {
      return validationErrorResponse(
        [
          {
            field: 'query_params',
            message:
              'Provide session_id OR from_agent OR (venture + repo) with optional issue_number/track OR created_after for date-range query',
          },
        ],
        context.correlationId
      )
    }

    // Apply date range filters (combinable with any mode)
    if (createdAfter) {
      filters.created_after = createdAfter
    }
    if (createdBefore) {
      filters.created_before = createdBefore
    }

    // 3. Query handoffs with pagination
    const result = await queryHandoffs(env.DB, filters, {
      cursor: cursor || undefined,
      limit,
    })

    // 4. Build response
    const responseData = {
      handoffs: result.handoffs,
      next_cursor: result.next_cursor,
      has_more: result.has_more,
      count: result.handoffs.length,
      correlation_id: context.correlationId,
    }

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId)
  } catch (error) {
    console.error('GET /handoffs error:', error)

    // Handle invalid cursor errors specifically
    if (error instanceof Error && error.message.includes('Invalid cursor')) {
      return validationErrorResponse(
        [{ field: 'cursor', message: error.message }],
        context.correlationId
      )
    }

    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /docs - List Documents (Public)
// ============================================================================

/**
 * GET /docs - List document metadata for a venture
 *
 * Query parameters:
 * - venture: string (required) - Venture code (vc, dfg, sc, ke)
 *
 * Response:
 * {
 *   docs: Array<{ scope, doc_name, content_hash, title, version }>,
 *   count: number
 * }
 */
export async function handleListDocsPublic(request: Request, env: Env): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters
    const url = new URL(request.url)
    const venture = url.searchParams.get('venture')

    if (!venture) {
      return validationErrorResponse(
        [{ field: 'venture', message: 'Required query parameter' }],
        context.correlationId
      )
    }

    // 3. Fetch docs metadata
    const result = await fetchDocsMetadata(env.DB, venture)

    // 4. Build response
    const responseData = {
      docs: result.docs,
      count: result.count,
      correlation_id: context.correlationId,
    }

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId)
  } catch (error) {
    console.error('GET /docs error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /docs/:scope/:doc_name - Get Single Document (Public)
// ============================================================================

// ============================================================================
// GET /ventures - List Ventures (Public, No Auth)
// ============================================================================

/**
 * GET /ventures - List all ventures with metadata
 *
 * No authentication required - this is public configuration data.
 * Used by ccs script and other tooling to get venture list.
 *
 * Response:
 * {
 *   ventures: Array<{ code, name, org }>
 * }
 */
export async function handleGetVentures(): Promise<Response> {
  const ventures = Object.entries(VENTURE_CONFIG).map(([code, config]) => ({
    code,
    ...config,
  }))

  return jsonResponse({ ventures }, HTTP_STATUS.OK)
}

// ============================================================================
// GET /docs/audit - Documentation Audit
// ============================================================================

/**
 * GET /docs/audit - Run documentation audit for a venture or all ventures
 *
 * Query parameters:
 * - venture: string (optional) - Venture code. If omitted, audits all ventures.
 *
 * Response:
 * {
 *   audits: DocAuditResult[] | DocAuditResult,
 *   correlation_id: string
 * }
 */
export async function handleDocAudit(request: Request, env: Env): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context // Auth failed, return 401
  }

  try {
    const url = new URL(request.url)
    const venture = url.searchParams.get('venture')

    if (venture) {
      const result = await runDocAudit(env.DB, venture)
      return jsonResponse(
        { audit: result, correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    } else {
      const results = await runDocAuditAll(env.DB)
      return jsonResponse(
        { audits: results, correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }
  } catch (error) {
    console.error('GET /docs/audit error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /docs/:scope/:doc_name - Get Single Document (Public)
// ============================================================================

/**
 * GET /docs/:scope/:doc_name - Fetch a single document with content
 *
 * Path parameters:
 * - scope: string - Document scope (global or venture code)
 * - doc_name: string - Document name
 *
 * Response:
 * {
 *   doc: { scope, doc_name, content, content_hash, title, description, version } | null
 * }
 */
export async function handleGetDoc(
  request: Request,
  env: Env,
  scope: string,
  docName: string
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context // Auth failed, return 401
  }

  try {
    // 2. Fetch the document
    const doc = await fetchDoc(env.DB, scope, docName)

    if (!doc) {
      return errorResponse(
        `Document not found: ${scope}/${docName}`,
        HTTP_STATUS.NOT_FOUND,
        context.correlationId
      )
    }

    // 3. Build response
    const responseData = {
      doc,
      correlation_id: context.correlationId,
    }

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId)
  } catch (error) {
    console.error('GET /docs/:scope/:doc_name error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /sessions/history - Aggregated session history by venture and date
// ============================================================================

/** Gap threshold in milliseconds. Sessions separated by ≤ this are merged into one block. */
const BLOCK_GAP_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export interface SessionForMerge {
  start: string
  ended_at: string
  display_end: string
  host: string | null
  repo: string | null
  branch: string | null
  issue_number: number | null
}

/**
 * Merge sessions into contiguous blocks, preserving gaps > 30 minutes.
 *
 * Uses `ended_at` for gap calculation (reliable end time) and
 * `display_end` (last_activity_at || ended_at) for the block's display end time.
 */
export function mergeSessionsIntoBlocks(sessions: SessionForMerge[]): SessionHistoryBlock[] {
  if (sessions.length === 0) return []

  // Sort by start time
  const sorted = [...sessions].sort((a, b) => a.start.localeCompare(b.start))

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

  const blocks: BlockAccumulator[] = [newBlock(sorted[0])]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const lastBlock = blocks[blocks.length - 1]

    // Use ended_at for gap calculation — it's the reliable end time
    const gap = new Date(current.start).getTime() - new Date(lastBlock.ended_at).getTime()

    if (gap <= BLOCK_GAP_THRESHOLD_MS) {
      addToBlock(lastBlock, current)
    } else {
      blocks.push(newBlock(current))
    }
  }

  return blocks.map(finalizeBlock)
}

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

    // Calculate the cutoff date in UTC
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()

    // Query ended sessions since cutoff with detail fields
    const result = await env.DB.prepare(
      `SELECT venture, created_at, ended_at, last_activity_at, host, repo, branch, issue_number
       FROM sessions
       WHERE status = 'ended'
         AND ended_at IS NOT NULL
         AND created_at >= ?1
       ORDER BY created_at ASC`
    )
      .bind(cutoff)
      .all<{
        venture: string
        created_at: string
        ended_at: string
        last_activity_at: string | null
        host: string | null
        repo: string | null
        branch: string | null
        issue_number: number | null
      }>()

    const rows = result.results || []

    // Arizona UTC-7 offset (no DST)
    const AZ_OFFSET_MS = -7 * 60 * 60 * 1000

    // Normalize legacy venture codes to canonical short codes
    const VENTURE_ALIASES: Record<string, string> = {
      kidexpenses: 'ke',
    }
    function normalizeVenture(v: string): string {
      const lower = v.toLowerCase()
      return VENTURE_ALIASES[lower] || lower
    }

    // Group sessions by venture + work_date (Arizona time)
    const groups = new Map<
      string,
      { venture: string; work_date: string; sessions: SessionForMerge[] }
    >()

    for (const row of rows) {
      // Convert created_at to Arizona date
      const createdUtc = new Date(row.created_at)
      const azDate = new Date(createdUtc.getTime() + AZ_OFFSET_MS)
      const workDate = azDate.toISOString().split('T')[0]

      const venture = normalizeVenture(row.venture)
      const key = `${venture}:${workDate}`

      if (!groups.has(key)) {
        groups.set(key, { venture, work_date: workDate, sessions: [] })
      }

      groups.get(key)!.sessions.push({
        start: row.created_at,
        ended_at: row.ended_at,
        display_end: row.last_activity_at || row.ended_at,
        host: row.host,
        repo: row.repo,
        branch: row.branch,
        issue_number: row.issue_number,
      })
    }

    const entries: SessionHistoryEntry[] = Array.from(groups.values())
      .map((g) => ({
        venture: g.venture,
        work_date: g.work_date,
        blocks: mergeSessionsIntoBlocks(g.sessions),
        total_sessions: g.sessions.length,
      }))
      .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.venture.localeCompare(b.venture))

    return jsonResponse(
      {
        entries,
        count: entries.length,
        correlation_id: context.correlationId,
      },
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
