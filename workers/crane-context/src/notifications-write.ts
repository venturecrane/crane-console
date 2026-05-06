/**
 * Crane Context Worker - Notification Write Operations
 *
 * createNotification: insert a new notification row (INSERT OR IGNORE on dedupe_hash).
 */

import { MAX_NOTIFICATION_DETAILS_SIZE } from './constants'
import type { NotificationRecord, NotificationMatchKeyVersion } from './types'
import { generateNotificationId, nowIso, sizeInBytes } from './utils'
import { logNotificationEvent } from './notifications-log'

// ============================================================================
// Create
// ============================================================================

export interface CreateNotificationParams {
  source: string
  event_type: string
  severity: import('./types').NotificationSeverity
  summary: string
  details_json: string
  external_id?: string
  dedupe_hash: string
  venture?: string | null
  repo?: string | null
  branch?: string | null
  environment?: string | null
  created_at?: string
  actor_key_id: string

  // Match-key fields (PR A2). Optional for backward compatibility with
  // call sites that haven't been updated yet, but new failure normalizers
  // populate them so subsequent green events can match.
  workflow_id?: number | null
  workflow_name?: string | null
  run_id?: number | null
  head_sha?: string | null
  check_suite_id?: number | null
  check_run_id?: number | null
  app_id?: number | null
  app_name?: string | null
  deployment_id?: string | null
  project_name?: string | null
  target?: string | null
  match_key?: string | null
  match_key_version?: NotificationMatchKeyVersion | null
  run_started_at?: string | null
}

export interface CreateNotificationResult {
  notification?: NotificationRecord
  duplicate: boolean
}

type InsertBinds = (string | number | null)[]

// Normalize undefined to null for D1 bind parameters
function n<T>(v: T | null | undefined): T | null {
  return v ?? null
}

function buildInsertBinds(id: string, now: string, params: CreateNotificationParams): InsertBinds {
  const createdAt = params.created_at ?? now
  return [
    id,
    params.source,
    params.event_type,
    params.severity,
    params.summary,
    params.details_json,
    n(params.external_id),
    params.dedupe_hash,
    n(params.venture),
    n(params.repo),
    n(params.branch),
    n(params.environment),
    createdAt,
    now,
    now,
    params.actor_key_id,
    n(params.workflow_id),
    n(params.workflow_name),
    n(params.run_id),
    n(params.head_sha),
    n(params.check_suite_id),
    n(params.check_run_id),
    n(params.app_id),
    n(params.app_name),
    n(params.deployment_id),
    n(params.project_name),
    n(params.target),
    n(params.match_key),
    n(params.match_key_version),
    n(params.run_started_at),
  ]
}

const INSERT_SQL = `INSERT OR IGNORE INTO notifications
   (id, source, event_type, severity, status, summary, details_json,
    external_id, dedupe_hash, venture, repo, branch, environment,
    created_at, received_at, updated_at, actor_key_id,
    workflow_id, workflow_name, run_id, head_sha,
    check_suite_id, check_run_id, app_id, app_name,
    deployment_id, project_name, target,
    match_key, match_key_version, run_started_at)
   VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?,
           ?, ?, ?)`

/**
 * Insert a notification, silently ignoring duplicates (INSERT OR IGNORE on dedupe_hash).
 */
export async function createNotification(
  db: D1Database,
  params: CreateNotificationParams
): Promise<CreateNotificationResult> {
  if (sizeInBytes(params.details_json) > MAX_NOTIFICATION_DETAILS_SIZE) {
    throw new Error(`details_json exceeds maximum size of ${MAX_NOTIFICATION_DETAILS_SIZE} bytes`)
  }

  const id = generateNotificationId()
  const now = nowIso()
  const binds = buildInsertBinds(id, now, params)

  const result = await db
    .prepare(INSERT_SQL)
    .bind(...binds)
    .run()

  if (result.meta.changes === 0) {
    return { duplicate: true }
  }

  const record = await db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .bind(id)
    .first<NotificationRecord>()

  if (record) {
    logNotificationEvent('notification_created', {
      id: record.id,
      source: record.source,
      severity: record.severity,
      match_key: record.match_key,
      repo: record.repo,
      branch: record.branch,
      workflow_id: record.workflow_id,
      dedupe_hash: record.dedupe_hash.slice(0, 8),
    })
  }

  return { notification: record ?? undefined, duplicate: false }
}
