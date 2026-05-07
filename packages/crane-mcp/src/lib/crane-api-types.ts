/**
 * Crane Context API - Core Types (Part 1)
 *
 * Contains: SessionNotActiveError, Venture, Session, Doc, SOS, Handoff,
 * Machine, Note, Schedule, PlannedEvent, SessionHistory types.
 */

export class SessionNotActiveError extends Error {
  constructor(public readonly sessionStatus: string) {
    super(`Session not active: ${sessionStatus}`)
    this.name = 'SessionNotActiveError'
  }
}

export interface Venture {
  code: string
  name: string
  org: string
  repos: string[]
}

export interface VenturesResponse {
  ventures: Venture[]
}

export interface Session {
  id: string
  status: string
  venture: string
  repo: string
  created_at: string
}

export interface ActiveSession {
  agent: string
  repo: string
  track?: number
  issue_number?: number
  created_at: string
}

export interface DocAuditMissing {
  doc_name: string
  required: boolean
  description: string | null
  auto_generate: boolean
  generation_sources: string[]
}

export interface DocAuditStale {
  doc_name: string
  scope: string
  version: number
  updated_at: string
  days_since_update: number
  staleness_threshold_days: number
  auto_generate: boolean
  generation_sources: string[]
}

export interface DocAuditPresent {
  doc_name: string
  scope: string
  version: number
  updated_at: string
}

export interface DocAuditResult {
  venture: string
  venture_name: string
  status: 'complete' | 'incomplete' | 'warning'
  missing: DocAuditMissing[]
  stale: DocAuditStale[]
  present: DocAuditPresent[]
  summary: string
}

export interface VentureDoc {
  doc_name: string
  scope: string
  version: number
  content: string
  updated_at: string
}

export interface DocGetResponse {
  scope: string
  doc_name: string
  content: string
  content_hash: string
  title: string | null
  description: string | null
  version: number
}

export interface SosResponse {
  session: Session
  last_handoff?: {
    summary: string
    from_agent: string
    created_at: string
    status_label: string
  }
  active_sessions?: ActiveSession[]
  doc_audit?: DocAuditResult
  documentation?: {
    docs: VentureDoc[]
    count: number
    content_hash?: string
  }
  doc_index?: {
    docs: Array<{
      scope: string
      doc_name: string
      content_hash: string
      title: string | null
      version: number
    }>
    count: number
  }
  enterprise_context?: {
    notes: Note[]
    count: number
  }
  knowledge_base?: {
    notes: Array<{
      id: string
      title: string | null
      tags: string | null
      venture: string | null
      updated_at: string
    }>
    count: number
  }
}

export interface UploadDocRequest {
  scope: string
  doc_name: string
  content: string
  title?: string
  description?: string
  source_repo?: string
  source_path?: string
  uploaded_by?: string
  touch_only?: boolean
}

export interface UploadDocResponse {
  success: boolean
  scope: string
  doc_name: string
  version: number
  content_hash: string
  content_size_bytes: number
  created: boolean
}

export interface HandoffRequest {
  venture: string
  repo: string
  agent: string
  summary: string
  status: 'in_progress' | 'blocked' | 'done'
  session_id: string
  issue_number?: number
  payload?: Record<string, unknown>
  last_activity_at?: string
  // When true, create the handoff record but keep the session active. Used by
  // multi-venture flows that emit one handoff per venture before terminating.
  keep_session_open?: boolean
}

export interface HandoffRecord {
  id: string
  session_id: string
  venture: string
  repo: string
  from_agent: string
  summary: string
  status_label: string
  issue_number?: number
  created_at: string
}

export interface QueryHandoffsParams {
  venture: string
  repo: string
  track?: number
  limit?: number
}

export interface QueryHandoffsResponse {
  handoffs: HandoffRecord[]
  has_more: boolean
  /**
   * True total of handoffs matching the filter (Plan §B.2 — defect #2).
   * Always present when the SOS calls /handoffs with a filter; older
   * server versions may omit it, in which case callers must treat the
   * count as unknown (use `unknownTotal()` from truthful-display).
   */
  total?: number
}

