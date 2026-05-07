import type { SessionRecord } from './types'
import { subtractMinutes } from './utils'
import { STALE_AFTER_MINUTES } from './constants'

// ============================================================================
// Session Queries
// ============================================================================

/**
 * Find active session by agent, venture, repo, and track
 * Used for resume logic in POST /sos
 *
 * @param db - D1 database binding
 * @param agent - Agent identifier
 * @param venture - Venture identifier
 * @param repo - Repository (owner/repo format)
 * @param track - Track number (nullable)
 * @returns Array of active sessions (should be 0 or 1, but handles multiple)
 */
export async function findActiveSessions(
  db: D1Database,
  agent: string | null,
  venture: string | null,
  repo: string | null,
  track: number | null
): Promise<SessionRecord[]> {
  // All filters are optional. When null, that filter is skipped.
  // This allows both targeted queries (conflict detection) and
  // unfiltered queries (remote MCP "show all active sessions").
  const query = `
    SELECT * FROM sessions
    WHERE (? IS NULL OR agent = ?)
      AND (? IS NULL OR venture = ?)
      AND (? IS NULL OR repo = ?)
      AND (? IS NULL OR track = ?)
      AND status = 'active'
    ORDER BY last_heartbeat_at DESC
  `

  const result = await db
    .prepare(query)
    .bind(agent, agent, venture, venture, repo, repo, track, track)
    .all<SessionRecord>()

  return result.results || []
}

/**
 * Get session by ID
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @returns Session record or null if not found
 */
export async function getSession(db: D1Database, sessionId: string): Promise<SessionRecord | null> {
  const result = await db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<SessionRecord>()

  return result
}

// ============================================================================
// Staleness Detection
// ============================================================================

/**
 * Check if a session is stale based on last_heartbeat_at
 * A session is stale if last_heartbeat_at > STALE_AFTER_MINUTES ago
 *
 * @param session - Session record
 * @param staleAfterMinutes - Optional custom staleness threshold (defaults to env var)
 * @returns True if session is stale
 */
export function isSessionStale(
  session: SessionRecord,
  staleAfterMinutes: number = STALE_AFTER_MINUTES
): boolean {
  const staleThreshold = subtractMinutes(staleAfterMinutes)
  return session.last_heartbeat_at < staleThreshold
}

/**
 * Get staleness threshold timestamp for SQL queries
 * Returns ISO 8601 timestamp representing the staleness cutoff
 *
 * @param staleAfterMinutes - Optional custom staleness threshold
 * @returns ISO 8601 timestamp
 */
export function getStaleThreshold(staleAfterMinutes: number = STALE_AFTER_MINUTES): string {
  return subtractMinutes(staleAfterMinutes)
}

// ============================================================================
// Session Grouping (Sibling Sessions)
// ============================================================================

/**
 * Find sibling sessions in the same group
 * Returns active sessions with the same session_group_id
 *
 * @param db - D1 database binding
 * @param sessionGroupId - Group ID to search for
 * @param excludeSessionId - Optional session ID to exclude (current session)
 * @returns Array of sibling session records
 */
export async function findSiblingSessions(
  db: D1Database,
  sessionGroupId: string,
  excludeSessionId?: string
): Promise<SessionRecord[]> {
  let query = `
    SELECT * FROM sessions
    WHERE session_group_id = ?
      AND status = 'active'
  `
  const bindings: string[] = [sessionGroupId]

  if (excludeSessionId) {
    query += ' AND id != ?'
    bindings.push(excludeSessionId)
  }

  query += ' ORDER BY last_heartbeat_at DESC'

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<SessionRecord>()

  return result.results || []
}

/**
 * Get session group summary for sibling awareness
 * Returns summary info about sibling sessions without full payload
 *
 * @param db - D1 database binding
 * @param sessionGroupId - Group ID to search for
 * @param excludeSessionId - Optional session ID to exclude
 * @returns Array of sibling session summaries
 */
export async function getSiblingSessionSummaries(
  db: D1Database,
  sessionGroupId: string,
  excludeSessionId?: string
): Promise<
  Array<{
    id: string
    agent: string
    venture: string
    repo: string
    track: number | null
    issue_number: number | null
    branch: string | null
    last_heartbeat_at: string
    created_at: string
  }>
> {
  let query = `
    SELECT id, agent, venture, repo, track, issue_number, branch,
           last_heartbeat_at, created_at
    FROM sessions
    WHERE session_group_id = ?
      AND status = 'active'
  `
  const bindings: string[] = [sessionGroupId]

  if (excludeSessionId) {
    query += ' AND id != ?'
    bindings.push(excludeSessionId)
  }

  query += ' ORDER BY last_heartbeat_at DESC'

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<{
      id: string
      agent: string
      venture: string
      repo: string
      track: number | null
      issue_number: number | null
      branch: string | null
      last_heartbeat_at: string
      created_at: string
    }>()

  return result.results || []
}
