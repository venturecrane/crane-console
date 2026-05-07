/**
 * Crane Context API client — Base class (Part 1 of 2)
 *
 * Contains: venture cache, session management, doc operations,
 * machine management, note operations.
 */

import { hostname as osHostname } from 'node:os'
import { parseApiError } from './api-error.js'
import { SessionNotActiveError } from './crane-api-types.js'
import type {
  Venture,
  VenturesResponse,
  SosResponse,
  DocAuditResult,
  DocGetResponse,
  UploadDocRequest,
  UploadDocResponse,
  Machine,
  RegisterMachineRequest,
  RegisterMachineResponse,
  ListMachinesResponse,
  SshMeshConfigResponse,
  Note,
  CreateNoteRequest,
  CreateNoteResponse,
  ListNotesParams,
  ListNotesResponse,
  UpdateNoteRequest,
  GetNoteResponse,
} from './crane-api-types.js'

export { SessionNotActiveError } from './crane-api-types.js'

// ============================================================================
// In-memory venture cache (Plan §B.5 — defect #10)
//
// 5-minute TTL by default, configurable via CRANE_VENTURES_CACHE_TTL_SEC.
// ============================================================================

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

export function getHostname(): string {
  return process.env.HOSTNAME || osHostname() || 'unknown'
}

// ============================================================================
// CraneApiBase — session, doc, machine, note, schedule methods
// ============================================================================

export class CraneApiBase {
  protected apiKey: string
  protected apiBase: string

  constructor(apiKey: string, apiBase: string) {
    this.apiKey = apiKey
    this.apiBase = apiBase
  }

  async getVentures(options: { forceRefresh?: boolean } = {}): Promise<Venture[]> {
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
      throw await parseApiError(response, '/ventures')
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
    client_session_id?: string
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
        client_session_id: params.client_session_id,
        host: getHostname(),
        venture: params.venture,
        repo: params.repo,
        track: 1,
        include_docs: true,
        docs_format: 'index',
      }),
    })

    if (!response.ok) {
      throw await parseApiError(response, '/sos')
    }

    return (await response.json()) as SosResponse
  }

  /**
   * Refresh the session heartbeat. Called by the client-side debounced
   * refresh loop in heartbeat-refresh.ts to keep long sessions alive
   * during tool-heavy work or idle bash runs.
   *
   * Throws SessionNotActiveError on 409 so the caller can clearSession()
   * and halt further attempts against a dead session.
   */
  async refreshHeartbeat(sessionId: string): Promise<void> {
    const response = await fetch(`${this.apiBase}/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify({ session_id: sessionId }),
    })

    if (response.status === 409) {
      let status = 'unknown'
      try {
        const body = (await response.json()) as { details?: { status?: string } }
        if (body?.details?.status) {
          status = body.details.status
        }
      } catch {
        // Body was not JSON or malformed; fall through with 'unknown'
      }
      throw new SessionNotActiveError(status)
    }

    if (!response.ok) {
      throw new Error(`Heartbeat refresh failed (${response.status})`)
    }
  }

  /**
   * Find the most recent ended/abandoned session matching the tuple within
   * the last `withinHours` (default 48). Returns null when no candidate exists.
   */
  async getPriorSession(params: {
    agent: string
    venture: string
    repo: string
    track?: number | null
    host?: string | null
    withinHours?: number
  }): Promise<{
    id: string
    client_session_id: string | null
    last_activity_at: string | null
    ended_at: string | null
    created_at: string
    host: string | null
  } | null> {
    const qs = new URLSearchParams()
    qs.set('agent', params.agent)
    qs.set('venture', params.venture)
    qs.set('repo', params.repo)
    if (params.track !== undefined && params.track !== null) {
      qs.set('track', String(params.track))
    }
    if (params.host) {
      qs.set('host', params.host)
    }
    if (params.withinHours) {
      qs.set('within_hours', String(params.withinHours))
    }

    const response = await fetch(`${this.apiBase}/sessions/prior?${qs.toString()}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`getPriorSession failed (${response.status})`)
    }

    const body = (await response.json()) as {
      session: {
        id: string
        client_session_id: string | null
        last_activity_at: string | null
        ended_at: string | null
        created_at: string
        host: string | null
      } | null
    }
    return body.session
  }

  /**
   * Post a batch of activity events for a known crane session id.
   */
  async postSessionActivity(
    sessionId: string,
    events: Array<{ ts: string }>,
    source = 'cc_jsonl'
  ): Promise<{ recorded: number; skipped: number }> {
    const response = await fetch(
      `${this.apiBase}/sessions/${encodeURIComponent(sessionId)}/activity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Key': this.apiKey,
        },
        body: JSON.stringify({ events, source }),
      }
    )

    if (!response.ok) {
      throw new Error(`postSessionActivity failed (${response.status})`)
    }

    const body = (await response.json()) as { recorded: number; skipped: number }
    return body
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
    if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`)
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

  /**
   * Fetch the SOS memory injection gate from the worker.
   * Defaults to 'both' on any failure (most conservative).
   */
  async getMemoryInjectionGate(): Promise<'captain_approved' | 'injectable' | 'both'> {
    try {
      const response = await fetch(`${this.apiBase}/config/memory-gate`, {
        headers: { 'X-Relay-Key': this.apiKey },
      })
      if (!response.ok) return 'both'
      const data = (await response.json()) as { gate?: string }
      const gate = data.gate
      if (gate === 'captain_approved' || gate === 'injectable' || gate === 'both') {
        return gate
      }
      return 'both'
    } catch {
      return 'both'
    }
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
}