export interface Machine {
  id: string
  hostname: string
  tailscale_ip: string
  user: string
  os: string
  arch: string
  pubkey: string | null
  role: string
  status: string
  registered_at: string
  last_seen_at: string
}

export interface RegisterMachineRequest {
  hostname: string
  tailscale_ip: string
  user: string
  os: string
  arch: string
  pubkey?: string
  role?: string
  meta?: Record<string, unknown>
}

export interface RegisterMachineResponse {
  machine: Machine
  created: boolean
}

export interface ListMachinesResponse {
  machines: Machine[]
  count: number
}

export interface SshMeshConfigResponse {
  config: string
  machine_count: number
  generated_for: string
}

export interface Note {
  id: string
  title: string | null
  content: string
  tags: string | null
  venture: string | null
  archived: number
  created_at: string
  updated_at: string
  actor_key_id: string | null
  meta_json: string | null
  // Provenance + curator fields (migration 0044+, optional on legacy rows)
  authored_by_session_id?: string | null
  source_hash?: string | null
  embedding_model?: string | null
  embedding_version?: string | null
  embedding_hash?: string | null
  injectable?: number
}

export interface CreateNoteRequest {
  title?: string
  content: string
  tags?: string[]
  venture?: string
  source_hash?: string
  authored_by_session_id?: string
}

export interface CreateNoteResponse {
  note: Note
}

export interface ListNotesParams {
  venture?: string
  tag?: string
  q?: string
  limit?: number
  include_archived?: boolean
}

export interface ListNotesResponse {
  notes: Note[]
  /** Length of the returned `notes` slice (NOT the true total). */
  count: number
  /**
   * True total of notes matching the filter (Plan §B.2 — defect #5).
   * Older server versions may omit this; callers must use `unknownTotal()`
   * from truthful-display when undefined.
   */
  total_matching?: number
  pagination?: {
    next_cursor?: string
  }
}

export interface UpdateNoteRequest {
  title?: string
  content?: string
  tags?: string[]
  venture?: string | null
}

export interface GetNoteResponse {
  note: Note
}

// ============================================================================
// Schedule Types
// ============================================================================

export interface ScheduleBriefingItem {
  name: string
  title: string
  description: string | null
  cadence_days: number
  scope: string
  priority: number
  status: 'overdue' | 'due' | 'untracked'
  days_since: number | null
  last_completed_at: string | null
  last_completed_by: string | null
  last_result: string | null
  last_result_summary: string | null
}

export interface ScheduleBriefingResponse {
  items: ScheduleBriefingItem[]
  overdue_count: number
  due_count: number
  untracked_count: number
}

export interface CompleteScheduleParams {
  result: 'success' | 'warning' | 'failure' | 'skipped'
  summary?: string
  completed_by?: string
}

export interface CompleteScheduleResponse {
  name: string
  completed_at: string
  result: string
  gcal_event_id: string | null
  next_due_date: string | null
}

export interface ScheduleItem {
  name: string
  title: string
  description: string | null
  cadence_days: number
  scope: string
  priority: number
  status: 'overdue' | 'due' | 'untracked' | 'current'
  days_since: number | null
  last_completed_at: string | null
  last_completed_by: string | null
  last_result: string | null
  last_result_summary: string | null
  gcal_event_id: string | null
  next_due_date: string | null
}

export interface ScheduleItemsResponse {
  items: ScheduleItem[]
  count: number
}

export interface LinkScheduleCalendarResponse {
  name: string
  gcal_event_id: string | null
  updated_at: string
}

export interface WorkDay {
  date: string
  gcal_event_id: string | null
  started_at: string
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkDayResponse {
  work_day: WorkDay
}

export interface PlannedEvent {
  id: string
  event_date: string
  venture: string
  gcal_event_id: string | null
  title: string
  start_time: string
  end_time: string
  type: 'planned' | 'actual' | 'cancelled'
  sync_status: 'pending' | 'synced' | 'error'
  created_at: string
  updated_at: string
}

export interface CreatePlannedEventInput {
  event_date: string
  venture: string
  title: string
  start_time: string
  end_time: string
  gcal_event_id?: string | null
  type?: 'planned' | 'actual' | 'cancelled'
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
