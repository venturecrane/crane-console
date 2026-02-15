/**
 * Crane Context Worker - Constants
 *
 * Central configuration constants referenced throughout the codebase.
 * Values match ADR 025 specification.
 */

import venturesJson from '../../../config/ventures.json'

// ============================================================================
// Payload Size Limits
// ============================================================================

/**
 * Maximum handoff payload size: 800KB
 * D1 row limit is 1MB; 800KB leaves 200KB for metadata columns
 */
export const MAX_HANDOFF_PAYLOAD_SIZE = 800 * 1024

/**
 * Maximum idempotency response body size: 64KB
 * Hybrid storage threshold - full body stored if below, hash-only if above
 */
export const MAX_IDEMPOTENCY_BODY_SIZE = 64 * 1024

/**
 * Maximum request body size: 1MB
 * General limit for all incoming request payloads
 */
export const MAX_REQUEST_BODY_SIZE = 1024 * 1024

// ============================================================================
// TTL & Expiry
// ============================================================================

/**
 * Idempotency key TTL: 1 hour (3600 seconds)
 * Retry windows are typically seconds/minutes; 1 hour provides safety margin
 */
export const IDEMPOTENCY_TTL_SECONDS = 3600

/**
 * Request log retention: 7 days
 * Enforced via filter-on-read in Phase 1, scheduled cleanup in Phase 2
 */
export const REQUEST_LOG_RETENTION_DAYS = 7

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * Session staleness threshold: 45 minutes
 * Default value - can be overridden via CONTEXT_SESSION_STALE_MINUTES env var
 */
export const STALE_AFTER_MINUTES = 45

/**
 * Heartbeat interval: 10 minutes (600 seconds)
 * Base interval before jitter is applied
 * Provides 4.5x safety margin before staleness
 */
export const HEARTBEAT_INTERVAL_SECONDS = 600

/**
 * Heartbeat jitter: ±2 minutes (±120 seconds)
 * Prevents thundering herd by randomizing heartbeat timing
 */
export const HEARTBEAT_JITTER_SECONDS = 120

// ============================================================================
// Auth & Attribution
// ============================================================================

/**
 * Actor key ID length: 16 hex characters
 * Derived from SHA-256(key).substring(0, 16)
 * Represents 8 bytes of hash
 */
export const ACTOR_KEY_ID_LENGTH = 16

// ============================================================================
// ID Formats
// ============================================================================

/**
 * ID prefixes for different entity types
 * All use ULID format for sortability and timestamp embedding
 */
export const ID_PREFIXES = {
  SESSION: 'sess_',
  HANDOFF: 'ho_',
  CHECKPOINT: 'cp_',
  CORRELATION: 'corr_',
  MACHINE: 'mach_',
  NOTE: 'note_',
  SCHEDULE: 'sched_',
} as const

// ============================================================================
// Notes
// ============================================================================

/**
 * Recommended tags for the enterprise knowledge store (VCMS)
 * Informational - agents and humans can use any tag
 */
export const RECOMMENDED_TAGS = [
  'executive-summary',
  'prd',
  'design',
  'strategy',
  'methodology',
  'market-research',
  'bio',
  'marketing',
  'governance',
] as const

/**
 * Maximum note content size: 500KB
 * D1 rows cap at 1MB; 500KB leaves headroom for metadata columns
 */
export const MAX_NOTE_CONTENT_SIZE = 500 * 1024

// ============================================================================
// Schema Versions
// ============================================================================

/**
 * Current schema version for all entities
 * Increment when making breaking changes to API contracts
 */
export const CURRENT_SCHEMA_VERSION = '1.0'

// ============================================================================
// Pagination
// ============================================================================

/**
 * Default page size for paginated queries
 */
export const DEFAULT_PAGE_SIZE = 20

/**
 * Maximum page size for paginated queries
 */
export const MAX_PAGE_SIZE = 100

// ============================================================================
// HTTP Status Codes
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
} as const

// ============================================================================
// Venture Enum
// ============================================================================

/**
 * Full venture metadata - single source of truth
 * Loaded from config/ventures.json
 *
 * To add a new venture:
 * 1. Edit config/ventures.json
 * 2. Deploy crane-context: cd workers/crane-context && npm run deploy
 * 3. (Optional) Run /new-venture for full setup
 *
 * See docs/process/add-new-venture.md for details.
 */
export const VENTURE_CONFIG = Object.fromEntries(
  venturesJson.ventures.map((v) => [
    v.code,
    { name: v.name, org: v.org, capabilities: v.capabilities as readonly string[] },
  ])
) as Record<string, { name: string; org: string; capabilities: readonly string[] }>

/**
 * Valid venture identifiers
 * Used for validation and query filtering
 */
export const VENTURES = venturesJson.ventures.map((v) => v.code)
export type Venture = (typeof venturesJson.ventures)[number]['code']

// ============================================================================
// Session Status Enum
// ============================================================================

/**
 * Valid session status values
 */
export const SESSION_STATUSES = ['active', 'ended', 'abandoned'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

// ============================================================================
// End Reason Enum
// ============================================================================

/**
 * Valid session end reasons
 */
export const END_REASONS = ['manual', 'stale', 'superseded', 'error'] as const
export type EndReason = (typeof END_REASONS)[number]

// ============================================================================
// Documentation Requirements
// ============================================================================

/**
 * Default doc requirements seeded into doc_requirements table.
 * {venture} is replaced with the venture code at audit time.
 */
export const DEFAULT_DOC_REQUIREMENTS = [
  {
    doc_name_pattern: '{venture}-project-instructions.md',
    scope_type: 'all_ventures',
    required: true,
    condition: null,
    auto_generate: true,
    generation_sources: '["claude_md","readme","package_json","docs_process"]',
    description: 'Project instructions - product vision, tech stack, principles, constraints.',
    staleness_days: 90,
  },
  {
    doc_name_pattern: '{venture}-api.md',
    scope_type: 'all_ventures',
    required: true,
    condition: 'has_api',
    auto_generate: true,
    generation_sources: '["route_files","openapi","tests"]',
    description: 'API reference - endpoints, auth, request/response shapes.',
    staleness_days: 90,
  },
  {
    doc_name_pattern: '{venture}-schema.md',
    scope_type: 'all_ventures',
    required: true,
    condition: 'has_database',
    auto_generate: true,
    generation_sources: '["migrations","schema_files","wrangler_toml"]',
    description: 'Database schema - tables, columns, relationships.',
    staleness_days: 90,
  },
] as const
