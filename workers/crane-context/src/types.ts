/**
 * Crane Context Worker - Type Definitions
 *
 * Core types and interfaces for the Crane Context Worker.
 * Matches ADR 025 specification.
 */

import type { Venture, SessionStatus, EndReason } from './constants';

// Re-export for convenience
export type { Venture, SessionStatus, EndReason };

// ============================================================================
// Environment Bindings
// ============================================================================

export interface Env {
  // Database binding
  DB: D1Database;

  // Configuration (from wrangler.toml vars)
  CONTEXT_SESSION_STALE_MINUTES: string;
  IDEMPOTENCY_TTL_SECONDS: string;
  HEARTBEAT_INTERVAL_SECONDS: string;
  HEARTBEAT_JITTER_SECONDS: string;

  // Secrets (from wrangler secret put)
  CONTEXT_RELAY_KEY: string;
  CONTEXT_ADMIN_KEY: string;
}

// ============================================================================
// Database Records (as stored in D1)
// ============================================================================

export interface SessionRecord {
  // Identity
  id: string;

  // Session context
  agent: string;
  client: string | null;
  client_version: string | null;
  host: string | null;
  venture: string;
  repo: string;
  track: number | null;
  issue_number: number | null;
  branch: string | null;
  commit_sha: string | null;

  // Lifecycle
  status: SessionStatus;
  created_at: string;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  end_reason: EndReason | null;

  // Grouping (for parallel agent awareness)
  session_group_id: string | null;

  // Schema versioning
  schema_version: string;

  // Attribution & tracing
  actor_key_id: string;
  creation_correlation_id: string;

  // Extensibility
  meta_json: string | null;
}

export interface HandoffRecord {
  // Identity
  id: string;

  // Linkage
  session_id: string;

  // Context
  venture: string;
  repo: string;
  track: number | null;
  issue_number: number | null;
  branch: string | null;
  commit_sha: string | null;

  // Handoff metadata
  from_agent: string;
  to_agent: string | null;
  status_label: string | null;
  summary: string;

  // Payload
  payload_json: string;
  payload_hash: string;
  payload_size_bytes: number;
  schema_version: string;

  // Attribution & tracing
  created_at: string;
  actor_key_id: string;
  creation_correlation_id: string;
}

export interface CheckpointRecord {
  // Identity
  id: string;

  // Linkage
  session_id: string;

  // Context
  venture: string;
  repo: string;
  track: number | null;
  issue_number: number | null;
  branch: string | null;
  commit_sha: string | null;

  // Checkpoint content
  summary: string;
  work_completed: string | null;  // JSON array
  blockers: string | null;        // JSON array
  next_actions: string | null;    // JSON array
  notes: string | null;

  // Metadata
  checkpoint_number: number;
  created_at: string;

  // Attribution & tracing
  actor_key_id: string;
  correlation_id: string;
}

export interface IdempotencyKeyRecord {
  // Composite key
  endpoint: string;
  key: string;

  // Response storage
  response_status: number;
  response_hash: string;
  response_body: string | null;
  response_size_bytes: number;
  response_truncated: number; // 0 = false, 1 = true

  // TTL
  created_at: string;
  expires_at: string;

  // Attribution
  actor_key_id: string;
  correlation_id: string;
}

export interface RequestLogRecord {
  id: string;

  // Request metadata
  timestamp: string;
  correlation_id: string;
  endpoint: string;
  method: string;

  // Context
  actor_key_id: string;
  agent: string | null;
  venture: string | null;
  repo: string | null;
  track: number | null;
  issue_number: number | null;

  // Response
  status_code: number;
  duration_ms: number;
  error_message: string | null;

  // Idempotency
  idempotency_key: string | null;
  idempotency_hit: number; // 0 = false, 1 = true
}

// ============================================================================
// Machine Registry Records
// ============================================================================

export interface MachineRecord {
  id: string;
  hostname: string;
  tailscale_ip: string;
  user: string;
  os: string;
  arch: string;
  pubkey: string | null;
  role: string;
  status: string;
  registered_at: string;
  last_seen_at: string;
  meta_json: string | null;
  actor_key_id: string;
}

