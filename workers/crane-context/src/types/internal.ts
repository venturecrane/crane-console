export interface IdempotencyKeyRecord {
  // Composite key
  endpoint: string
  key: string

  // Response storage
  response_status: number
  response_hash: string
  response_body: string | null
  response_size_bytes: number
  response_truncated: number // 0 = false, 1 = true

  // TTL
  created_at: string
  expires_at: string

  // Attribution
  actor_key_id: string
  correlation_id: string
}

export interface RequestLogRecord {
  id: string

  // Request metadata
  timestamp: string
  correlation_id: string
  endpoint: string
  method: string

  // Context
  actor_key_id: string
  agent: string | null
  venture: string | null
  repo: string | null
  track: number | null
  issue_number: number | null

  // Response
  status_code: number
  duration_ms: number
  error_message: string | null

  // Idempotency
  idempotency_key: string | null
  idempotency_hit: number // 0 = false, 1 = true
}

export interface ErrorResponse {
  error: string
  details?: unknown
  correlation_id?: string
}

export interface ValidationErrorResponse {
  error: 'validation_failed'
  details: Array<{
    field: string
    message: string
    params?: Record<string, unknown>
  }>
  correlation_id: string
}

export interface PaginationCursor {
  timestamp: string // ISO 8601
  id: string // ULID
}

export interface AuthContext {
  actorKeyId: string
  correlationId: string
}

export interface RequestContext extends AuthContext {
  startTime: number
  endpoint: string
  method: string
}
