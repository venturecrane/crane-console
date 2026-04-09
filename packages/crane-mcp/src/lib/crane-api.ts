/**
 * Crane Context API client
 */

import { hostname as osHostname } from 'node:os'

export interface Venture {
  code: string
  name: string
  org: string
  repos: string[]
  stitchProjectId: string | null
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
}

export interface CreateNoteRequest {
  title?: string
  content: string
  tags?: string[]
  venture?: string
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

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: string
  source: string
  event_type: string
  severity: string
  status: string
  summary: string
  details_json: string
  external_id: string | null
  dedupe_hash: string
  venture: string | null
  repo: string | null
  branch: string | null
  environment: string | null
  created_at: string
  received_at: string
  updated_at: string
  actor_key_id: string
}

export interface ListNotificationsParams {
  status?: string
  severity?: string
  venture?: string
  repo?: string
  source?: string
  limit?: number
  cursor?: string
}

export interface ListNotificationsResponse {
  notifications: Notification[]
  pagination?: {
    next_cursor?: string
  }
}

export interface UpdateNotificationStatusResponse {
  notification: Notification
}

// Plan §B.3: truthful counts endpoint
export interface NotificationCountsParams {
  status?: string
  severity?: string
  venture?: string
  repo?: string
  source?: string
}

export interface NotificationCountsResponse {
  total: number
  by_severity: {
    critical: number
    warning: number
    info: number
  }
  by_status: {
    new: number
    acked: number
    resolved: number
  }
  window: {
    retention_days: number
    filters: NotificationCountsParams
  }
  correlation_id?: string
}

// ============================================================================
// Deploy heartbeats (Plan §B.6)
// ============================================================================

export interface DeployHeartbeat {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch: string

  last_main_commit_at: string | null
  last_main_commit_sha: string | null

  last_success_at: string | null
  last_success_sha: string | null
  last_success_run_id: number | null

  last_run_at: string | null
  last_run_id: number | null
  last_run_conclusion: string | null

  consecutive_failures: number
  suppressed: number
  suppress_reason: string | null
  suppress_until: string | null
  cold_threshold_days: number

  created_at: string
  updated_at: string

  is_cold?: boolean
}

export interface ColdDeployHeartbeat extends DeployHeartbeat {
  age_ms: number
}

export interface DeployHeartbeatsResponse {
  venture: string
  heartbeats: DeployHeartbeat[]
  cold: ColdDeployHeartbeat[]
  stale_webhooks: DeployHeartbeat[]
  suppressed: DeployHeartbeat[]
  window: { stale_webhook_hours: number }
  correlation_id?: string
}

// ============================================================================
// Fleet health findings (Plan §C.4)
// ============================================================================

export type FleetFindingSeverity = 'error' | 'warning' | 'info'
export type FleetFindingStatus = 'new' | 'resolved'

export interface FleetHealthFinding {
  id: string
  generated_at: string
  repo_full_name: string
  finding_type: string
  severity: FleetFindingSeverity
  details_json: string
  status: FleetFindingStatus
  resolved_at: string | null
  resolve_reason: 'auto_snapshot' | 'manual' | null
  created_at: string
  updated_at: string
}

export interface FleetHealthSummary {
  total_open: number
  by_severity: { error: number; warning: number; info: number }
  newest_generated_at: string | null
  open_repos: number
}

export interface FleetHealthFindingsResponse {
  findings: FleetHealthFinding[]
  total: number
  summary: FleetHealthSummary
  correlation_id?: string
}

// In-memory cache for ventures (Plan §B.5 — defect #10).
//
// The previous implementation was a module-level variable that was NEVER
// invalidated, so a long-running session would never see venture-config
// updates. This made `crane_sos` lie when ventures were added or modified.
//
// Now: 5-minute TTL by default, configurable via `CRANE_VENTURES_CACHE_TTL_SEC`,
// with an explicit force-refresh option for health checks. The cache is
// still session-scoped (module-level) so most calls hit the cache, but
// the staleness is bounded.
const DEFAULT_VENTURES_CACHE_TTL_SEC = 300
let venturesCache: Venture[] | null = null
let venturesCacheFetchedAt = 0