// ============================================================================
// API Request Types
// ============================================================================

export interface SODRequest {
  schema_version: string;
  agent: string;
  client?: string;
  client_version?: string;
  host?: string;
  venture: Venture;
  repo: string;
  track?: number;
  issue_number?: number;
  branch?: string;
  commit_sha?: string;
}

export interface EODRequest {
  schema_version: string;
  session_id: string;
  handoff: {
    summary: string;
    status_label?: string;
    to_agent?: string;
    work_completed?: string[];
    blockers?: string[];
    next_actions?: string[];
    [key: string]: unknown; // Allow additional fields
  };
}

export interface UpdateRequest {
  schema_version: string;
  session_id: string;
  branch?: string;
  commit_sha?: string;
  meta?: Record<string, unknown>;
}

export interface HeartbeatRequest {
  schema_version: string;
  session_id: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface SODResponse {
  session: {
    id: string;
    status: SessionStatus;
    created_at: string;
    last_heartbeat_at: string;
    schema_version: string;
    venture: string;
    repo: string;
    track?: number;
    issue_number?: number;
  };
  last_handoff?: {
    id: string;
    summary: string;
    status_label?: string;
    created_at: string;
    from_agent: string;
  };
  active_sessions?: Array<{
    agent: string;
    track?: number;
    issue_number?: number;
    last_heartbeat_at: string;
  }>;
}

export interface EODResponse {
  session_id: string;
  handoff_id: string;
  ended_at: string;
}

export interface UpdateResponse {
  session_id: string;
  updated_at: string;
}

export interface HeartbeatResponse {
  session_id: string;
  last_heartbeat_at: string;
  next_heartbeat_at: string;
  heartbeat_interval_seconds: number;
}

export interface ActiveSessionsResponse {
  sessions: Array<{
    id: string;
    agent: string;
    venture: string;
    repo: string;
    track?: number;
    issue_number?: number;
    status: SessionStatus;
    last_heartbeat_at: string;
    created_at: string;
  }>;
  pagination?: {
    next_cursor?: string;
  };
}

export interface LatestHandoffResponse {
  handoff?: {
    id: string;
    session_id: string;
    from_agent: string;
    to_agent?: string;
    summary: string;
    status_label?: string;
    payload: Record<string, unknown>;
    created_at: string;
  };
}

export interface HandoffsResponse {
  handoffs: Array<{
    id: string;
    session_id: string;
    from_agent: string;
    summary: string;
    created_at: string;
  }>;
  pagination?: {
    next_cursor?: string;
  };
}

// ============================================================================
// Error Response Types
// ============================================================================

export interface ErrorResponse {
  error: string;
  details?: unknown;
  correlation_id?: string;
}

export interface ValidationErrorResponse {
  error: 'validation_failed';
  details: Array<{
    field: string;
    message: string;
    params?: Record<string, unknown>;
  }>;
  correlation_id: string;
}

// ============================================================================
// Machine Registry Request/Response Types
// ============================================================================

export interface RegisterMachineRequest {
  hostname: string;
  tailscale_ip: string;
  user: string;
  os: string;
  arch: string;
  pubkey?: string;
  role?: string;
  meta?: Record<string, unknown>;
}

export interface RegisterMachineResponse {
  machine: MachineRecord;
  created: boolean;
}

export interface ListMachinesResponse {
  machines: MachineRecord[];
  count: number;
}

export interface MachineHeartbeatResponse {
  id: string;
  hostname: string;
  last_seen_at: string;
}

export interface SshMeshConfigResponse {
  config: string;
  machine_count: number;
  generated_for: string;
}

// ============================================================================
// Internal Types
// ============================================================================

export interface PaginationCursor {
  timestamp: string; // ISO 8601
  id: string;        // ULID
}

export interface AuthContext {
  actorKeyId: string;
  correlationId: string;
}

export interface RequestContext extends AuthContext {
  startTime: number;
  endpoint: string;
  method: string;
}
