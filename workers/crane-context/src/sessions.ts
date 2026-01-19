/**
 * Crane Context Worker - Session Management
 *
 * Core session lifecycle logic: creation, resume, staleness detection, heartbeat.
 * Implements session patterns from ADR 025.
 */

import type { Env, SessionRecord, SessionStatus } from './types';
import {
  generateSessionId,
  nowIso,
  subtractMinutes,
  addSeconds,
} from './utils';
import {
  STALE_AFTER_MINUTES,
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_JITTER_SECONDS,
  CURRENT_SCHEMA_VERSION,
} from './constants';

// ============================================================================
// Session Queries
// ============================================================================

/**
 * Find active session by agent, venture, repo, and track
 * Used for resume logic in POST /sod
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
  agent: string,
  venture: string,
  repo: string,
  track: number | null
): Promise<SessionRecord[]> {
  // When track is null, match ALL sessions (ignore track filter)
  // When track is provided, match only that specific track
  const query = `
    SELECT * FROM sessions
    WHERE agent = ?
      AND venture = ?
      AND repo = ?
      AND (? IS NULL OR track = ?)
      AND status = 'active'
    ORDER BY last_heartbeat_at DESC
  `;

  const result = await db
    .prepare(query)
    .bind(agent, venture, repo, track, track)
    .all<SessionRecord>();

  return result.results || [];
}

/**
 * Get session by ID
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @returns Session record or null if not found
 */
export async function getSession(
  db: D1Database,
  sessionId: string
): Promise<SessionRecord | null> {
  const result = await db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<SessionRecord>();

  return result;
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
  const staleThreshold = subtractMinutes(staleAfterMinutes);
  return session.last_heartbeat_at < staleThreshold;
}

/**
 * Get staleness threshold timestamp for SQL queries
 * Returns ISO 8601 timestamp representing the staleness cutoff
 *
 * @param staleAfterMinutes - Optional custom staleness threshold
 * @returns ISO 8601 timestamp
 */
export function getStaleThreshold(
  staleAfterMinutes: number = STALE_AFTER_MINUTES
): string {
  return subtractMinutes(staleAfterMinutes);
}

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
    agent: string;
    client?: string;
    client_version?: string;
    host?: string;
    venture: string;
    repo: string;
    track?: number;
    issue_number?: number;
    branch?: string;
    commit_sha?: string;
    actor_key_id: string;
    creation_correlation_id: string;
    meta?: Record<string, unknown>;
  }
): Promise<SessionRecord> {
  const now = nowIso();
  const sessionId = generateSessionId();

  const query = `
    INSERT INTO sessions (
      id, agent, client, client_version, host,
      venture, repo, track, issue_number, branch, commit_sha,
      status, created_at, started_at, last_heartbeat_at,
      schema_version, actor_key_id, creation_correlation_id, meta_json
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      'active', ?, ?, ?,
      ?, ?, ?, ?
    )
  `;

  await db
    .prepare(query)
    .bind(
      sessionId,
      params.agent,
      params.client || null,
      params.client_version || null,
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
      params.meta ? JSON.stringify(params.meta) : null
    )
    .run();

  // Fetch and return the created session
  const session = await getSession(db, sessionId);
  if (!session) {
    throw new Error('Failed to create session');
  }

  return session;
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
  sessionId: string
): Promise<string> {
  const now = nowIso();

  await db
    .prepare('UPDATE sessions SET last_heartbeat_at = ? WHERE id = ?')
    .bind(now, sessionId)
    .run();

  return now;
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
    branch?: string;
    commit_sha?: string;
    meta?: Record<string, unknown>;
  }
): Promise<string> {
  const now = nowIso();
  const fields: string[] = ['last_heartbeat_at = ?'];
  const bindings: (string | null)[] = [now];

  if (updates.branch !== undefined) {
    fields.push('branch = ?');
    bindings.push(updates.branch || null);
  }

  if (updates.commit_sha !== undefined) {
    fields.push('commit_sha = ?');
    bindings.push(updates.commit_sha || null);
  }

  if (updates.meta !== undefined) {
    fields.push('meta_json = ?');
    bindings.push(JSON.stringify(updates.meta));
  }

  const query = `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`;
  bindings.push(sessionId);

  await db.prepare(query).bind(...bindings).run();

  return now;
}

/**
 * End a session
 * Used by POST /eod
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 * @param end_reason - Reason for ending (manual, stale, superseded, error)
 * @returns Ended timestamp
 */
