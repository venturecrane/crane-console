/**
 * Worker-compatible crane-context API client.
 *
 * Differences from packages/crane-mcp/src/lib/crane-api.ts:
 * - No node:os import (Worker runtime)
 * - KV cache layer for read resilience
 * - X-Actor-Identity header for audit traceability
 * - No module-level cache (Workers are stateless per request)
 */

// ============================================================================
// Types (subset - only what the remote tools need)
// ============================================================================

export interface VenturePortfolio {
  status: string
  bvmStage: string | null
  tagline: string | null
  description: string | null
  techStack: string[]
}

export interface Venture {
  code: string
  name: string
  org: string
  repos: string[]
  stitchProjectId: string | null
  portfolio?: VenturePortfolio
}

export interface ActiveSession {
  agent: string
  repo: string
  track?: number
  issue_number?: number
  created_at: string
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

export interface DocGetResponse {
  scope: string
  doc_name: string
  content: string
  title: string | null
  description: string | null
  version: number
}

export interface DocAuditResult {
  venture: string
  venture_name: string
  status: 'complete' | 'incomplete' | 'warning'
  missing: Array<{
    doc_name: string
    required: boolean
    description: string | null
  }>
  stale: Array<{
    doc_name: string
    scope: string
    days_since_update: number
  }>
  present: Array<{
    doc_name: string
    scope: string
    version: number
    updated_at: string
  }>
  summary: string
}

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

export interface CompleteScheduleResponse {
  name: string
  completed_at: string
  result: string
}

// ============================================================================
// API Client
// ============================================================================

const CACHE_TTL_SECONDS = 300 // 5 minutes

export class CraneContextClient {
  constructor(
    private apiUrl: string,
    private apiKey: string,
    private actorIdentity: string,
    private cacheKv: KVNamespace
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'X-Relay-Key': this.apiKey,
      'X-Actor-Identity': this.actorIdentity,
      ...extra,
    }
  }

  /**
   * GET with KV cache fallback. On success, caches the response.
   * On failure, returns cached data with stale=true if available.
   */
  private async cachedGet<T>(
    path: string,
    cacheKey?: string
  ): Promise<{ data: T; stale: boolean }> {
    const key = cacheKey || `cache:${path}`

    try {
      const resp = await fetch(`${this.apiUrl}${path}`, {
        headers: this.headers(),
      })
      if (!resp.ok) {
        throw new Error(`crane-context ${resp.status}: ${await resp.text()}`)
      }
      const data = (await resp.json()) as T
      // Cache in background - don't block the response
      this.cacheKv
        .put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL_SECONDS })
        .catch(() => {})
      return { data, stale: false }
    } catch (err) {
      const cached = await this.cacheKv.get(key)
      if (cached) {
        return { data: JSON.parse(cached) as T, stale: true }
      }
      throw err
    }
  }

  /**
   * POST without caching (for write operations).
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const resp = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`crane-context ${resp.status}: ${text}`)
    }
    return (await resp.json()) as T
  }

  /**
   * Health check - verifies crane-context is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.apiUrl}/health`)
      return resp.ok
    } catch {
      return false
    }
  }

  async getVentures(): Promise<{ ventures: Venture[]; stale: boolean }> {
    const result = await this.cachedGet<{ ventures: Venture[] }>('/ventures')
    return { ventures: result.data.ventures, stale: result.stale }
  }

  async getScheduleBriefing(
    scope?: string
  ): Promise<{ data: ScheduleBriefingResponse; stale: boolean }> {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ''
    return this.cachedGet<ScheduleBriefingResponse>(`/schedule/briefing${qs}`)
  }

  async completeScheduleItem(
    name: string,
    params: { result: string; summary?: string; completed_by?: string }
  ): Promise<CompleteScheduleResponse> {
    return this.post<CompleteScheduleResponse>(
      `/schedule/${encodeURIComponent(name)}/complete`,
      params
    )
  }

  async listNotes(params: {
    venture?: string
    tag?: string
    tags?: string[]
    q?: string
    limit?: number
    include_global?: boolean
  }): Promise<{ data: { notes: Note[]; count: number }; stale: boolean }> {
    const parts: string[] = []
    if (params.venture) parts.push(`venture=${encodeURIComponent(params.venture)}`)
    if (params.tag) parts.push(`tag=${encodeURIComponent(params.tag)}`)
    if (params.tags && params.tags.length > 0) {
      parts.push(`tags=${encodeURIComponent(params.tags.join(','))}`)
    }
    if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`)
    if (params.limit) parts.push(`limit=${params.limit}`)
    if (params.include_global) parts.push('include_global=true')
    const qs = parts.length > 0 ? `?${parts.join('&')}` : ''
    return this.cachedGet<{ notes: Note[]; count: number }>(`/notes${qs}`)
  }

  async getNote(id: string): Promise<{ data: { note: Note }; stale: boolean }> {
    return this.cachedGet<{ note: Note }>(`/notes/${encodeURIComponent(id)}`)
  }

  async getDoc(
    scope: string,
    docName: string
  ): Promise<{ data: DocGetResponse | null; stale: boolean }> {
    const path = `/docs/${encodeURIComponent(scope)}/${encodeURIComponent(docName)}`
    try {
      const resp = await fetch(`${this.apiUrl}${path}`, {
        headers: this.headers(),
      })
      if (resp.status === 404) {
        return { data: null, stale: false }
      }
      if (!resp.ok) {
        throw new Error(`crane-context ${resp.status}`)
      }
      const result = (await resp.json()) as { doc: DocGetResponse }
      const cacheKey = `cache:${path}`
      this.cacheKv
        .put(cacheKey, JSON.stringify(result.doc), { expirationTtl: CACHE_TTL_SECONDS })
        .catch(() => {})
      return { data: result.doc, stale: false }
    } catch (err) {
      const cached = await this.cacheKv.get(`cache:${path}`)
      if (cached) {
        return { data: JSON.parse(cached) as DocGetResponse, stale: true }
      }
      throw err
    }
  }

  async getDocAudit(venture?: string): Promise<{
    data: { audit?: DocAuditResult; audits?: DocAuditResult[] }
    stale: boolean
  }> {
    const qs = venture ? `?venture=${encodeURIComponent(venture)}` : ''
    return this.cachedGet<{ audit?: DocAuditResult; audits?: DocAuditResult[] }>(`/docs/audit${qs}`)
  }

  async getActiveSessions(): Promise<{ data: { sessions: ActiveSession[] }; stale: boolean }> {
    return this.cachedGet<{ sessions: ActiveSession[] }>('/active')
  }

  async getHandoffs(params: {
    venture?: string
    repo?: string
    limit?: number
  }): Promise<{ data: { handoffs: HandoffRecord[] }; stale: boolean }> {
    const parts: string[] = []
    if (params.venture) parts.push(`venture=${encodeURIComponent(params.venture)}`)
    if (params.repo) parts.push(`repo=${encodeURIComponent(params.repo)}`)
    if (params.limit) parts.push(`limit=${params.limit}`)
    const qs = parts.length > 0 ? `?${parts.join('&')}` : ''
    return this.cachedGet<{ handoffs: HandoffRecord[] }>(`/handoffs${qs}`)
  }
}
