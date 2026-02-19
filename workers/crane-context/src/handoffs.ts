/**
 * Crane Context Worker - Handoff Storage
 *
 * Core handoff creation and query logic with payload validation.
 * Implements handoff patterns from ADR 025.
 */

import type { Env, HandoffRecord, PaginationCursor } from './types'
import {
  generateHandoffId,
  nowIso,
  hashCanonicalJson,
  canonicalizeJson,
  sizeInBytes,
  encodeCursor,
  decodeCursor,
} from './utils'
import {
  MAX_HANDOFF_PAYLOAD_SIZE,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'

// ============================================================================
// Handoff Creation
// ============================================================================

/**
 * Create a new handoff with payload validation and canonical JSON storage
 *
 * @param db - D1 database binding
 * @param params - Handoff parameters
 * @returns Created handoff record
 * @throws Error if payload exceeds 800KB or other validation fails
 */
export async function createHandoff(
  db: D1Database,
  params: {
    session_id: string
    venture: string
    repo: string
    track?: number
    issue_number?: number
    branch?: string
    commit_sha?: string
    from_agent: string
    to_agent?: string
    status_label?: string
    summary: string
    payload: unknown
    actor_key_id: string
    creation_correlation_id: string
  }
): Promise<HandoffRecord> {
  // 1. Canonicalize payload (stable key ordering for consistent hashing)
  const canonicalPayload = canonicalizeJson(params.payload)
  const payloadSize = sizeInBytes(canonicalPayload)

  // 2. Validate payload size (800KB max)
  if (payloadSize > MAX_HANDOFF_PAYLOAD_SIZE) {
    throw new Error(
      `Handoff payload too large: ${payloadSize} bytes (max ${MAX_HANDOFF_PAYLOAD_SIZE})`
    )
  }

  // 3. Compute payload hash
  const payloadHash = await hashCanonicalJson(params.payload)

  // 4. Generate handoff ID
  const handoffId = generateHandoffId()
  const now = nowIso()

  // 5. Insert handoff record
  const query = `
    INSERT INTO handoffs (
      id, session_id,
      venture, repo, track, issue_number, branch, commit_sha,
      from_agent, to_agent, status_label, summary,
      payload_json, payload_hash, payload_size_bytes, schema_version,
      created_at, actor_key_id, creation_correlation_id
    ) VALUES (
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `

  await db
    .prepare(query)
    .bind(
      handoffId,
      params.session_id,
      params.venture,
      params.repo,
      params.track || null,
      params.issue_number || null,
      params.branch || null,
      params.commit_sha || null,
      params.from_agent,
      params.to_agent || null,
      params.status_label || null,
      params.summary,
      canonicalPayload,
      payloadHash,
      payloadSize,
      CURRENT_SCHEMA_VERSION,
      now,
      params.actor_key_id,
      params.creation_correlation_id
    )
    .run()

  // 6. Fetch and return created handoff
  const handoff = await getHandoff(db, handoffId)
  if (!handoff) {
    throw new Error('Failed to create handoff')
  }

  return handoff
}

// ============================================================================
// Handoff Queries
// ============================================================================

/**
 * Get handoff by ID
 *
 * @param db - D1 database binding
 * @param handoffId - Handoff ID
 * @returns Handoff record or null if not found
 */
export async function getHandoff(db: D1Database, handoffId: string): Promise<HandoffRecord | null> {
  const result = await db
    .prepare('SELECT * FROM handoffs WHERE id = ?')
    .bind(handoffId)
    .first<HandoffRecord>()

  return result
}

/**
 * Get latest handoff for a given context
 * Supports multiple query modes:
 * - By issue: venture + repo + issue_number
 * - By track: venture + repo + track
 * - By session: session_id
 *
 * @param db - D1 database binding
 * @param filters - Query filters
 * @returns Latest handoff or null if not found
 */
export async function getLatestHandoff(
  db: D1Database,
  filters: {
    venture?: string
    repo?: string
    issue_number?: number
    track?: number
    session_id?: string
  }
): Promise<HandoffRecord | null> {
  // Build query based on provided filters
  let query = 'SELECT * FROM handoffs WHERE '
  const conditions: string[] = []
  const bindings: (string | number)[] = []

  if (filters.session_id) {
    // Query by session ID
    conditions.push('session_id = ?')
    bindings.push(filters.session_id)
  } else if (filters.venture && filters.repo && filters.issue_number !== undefined) {
    // Query by issue
    conditions.push('venture = ?', 'repo = ?', 'issue_number = ?')
    bindings.push(filters.venture, filters.repo, filters.issue_number)
  } else if (filters.venture && filters.repo && filters.track !== undefined) {
    // Query by track
    conditions.push('venture = ?', 'repo = ?', 'track = ?')
    bindings.push(filters.venture, filters.repo, filters.track)
  } else {
    throw new Error(
      'Invalid filter combination: provide session_id OR (venture + repo + issue_number/track)'
    )
  }

  query += conditions.join(' AND ')
  query += ' ORDER BY created_at DESC LIMIT 1'

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .first<HandoffRecord>()

  return result
}

/**
 * Query handoffs with cursor-based pagination
 * Supports filtering by:
 * - venture + repo + issue_number (uses idx_handoffs_issue)
 * - venture + repo + track (uses idx_handoffs_track)
 * - session_id (uses idx_handoffs_session)
 * - from_agent (uses idx_handoffs_agent)
 *
 * @param db - D1 database binding
 * @param filters - Query filters
 * @param options - Pagination options
 * @returns Object with handoffs array, next_cursor, and has_more
 */
export async function queryHandoffs(
  db: D1Database,
  filters: {
    venture?: string
    repo?: string
    issue_number?: number
    track?: number
    session_id?: string
    from_agent?: string
    created_after?: string
    created_before?: string
  },
  options: {
    cursor?: string
    limit?: number
  } = {}
): Promise<{
  handoffs: HandoffRecord[]
  next_cursor: string | null
  has_more: boolean
}> {
  // Parse pagination parameters
  const limit = Math.min(options.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  let cursorData: PaginationCursor | null = null

  if (options.cursor) {
    try {
      cursorData = decodeCursor(options.cursor)
    } catch (error) {
      throw new Error(`Invalid cursor: ${error instanceof Error ? error.message : 'unknown'}`)
    }
  }

  // Build query based on filters
  let query = 'SELECT * FROM handoffs WHERE '
  const conditions: string[] = []
  const bindings: (string | number)[] = []

  // Apply filters
  if (filters.session_id) {
    conditions.push('session_id = ?')
    bindings.push(filters.session_id)
  } else if (filters.from_agent) {
    conditions.push('from_agent = ?')
    bindings.push(filters.from_agent)
  } else if (filters.venture && filters.repo) {
    conditions.push('venture = ?', 'repo = ?')
    bindings.push(filters.venture, filters.repo)

    if (filters.issue_number !== undefined) {
      conditions.push('issue_number = ?')
      bindings.push(filters.issue_number)
    } else if (filters.track !== undefined) {
      conditions.push('track = ?')
      bindings.push(filters.track)
    }
  } else if (filters.created_after || filters.created_before) {
    // Mode 5: Date-range-only query (uses idx_handoffs_created)
    // Date conditions applied below
  } else {
    throw new Error('Invalid filter combination')
  }

  // Apply date range filters (combinable with any mode)
  if (filters.created_after) {
    conditions.push('created_at >= ?')
    bindings.push(filters.created_after)
  }
  if (filters.created_before) {
    conditions.push('created_at < ?')
    bindings.push(filters.created_before)
  }

  // Apply cursor pagination (created_at DESC, id DESC)
  if (cursorData) {
    conditions.push('(created_at < ? OR (created_at = ? AND id < ?))')
    bindings.push(cursorData.timestamp, cursorData.timestamp, cursorData.id)
  }

  query += conditions.join(' AND ')
  query += ' ORDER BY created_at DESC, id DESC LIMIT ?'
  bindings.push(limit + 1) // Fetch limit + 1 to check has_more

  // Execute query
  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<HandoffRecord>()

  const handoffs = result.results || []

  // Check if there are more results
  const hasMore = handoffs.length > limit
  if (hasMore) {
    handoffs.pop() // Remove extra record
  }

  // Generate next cursor if more results exist
  let nextCursor: string | null = null
  if (hasMore && handoffs.length > 0) {
    const lastHandoff = handoffs[handoffs.length - 1]
    nextCursor = encodeCursor({
      timestamp: lastHandoff.created_at,
      id: lastHandoff.id,
    })
  }

  return {
    handoffs,
    next_cursor: nextCursor,
    has_more: hasMore,
  }
}

// ============================================================================
// Handoff Statistics (Optional - for monitoring)
// ============================================================================

/**
 * Get handoff count for a given session
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @returns Number of handoffs for session
 */
export async function getHandoffCount(db: D1Database, sessionId: string): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM handoffs WHERE session_id = ?')
    .bind(sessionId)
    .first<{ count: number }>()

  return result?.count || 0
}

/**
 * Get total payload size for a given session
 * Useful for monitoring storage usage
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @returns Total payload size in bytes
 */
export async function getTotalPayloadSize(db: D1Database, sessionId: string): Promise<number> {
  const result = await db
    .prepare('SELECT SUM(payload_size_bytes) as total FROM handoffs WHERE session_id = ?')
    .bind(sessionId)
    .first<{ total: number }>()

  return result?.total || 0
}
