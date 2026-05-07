export interface HandoffRecord {
  // Identity
  id: string

  // Linkage
  session_id: string

  // Context
  venture: string
  repo: string
  track: number | null
  issue_number: number | null
  branch: string | null
  commit_sha: string | null

  // Handoff metadata
  from_agent: string
  to_agent: string | null
  status_label: string | null
  summary: string

  // Payload
  payload_json: string
  payload_hash: string
  payload_size_bytes: number
  schema_version: string

  // Attribution & tracing
  created_at: string
  actor_key_id: string
  creation_correlation_id: string
}

export interface LatestHandoffResponse {
  handoff?: {
    id: string
    session_id: string
    from_agent: string
    to_agent?: string
    summary: string
    status_label?: string
    payload: Record<string, unknown>
    created_at: string
  }
}

export interface HandoffsResponse {
  handoffs: Array<{
    id: string
    session_id: string
    from_agent: string
    summary: string
    created_at: string
  }>
  pagination?: {
    next_cursor?: string
  }
}
