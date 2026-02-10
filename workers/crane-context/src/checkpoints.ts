/**
 * Crane Context Worker - Checkpoint Data Operations
 *
 * Functions for creating and querying checkpoints.
 * Implements Issue #116 - /checkpoint endpoint.
 */

import { ulid } from 'ulidx'
import type { CheckpointRecord } from './types'
import { ID_PREFIXES } from './constants'
import { nowIso } from './utils'

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a new checkpoint ID with ULID format
 * Format: cp_<ULID> (sortable, timestamp-embedded)
 */
export function generateCheckpointId(): string {
  return `${ID_PREFIXES.CHECKPOINT}${ulid()}`
}

// ============================================================================
// Create Checkpoint
// ============================================================================

export interface CreateCheckpointParams {
  session_id: string
  venture: string
  repo: string
  track?: number
  issue_number?: number
  branch?: string
  commit_sha?: string
  summary: string
  work_completed?: string[]
  blockers?: string[]
  next_actions?: string[]
  notes?: string
  actor_key_id: string
  correlation_id: string
}

/**
 * Create a new checkpoint for a session
 *
 * @param db - D1 database
 * @param params - Checkpoint parameters
 * @returns Created checkpoint record
 */
export async function createCheckpoint(
  db: D1Database,
  params: CreateCheckpointParams
): Promise<CheckpointRecord> {
  const id = generateCheckpointId()
  const createdAt = nowIso()

  // Get next checkpoint number for this session
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM checkpoints WHERE session_id = ?')
    .bind(params.session_id)
    .first<{ count: number }>()

  const checkpointNumber = (countResult?.count || 0) + 1

  // Serialize arrays to JSON
  const workCompleted = params.work_completed ? JSON.stringify(params.work_completed) : null
  const blockers = params.blockers ? JSON.stringify(params.blockers) : null
  const nextActions = params.next_actions ? JSON.stringify(params.next_actions) : null

  // Insert checkpoint
  await db
    .prepare(
      `INSERT INTO checkpoints (
        id, session_id, venture, repo, track, issue_number, branch, commit_sha,
        summary, work_completed, blockers, next_actions, notes,
        checkpoint_number, created_at, actor_key_id, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.session_id,
      params.venture,
      params.repo,
      params.track ?? null,
      params.issue_number ?? null,
      params.branch ?? null,
      params.commit_sha ?? null,
      params.summary,
      workCompleted,
      blockers,
      nextActions,
      params.notes ?? null,
      checkpointNumber,
      createdAt,
      params.actor_key_id,
      params.correlation_id
    )
    .run()

  return {
    id,
    session_id: params.session_id,
    venture: params.venture,
    repo: params.repo,
    track: params.track ?? null,
    issue_number: params.issue_number ?? null,
    branch: params.branch ?? null,
    commit_sha: params.commit_sha ?? null,
    summary: params.summary,
    work_completed: workCompleted,
    blockers,
    next_actions: nextActions,
    notes: params.notes ?? null,
    checkpoint_number: checkpointNumber,
    created_at: createdAt,
    actor_key_id: params.actor_key_id,
    correlation_id: params.correlation_id,
  }
}

// ============================================================================
// Query Checkpoints
// ============================================================================

export interface GetCheckpointsFilters {
  session_id?: string
  venture?: string
  repo?: string
  track?: number
}

/**
 * Get checkpoints by filters
 *
 * @param db - D1 database
 * @param filters - Query filters
 * @param limit - Maximum results (default 20)
 * @returns Array of checkpoint records
 */
export async function getCheckpoints(
  db: D1Database,
  filters: GetCheckpointsFilters,
  limit: number = 20
): Promise<CheckpointRecord[]> {
  let query = 'SELECT * FROM checkpoints WHERE 1=1'
  const bindings: (string | number)[] = []

  if (filters.session_id) {
    query += ' AND session_id = ?'
    bindings.push(filters.session_id)
  }

  if (filters.venture) {
    query += ' AND venture = ?'
    bindings.push(filters.venture)
  }

  if (filters.repo) {
    query += ' AND repo = ?'
    bindings.push(filters.repo)
  }

  if (filters.track !== undefined) {
    query += ' AND track = ?'
    bindings.push(filters.track)
  }

  query += ' ORDER BY created_at DESC LIMIT ?'
  bindings.push(limit)

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<CheckpointRecord>()

  return result.results || []
}

/**
 * Get latest checkpoint for a session
 *
 * @param db - D1 database
 * @param sessionId - Session ID
 * @returns Latest checkpoint or null
 */
export async function getLatestCheckpoint(
  db: D1Database,
  sessionId: string
): Promise<CheckpointRecord | null> {
  const result = await db
    .prepare(
      `SELECT * FROM checkpoints
       WHERE session_id = ?
       ORDER BY checkpoint_number DESC
       LIMIT 1`
    )
    .bind(sessionId)
    .first<CheckpointRecord>()

  return result || null
}