export async function endSession(
  db: D1Database,
  sessionId: string,
  end_reason: string = 'manual'
): Promise<string> {
  const now = nowIso();

  await db
    .prepare(
      'UPDATE sessions SET status = ?, ended_at = ?, end_reason = ? WHERE id = ?'
    )
    .bind('ended', now, end_reason, sessionId)
    .run();

  return now;
}

/**
 * Mark session as abandoned (for stale sessions)
 *
 * @param db - D1 database binding
 * @param sessionId - Session ID
 */
export async function markSessionAbandoned(
  db: D1Database,
  sessionId: string
): Promise<void> {
  // Use last_heartbeat_at as ended_at for abandoned sessions
  await db
    .prepare(
      `UPDATE sessions
       SET status = 'abandoned',
           ended_at = last_heartbeat_at,
           end_reason = 'stale'
       WHERE id = ?`
    )
    .bind(sessionId)
    .run();
}

/**
 * Mark multiple sessions as superseded
 * Used when /sod finds multiple active sessions for same tuple
 *
 * @param db - D1 database binding
 * @param sessionIds - Array of session IDs to mark as superseded
 */
export async function markSessionsSuperseded(
  db: D1Database,
  sessionIds: string[]
): Promise<void> {
  if (sessionIds.length === 0) return;

  const now = nowIso();
  const placeholders = sessionIds.map(() => '?').join(',');

  const query = `
    UPDATE sessions
    SET status = 'ended',
        ended_at = ?,
        end_reason = 'superseded'
    WHERE id IN (${placeholders})
  `;

  await db.prepare(query).bind(now, ...sessionIds).run();
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
  next_heartbeat_at: string;
  heartbeat_interval_seconds: number;
} {
  // Generate random jitter: ±HEARTBEAT_JITTER_SECONDS
  const jitter =
    Math.floor(Math.random() * (HEARTBEAT_JITTER_SECONDS * 2 + 1)) -
    HEARTBEAT_JITTER_SECONDS;

  const intervalSeconds = HEARTBEAT_INTERVAL_SECONDS + jitter;
  const nextHeartbeat = addSeconds(intervalSeconds);

  return {
    next_heartbeat_at: nextHeartbeat,
    heartbeat_interval_seconds: intervalSeconds,
  };
}

// ============================================================================
// Session Resume Logic (POST /sod)
// ============================================================================

/**
 * Handle session resume logic for POST /sod
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
    agent: string;
    client?: string;
    client_version?: string;
    host?: string;
    venture: string;
    repo: string;
    track?: number;
    issue_number?: number;
    branch?: string;
    commit_sha?: string;
    actor_key_id: string;
    creation_correlation_id: string;
    meta?: Record<string, unknown>;
    staleAfterMinutes?: number;
  }
): Promise<SessionRecord> {
  // 1. Find all active sessions matching the tuple
  const activeSessions = await findActiveSessions(
    db,
    params.agent,
    params.venture,
    params.repo,
    params.track || null
  );

  // 2. Handle multiple active sessions (shouldn't happen, but handle it)
  if (activeSessions.length > 1) {
    console.warn(
      `Multiple active sessions for ${params.agent}/${params.venture}/${params.repo}/${params.track}`,
      { count: activeSessions.length, sessions: activeSessions.map(s => s.id) }
    );

    // Keep most recent, mark others as superseded
    const [mostRecent, ...toSupersede] = activeSessions;

    if (toSupersede.length > 0) {
      await markSessionsSuperseded(
        db,
        toSupersede.map(s => s.id)
      );
    }

    // Continue with most recent session
    activeSessions.length = 1;
  }

  // 3. Check if we have a single active session
  if (activeSessions.length === 1) {
    const existing = activeSessions[0];

    // 4. Check if it's stale
    if (isSessionStale(existing, params.staleAfterMinutes)) {
      // Auto-close stale session
      await markSessionAbandoned(db, existing.id);
      // Continue to create new session
    } else {
      // 5. Resume active session (refresh heartbeat)
      await updateHeartbeat(db, existing.id);

      // Fetch updated session
      const updated = await getSession(db, existing.id);
      if (!updated) {
        throw new Error('Failed to fetch updated session');
      }

      return updated;
    }
  }

  // 6. Create new session (no active session found, or all were stale)
  return await createSession(db, params);
}
