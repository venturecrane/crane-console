/**
 * Crane Context Worker - Session Management
 *
 * Barrel re-exports + resume-or-create orchestrator.
 * Read operations: sessions-queries.ts
 * Write operations: sessions-crud.ts
 */

export {
  findActiveSessions,
  getSession,
  isSessionStale,
  getStaleThreshold,
  findSiblingSessions,
  getSiblingSessionSummaries,
} from './sessions-queries'

export {
  createSession,
  updateHeartbeat,
  updateSession,
  endSession,
  markSessionAbandoned,
  markSessionsSuperseded,
  calculateNextHeartbeat,
} from './sessions-crud'

import type { SessionRecord } from './types'
import { findActiveSessions, getSession, isSessionStale } from './sessions-queries'
import {
  createSession,
  updateHeartbeat,
  markSessionAbandoned,
  markSessionsSuperseded,
} from './sessions-crud'

// ============================================================================
// Session Resume Logic (POST /sos)
// ============================================================================

/**
 * Handle session resume logic for POST /sos
 * Implements the complex logic from ADR 025:
 * - Find existing active sessions
 * - Handle multiple sessions (supersede all but most recent)
 * - Check staleness and auto-close if needed
 * - Create new session if none found or all stale
 *
 * @param db - D1 database binding
 * @param params - Session parameters
 * @returns Session record (existing or newly created)
 */
export async function resumeOrCreateSession(
  db: D1Database,
  params: {
    agent: string
    client?: string
    client_version?: string
    client_session_id?: string
    host?: string
    venture: string
    repo: string
    track?: number
    issue_number?: number
    branch?: string
    commit_sha?: string
    session_group_id?: string
    actor_key_id: string
    creation_correlation_id: string
    meta?: Record<string, unknown>
    staleAfterMinutes?: number
  }
): Promise<SessionRecord> {
  // 1. Find all active sessions matching the tuple
  const activeSessions = await findActiveSessions(
    db,
    params.agent,
    params.venture,
    params.repo,
    params.track || null
  )

  // 2. Handle multiple active sessions (shouldn't happen, but handle it)
  if (activeSessions.length > 1) {
    console.warn(
      `Multiple active sessions for ${params.agent}/${params.venture}/${params.repo}/${params.track}`,
      { count: activeSessions.length, sessions: activeSessions.map((s) => s.id) }
    )

    // Keep most recent, mark others as superseded
    const [_mostRecent, ...toSupersede] = activeSessions

    if (toSupersede.length > 0) {
      await markSessionsSuperseded(
        db,
        toSupersede.map((s) => s.id)
      )
    }

    // Continue with most recent session
    activeSessions.length = 1
  }

  // 3. Check if we have a single active session
  if (activeSessions.length === 1) {
    const existing = activeSessions[0]

    // 4. Check if it's stale
    if (isSessionStale(existing, params.staleAfterMinutes)) {
      // Auto-close stale session
      await markSessionAbandoned(db, existing.id)
      // Continue to create new session
    } else {
      // 5. Resume active session (refresh heartbeat; backfill client_session_id if missing)
      await updateHeartbeat(db, existing.id, params.client_session_id)

      // Fetch updated session
      const updated = await getSession(db, existing.id)
      if (!updated) {
        throw new Error('Failed to fetch updated session')
      }

      return updated
    }
  }

  // 6. Create new session (no active session found, or all were stale)
  return await createSession(db, params)
}
