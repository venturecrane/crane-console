import type { Venture, SessionStatus, EndReason } from '../constants'

export type { Venture, SessionStatus, EndReason }

export interface SessionRecord {
  // Identity
  id: string

  // Session context
  agent: string
  client: string | null
  client_version: string | null
  client_session_id: string | null
  host: string | null
  venture: string
  repo: string
  track: number | null
  issue_number: number | null
  branch: string | null
  commit_sha: string | null

  // Lifecycle
  status: SessionStatus
  created_at: string
  started_at: string
  last_heartbeat_at: string
  ended_at: string | null
  last_activity_at: string | null
  end_reason: EndReason | null

  // Grouping (for parallel agent awareness)
  session_group_id: string | null

  // Schema versioning
  schema_version: string

  // Attribution & tracing
  actor_key_id: string
  creation_correlation_id: string

  // Extensibility
  meta_json: string | null
}

export interface SessionHistoryBlock {
  start: string
  end: string
  session_count: number
  hosts: string[]
  repos: string[]
  branches: string[]
  issues: number[]
}

export interface SessionHistoryEntry {
  venture: string
  work_date: string
  blocks: SessionHistoryBlock[]
  total_sessions: number
}

export interface SODRequest {
  schema_version: string
  agent: string
  client?: string
  client_version?: string
  host?: string
  venture: Venture
  repo: string
  track?: number
  issue_number?: number
  branch?: string
  commit_sha?: string
}

export interface EODRequest {
  schema_version: string
  session_id: string
  handoff: {
    summary: string
    status_label?: string
    to_agent?: string
    work_completed?: string[]
    blockers?: string[]
    next_actions?: string[]
    [key: string]: unknown // Allow additional fields
  }
}

export interface UpdateRequest {
  schema_version: string
  session_id: string
  branch?: string
  commit_sha?: string
  meta?: Record<string, unknown>
}

export interface HeartbeatRequest {
  schema_version: string
  session_id: string
}

export interface SODResponse {
  session: {
    id: string
    status: SessionStatus
    created_at: string
    last_heartbeat_at: string
    schema_version: string
    venture: string
    repo: string
    track?: number
    issue_number?: number
  }
  last_handoff?: {
    id: string
    summary: string
    status_label?: string
    created_at: string
    from_agent: string
  }
  active_sessions?: Array<{
    agent: string
    track?: number
    issue_number?: number
    last_heartbeat_at: string
  }>
}

export interface EODResponse {
  session_id: string
  handoff_id: string
  ended_at: string
}

export interface UpdateResponse {
  session_id: string
  updated_at: string
}

export interface HeartbeatResponse {
  session_id: string
  last_heartbeat_at: string
  next_heartbeat_at: string
  heartbeat_interval_seconds: number
}

export interface ActiveSessionsResponse {
  sessions: Array<{
    id: string
    agent: string
    venture: string
    repo: string
    track?: number
    issue_number?: number
    status: SessionStatus
    last_heartbeat_at: string
    created_at: string
  }>
  pagination?: {
    next_cursor?: string
  }
}
