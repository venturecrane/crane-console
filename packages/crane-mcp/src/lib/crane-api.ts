/**
 * Crane Context API client
 */

import { hostname as osHostname } from 'node:os'

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

export interface SodResponse {
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
  count: number
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
}

// In-memory cache for session duration
let venturesCache: Venture[] | null = null

export class CraneApi {
  private apiKey: string
  private apiBase: string

  constructor(apiKey: string, apiBase: string) {
    this.apiKey = apiKey
    this.apiBase = apiBase
  }

  async getVentures(): Promise<Venture[]> {
    // Return cached if available
    if (venturesCache) {
      return venturesCache
    }

    const response = await fetch(`${this.apiBase}/ventures`)
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    const data = (await response.json()) as VenturesResponse
    venturesCache = data.ventures
    return data.ventures
  }

  async startSession(params: {
    venture: string
    repo: string
    agent: string
  }): Promise<SodResponse> {
    const response = await fetch(`${this.apiBase}/sod`, {
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

    return (await response.json()) as SodResponse
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
    const response = await fetch(`${this.apiBase}/eod`, {
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
}

function getHostname(): string {
  return process.env.HOSTNAME || osHostname() || 'unknown'
}
