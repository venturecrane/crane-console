import type { SessionRecord } from './types'
import { generateSessionId, nowIso, addSeconds } from './utils'
import {
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_JITTER_SECONDS,
  CURRENT_SCHEMA_VERSION,
} from './constants'
import { getSession } from './sessions-queries'

// ============================================================================
// Session Creation
// ============================================================================

/**
 * Create a new session
 *
 * @param db - D1 database binding
 * @param params - Session parameters
 * @returns Created session record
 */
export async function createSession(
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
  }
): Promise<SessionRecord> {
  const now = nowIso()
  const sessionId = generateSessionId()

  const query = `
    INSERT INTO sessions (
      id, agent, client, client_version, client_session_id, host,
      venture, repo, track, issue_number, branch, commit_sha,
      status, created_at, started_at, last_heartbeat_at,
      schema_version, actor_key_id, creation_correlation_id, meta_json,
      session_group_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      'active', ?, ?, ?,
      ?, ?, ?, ?,
      ?
    )
  `

  await db
    .prepare(query)
    .bind(
      sessionId,
      params.agent,
      params.client || null,
      params.client_version || null,
      params.client_session_id || null,
      params.host || null,
      params.venture,
      params.repo,
      params.track || null,
      params.issue_number || null,
      params.branch || null,
      params.commit_sha || null,
      now, // created_at
      now, // started_at
      now, // last_heartbeat_at
      CURRENT_SCHEMA_VERSION,
      params.actor_key_id,
      params.creation_correlation_id,
      params.meta ? JSON.stringify(params.meta) : null,
      params.session_group_id || null
    )
    .run()

  // Fetch and return the created session
  const session = await getSession(db, sessionId)
  if (!session) {
    throw new Error('Failed to create session')
  }

  return session
}

// ============================================================================
// Session Updates
// ============================================================================

/**
 * Update session heartbeat timestamp
 * Used by POST /heartbeat and POST /update
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @returns Updated timestamp
 */
export async function updateHeartbeat(
  db: D1Database,
  sessionId: string,
  clientSessionId?: string
): Promise<string> {
  const now = nowIso()

  // Backfill client_session_id only when currently NULL — handles in-flight
  // sessions that started before the column existed. COALESCE keeps any value
  // already set, including the one captured at /sos.
  if (clientSessionId) {
    await db
      .prepare(
        'UPDATE sessions SET last_heartbeat_at = ?, client_session_id = COALESCE(client_session_id, ?) WHERE id = ?'
      )
      .bind(now, clientSessionId, sessionId)
      .run()
  } else {
    await db
      .prepare('UPDATE sessions SET last_heartbeat_at = ? WHERE id = ?')
      .bind(now, sessionId)
      .run()
  }

  return now
}

/**
 * Update session fields (for POST /update)
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @param updates - Fields to update
 * @returns Updated timestamp
 */
export async function updateSession(
  db: D1Database,
  sessionId: string,
  updates: {
    branch?: string
    commit_sha?: string
    meta?: Record<string, unknown>
    client_session_id?: string
  }
): Promise<string> {
  const now = nowIso()
  const fields: string[] = ['last_heartbeat_at = ?']
  const bindings: (string | null)[] = [now]

  if (updates.branch !== undefined) {
    fields.push('branch = ?')
    bindings.push(updates.branch || null)
  }

  if (updates.commit_sha !== undefined) {
    fields.push('commit_sha = ?')
    bindings.push(updates.commit_sha || null)
  }

  if (updates.meta !== undefined) {
    fields.push('meta_json = ?')
    bindings.push(JSON.stringify(updates.meta))
  }

  // Backfill client_session_id only when currently NULL — handles in-flight
  // sessions that started before the column existed.
  if (updates.client_session_id) {
    fields.push('client_session_id = COALESCE(client_session_id, ?)')
    bindings.push(updates.client_session_id)
  }

  const query = `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`
  bindings.push(sessionId)

  await db
    .prepare(query)
    .bind(...bindings)
    .run()

  return now
}

/**
 * End a session
 * Used by POST /eos
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @param end_reason - Reason for ending (manual, stale, superseded, error)
 * @returns Ended timestamp
 */
export async function endSession(
  db: D1Database,
  sessionId: string,
  end_reason: string = 'manual',
  last_activity_at?: string
): Promise<string> {
  const now = nowIso()

  await db
    .prepare(
      'UPDATE sessions SET status = ?, ended_at = ?, end_reason = ?, last_activity_at = ? WHERE id = ?'
    )
    .bind('ended', now, end_reason, last_activity_at || null, sessionId)
    .run()

  return now
}

/**
 * Mark session as abandoned (for stale sessions)
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 */
export async function markSessionAbandoned(db: D1Database, sessionId: string): Promise<void> {
  // Use last_heartbeat_at as ended_at and last_activity_at for abandoned sessions
  await db
    .prepare(
      `UPDATE sessions
       SET status = 'abandoned',
           ended_at = last_heartbeat_at,
           last_activity_at = last_heartbeat_at,
           end_reason = 'stale'
       WHERE id = ?`
    )
    .bind(sessionId)
    .run()
}

/**
 * Mark multiple sessions as superseded
 * Used when /sod finds multiple active sessions for same tuple
 *
 * @param db - D1 database binding
 * @param sessionIds - Array of session IDs to mark as superseded
 */
export async function markSessionsSuperseded(db: D1Database, sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return

  const now = nowIso()

  // D1 caps a single statement at 100 bound parameters; expand the id list
  // via json_each() so this stays safe regardless of how many duplicates
  // /sos found for the tuple.
  await db
    .prepare(
      `UPDATE sessions
       SET status = 'ended',
           ended_at = ?,
           end_reason = 'superseded'
       WHERE id IN (SELECT value FROM json_each(?))`
    )
    .bind(now, JSON.stringify(sessionIds))
    .run()
}

// ============================================================================
// Heartbeat Jitter Calculation
// ============================================================================

/**
 * Calculate next heartbeat timestamp with jitter
 * Returns random interval between base ± jitter seconds
 *
 * @returns Object with next_heartbeat_at timestamp and actual interval used
 */
export function calculateNextHeartbeat(): {
  next_heartbeat_at: string
  heartbeat_interval_seconds: number
} {
  // Generate random jitter: ±HEARTBEAT_JITTER_SECONDS
  const jitter =
    Math.floor(Math.random() * (HEARTBEAT_JITTER_SECONDS * 2 + 1)) - HEARTBEAT_JITTER_SECONDS

  const intervalSeconds = HEARTBEAT_INTERVAL_SECONDS + jitter
  const nextHeartbeat = addSeconds(intervalSeconds)

  return {
    next_heartbeat_at: nextHeartbeat,
    heartbeat_interval_seconds: intervalSeconds,
  }
}