function venturesCacheTtlMs(): number {
  const env = process.env.CRANE_VENTURES_CACHE_TTL_SEC
  if (env) {
    const parsed = Number.parseInt(env, 10)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed * 1000
    }
  }
  return DEFAULT_VENTURES_CACHE_TTL_SEC * 1000
}

/** Test-only: clear the venture cache so tests don't bleed across each other. */
export function _clearVenturesCacheForTests(): void {
  venturesCache = null
  venturesCacheFetchedAt = 0
}

export class CraneApi {
  private apiKey: string
  private apiBase: string

  constructor(apiKey: string, apiBase: string) {
    this.apiKey = apiKey
    this.apiBase = apiBase
  }

  async getVentures(options: { forceRefresh?: boolean } = {}): Promise<Venture[]> {
    // Return cached if still fresh and not forced.
    const now = Date.now()
    if (
      !options.forceRefresh &&
      venturesCache &&
      now - venturesCacheFetchedAt < venturesCacheTtlMs()
    ) {
      return venturesCache
    }

    const response = await fetch(`${this.apiBase}/ventures`)
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    const data = (await response.json()) as VenturesResponse
    venturesCache = data.ventures
    venturesCacheFetchedAt = now
    return data.ventures
  }

  async startSession(params: {
    venture: string
    repo: string
    agent: string
  }): Promise<SosResponse> {
    const response = await fetch(`${this.apiBase}/sos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify({
        schema_version: '1.0',
        agent: params.agent,
        client: 'crane-mcp',
        client_version: '0.1.0',
        host: getHostname(),
        venture: params.venture,
        repo: params.repo,
        track: 1,
        include_docs: true,
        docs_format: 'index',
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as SosResponse
  }

  async getDocAudit(
    venture?: string
  ): Promise<{ audit?: DocAuditResult; audits?: DocAuditResult[] }> {
    const url = venture
      ? `${this.apiBase}/docs/audit?venture=${encodeURIComponent(venture)}`
      : `${this.apiBase}/docs/audit`

    const response = await fetch(url, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as { audit?: DocAuditResult; audits?: DocAuditResult[] }
  }

  async getDoc(scope: string, docName: string): Promise<DocGetResponse | null> {
    const response = await fetch(
      `${this.apiBase}/docs/${encodeURIComponent(scope)}/${encodeURIComponent(docName)}`,
      { headers: { 'X-Relay-Key': this.apiKey } }
    )
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const data = (await response.json()) as { doc: DocGetResponse }
    return data.doc
  }

  async uploadDoc(doc: UploadDocRequest): Promise<UploadDocResponse> {
    const adminKey = process.env.CRANE_ADMIN_KEY || this.apiKey

    const response = await fetch(`${this.apiBase}/admin/docs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify(doc),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Upload failed (${response.status}): ${text}`)
    }

    return (await response.json()) as UploadDocResponse
  }

  async touchDoc(scope: string, docName: string): Promise<void> {
    const adminKey = process.env.CRANE_ADMIN_KEY || this.apiKey

    const response = await fetch(`${this.apiBase}/admin/docs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify({
        scope,
        doc_name: docName,
        touch_only: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Touch failed (${response.status}): ${text}`)
    }
  }

  async listMachines(): Promise<Machine[]> {
    const response = await fetch(`${this.apiBase}/machines`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = (await response.json()) as ListMachinesResponse
    return data.machines
  }

  async registerMachine(params: RegisterMachineRequest): Promise<RegisterMachineResponse> {
    const response = await fetch(`${this.apiBase}/machines/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Register failed (${response.status}): ${text}`)
    }

    return (await response.json()) as RegisterMachineResponse
  }

  async getSshMeshConfig(forHostname: string): Promise<SshMeshConfigResponse> {
    const response = await fetch(
      `${this.apiBase}/machines/ssh-mesh-config?for=${encodeURIComponent(forHostname)}`,
      {
        headers: {
          'X-Relay-Key': this.apiKey,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as SshMeshConfigResponse
  }

  async createNote(params: CreateNoteRequest): Promise<Note> {
    const response = await fetch(`${this.apiBase}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Create note failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as CreateNoteResponse
    return data.note
  }

  async listNotes(params: ListNotesParams = {}): Promise<ListNotesResponse> {
    const queryParts: string[] = []
    if (params.venture) queryParts.push(`venture=${encodeURIComponent(params.venture)}`)
    if (params.tag) queryParts.push(`tag=${encodeURIComponent(params.tag)}`)
    if (params.q) queryParts.push(`q=${encodeURIComponent(params.q)}`)
    if (params.limit) queryParts.push(`limit=${params.limit}`)
    if (params.include_archived) queryParts.push('include_archived=true')

    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

    const response = await fetch(`${this.apiBase}/notes${qs}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as ListNotesResponse
  }

  async getNote(id: string): Promise<Note> {
    const response = await fetch(`${this.apiBase}/notes/${encodeURIComponent(id)}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = (await response.json()) as GetNoteResponse
    return data.note
  }

  async updateNote(id: string, params: UpdateNoteRequest): Promise<Note> {
    const response = await fetch(`${this.apiBase}/notes/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Update note failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as GetNoteResponse
    return data.note
  }

  async archiveNote(id: string): Promise<void> {
    const response = await fetch(`${this.apiBase}/notes/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
  }

  async createHandoff(handoff: HandoffRequest): Promise<void> {
    const response = await fetch(`${this.apiBase}/eos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify({
        schema_version: '1.0',
        agent: handoff.agent,
        venture: handoff.venture,
        repo: handoff.repo,
        session_id: handoff.session_id,
        summary: handoff.summary,
        status_label: handoff.status,
        issue_number: handoff.issue_number,
        last_activity_at: handoff.last_activity_at,
        payload: handoff.payload ?? {},
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Handoff failed (${response.status}): ${text}`)
    }
  }

  async getScheduleBriefing(scope?: string): Promise<ScheduleBriefingResponse> {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ''

    const response = await fetch(`${this.apiBase}/schedule/briefing${qs}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as ScheduleBriefingResponse
  }

  async completeScheduleItem(
    name: string,
    params: CompleteScheduleParams
  ): Promise<CompleteScheduleResponse> {
    const response = await fetch(`${this.apiBase}/schedule/${encodeURIComponent(name)}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Complete schedule item failed (${response.status}): ${text}`)
    }

    return (await response.json()) as CompleteScheduleResponse
  }

  async getScheduleItems(): Promise<ScheduleItemsResponse> {
    const response = await fetch(`${this.apiBase}/schedule/items`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as ScheduleItemsResponse
  }

  async linkScheduleCalendar(
    name: string,
    gcalEventId: string | null
  ): Promise<LinkScheduleCalendarResponse> {
    const response = await fetch(
      `${this.apiBase}/schedule/${encodeURIComponent(name)}/link-calendar`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Key': this.apiKey,
        },
        body: JSON.stringify({ gcal_event_id: gcalEventId }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Link calendar failed (${response.status}): ${text}`)
    }

    return (await response.json()) as LinkScheduleCalendarResponse
  }

  async upsertWorkDay(
    action: 'start' | 'end',
    gcalEventId?: string | null
  ): Promise<WorkDayResponse> {
    const body: Record<string, unknown> = { action }
    if (gcalEventId !== undefined) {
      body.gcal_event_id = gcalEventId
    }

    const response = await fetch(`${this.apiBase}/work-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Upsert work day failed (${response.status}): ${text}`)
    }

    return (await response.json()) as WorkDayResponse
  }

  async getPlannedEvents(from: string, to: string, type?: string): Promise<PlannedEvent[]> {
    const queryParts: string[] = [
      `from=${encodeURIComponent(from)}`,
      `to=${encodeURIComponent(to)}`,
    ]
    if (type) queryParts.push(`type=${encodeURIComponent(type)}`)

    const response = await fetch(`${this.apiBase}/planned-events?${queryParts.join('&')}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = (await response.json()) as { events: PlannedEvent[] }
    return data.events
  }

  async createPlannedEvent(input: CreatePlannedEventInput): Promise<PlannedEvent> {
    const response = await fetch(`${this.apiBase}/planned-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Create planned event failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { event: PlannedEvent }
    return data.event
  }

  async updatePlannedEvent(
    id: string,
    updates: Partial<
      Pick<PlannedEvent, 'type' | 'start_time' | 'end_time' | 'sync_status' | 'gcal_event_id'>
    >
  ): Promise<PlannedEvent> {
    const response = await fetch(`${this.apiBase}/planned-events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Update planned event failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { event: PlannedEvent }
    return data.event
  }

  async clearPlannedEvents(from: string): Promise<{ deleted: number }> {
    const response = await fetch(
      `${this.apiBase}/planned-events?from=${encodeURIComponent(from)}&type=planned`,
      {
        method: 'DELETE',
        headers: {
          'X-Relay-Key': this.apiKey,
        },
      }
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Clear planned events failed (${response.status}): ${text}`)
    }

    return (await response.json()) as { deleted: number }
  }

  async getSessionHistory(days: number): Promise<SessionHistoryEntry[]> {
    const response = await fetch(`${this.apiBase}/sessions/history?days=${days}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = (await response.json()) as { entries: SessionHistoryEntry[] }
    return data.entries
  }

  /**
   * Get TRUE notification counts (not paginated). Plan §B.3 - the missing
   * endpoint that fixes the loudest defect (SOS displaying "10 unresolved"
   * when DB has 270).
   */
  async getNotificationCounts(
    params: NotificationCountsParams = {}
  ): Promise<NotificationCountsResponse> {
    const queryParts: string[] = []
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`)
    if (params.severity) queryParts.push(`severity=${encodeURIComponent(params.severity)}`)
    if (params.venture) queryParts.push(`venture=${encodeURIComponent(params.venture)}`)
    if (params.repo) queryParts.push(`repo=${encodeURIComponent(params.repo)}`)
    if (params.source) queryParts.push(`source=${encodeURIComponent(params.source)}`)
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

    const response = await fetch(`${this.apiBase}/notifications/counts${qs}`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })

    if (!response.ok) {
      throw new Error(`Notification counts API error: ${response.status}`)
    }

    return (await response.json()) as NotificationCountsResponse
  }

  async listNotifications(
    params: ListNotificationsParams = {}
  ): Promise<ListNotificationsResponse> {
    const queryParts: string[] = []
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`)
    if (params.severity) queryParts.push(`severity=${encodeURIComponent(params.severity)}`)
    if (params.venture) queryParts.push(`venture=${encodeURIComponent(params.venture)}`)
    if (params.repo) queryParts.push(`repo=${encodeURIComponent(params.repo)}`)
    if (params.source) queryParts.push(`source=${encodeURIComponent(params.source)}`)
    if (params.limit) queryParts.push(`limit=${params.limit}`)
    if (params.cursor) queryParts.push(`cursor=${encodeURIComponent(params.cursor)}`)

    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

    const response = await fetch(`${this.apiBase}/notifications${qs}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as ListNotificationsResponse
  }

  async updateNotificationStatus(
    id: string,
    status: 'acked' | 'resolved'
  ): Promise<UpdateNotificationStatusResponse> {
    const response = await fetch(`${this.apiBase}/notifications/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Update notification status failed (${response.status}): ${text}`)
    }

    return (await response.json()) as UpdateNotificationStatusResponse
  }

  async queryHandoffs(params: QueryHandoffsParams): Promise<QueryHandoffsResponse> {
    const queryParts: string[] = [
      `venture=${encodeURIComponent(params.venture)}`,
      `repo=${encodeURIComponent(params.repo)}`,
    ]
    if (params.track !== undefined) queryParts.push(`track=${params.track}`)
    if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`)

    const response = await fetch(`${this.apiBase}/handoffs?${queryParts.join('&')}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Query handoffs failed (${response.status}): ${text}`)
    }

    return (await response.json()) as QueryHandoffsResponse
  }

  async updateHandoffStatus(
    handoffId: string,
    statusLabel: string
  ): Promise<{ handoff: HandoffRecord }> {
    const response = await fetch(
      `${this.apiBase}/handoffs/${encodeURIComponent(handoffId)}/status`,
      {
        method: 'POST',
        headers: {
          'X-Relay-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status_label: statusLabel }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Update handoff status failed (${response.status}): ${text}`)
    }

    return (await response.json()) as { handoff: HandoffRecord }
  }

  // ============================================================================
  // Deploy heartbeats (Plan §B.6 — defect: cold deploy detector)
  // ============================================================================

  async getDeployHeartbeats(venture: string): Promise<DeployHeartbeatsResponse> {
    const response = await fetch(
      `${this.apiBase}/deploy-heartbeats?venture=${encodeURIComponent(venture)}`,
      {
        headers: { 'X-Relay-Key': this.apiKey },
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Deploy heartbeats failed (${response.status}): ${text}`)
    }
    return (await response.json()) as DeployHeartbeatsResponse
  }

  async suppressDeployHeartbeat(params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
    reason: string
    until?: string | null
  }): Promise<void> {
    const response = await fetch(`${this.apiBase}/deploy-heartbeats/suppress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Suppress heartbeat failed (${response.status}): ${text}`)
    }
  }

  async unsuppressDeployHeartbeat(params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
  }): Promise<void> {
    const response = await fetch(`${this.apiBase}/deploy-heartbeats/unsuppress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Unsuppress heartbeat failed (${response.status}): ${text}`)
    }
  }

  async seedDeployHeartbeat(params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
    cold_threshold_days?: number
  }): Promise<void> {
    const response = await fetch(`${this.apiBase}/deploy-heartbeats/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Seed heartbeat failed (${response.status}): ${text}`)
    }
  }

  // ============================================================================
  // Fleet health findings (Plan §C.4)
  // ============================================================================

  /**
   * List fleet health findings. Defaults to open findings, newest first.
   * Returns summary counts alongside the paginated list so the SOS can
   * render "X open (Y errors, Z warnings)" without a second round trip.
   */
  async getFleetHealthFindings(
    opts: {
      status?: FleetFindingStatus | 'all'
      severity?: FleetFindingSeverity
      repo?: string
      type?: string
      limit?: number
    } = {}
  ): Promise<FleetHealthFindingsResponse> {
    const params = new URLSearchParams()
    if (opts.status) params.set('status', opts.status)
    if (opts.severity) params.set('severity', opts.severity)
    if (opts.repo) params.set('repo', opts.repo)
    if (opts.type) params.set('type', opts.type)
    if (opts.limit !== undefined) params.set('limit', String(opts.limit))

    const qs = params.toString()
    const url = `${this.apiBase}/fleet-health/findings${qs ? `?${qs}` : ''}`

    const response = await fetch(url, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Fleet health findings failed (${response.status}): ${text}`)
    }
    return (await response.json()) as FleetHealthFindingsResponse
  }

  /**
   * Summary counts only — used by System Health check and SOS header.
   */
  async getFleetHealthSummary(): Promise<{ summary: FleetHealthSummary }> {
    const response = await fetch(`${this.apiBase}/fleet-health/summary`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Fleet health summary failed (${response.status}): ${text}`)
    }
    return (await response.json()) as { summary: FleetHealthSummary }
  }

  /**
   * Manually resolve a finding (Captain triaged it out of band).
   */
  async resolveFleetHealthFinding(
    findingId: string
  ): Promise<{ ok: boolean; already_resolved?: boolean }> {
    const response = await fetch(
      `${this.apiBase}/fleet-health/findings/${encodeURIComponent(findingId)}/resolve`,
      {
        method: 'POST',
        headers: { 'X-Relay-Key': this.apiKey },
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Resolve fleet finding failed (${response.status}): ${text}`)
    }
    return (await response.json()) as { ok: boolean; already_resolved?: boolean }
  }
}

function getHostname(): string {
  return process.env.HOSTNAME || osHostname() || 'unknown'
}
