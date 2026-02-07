/**
 * Crane Context Worker - Constants
 *
 * Central configuration constants referenced throughout the codebase.
 * Values match ADR 025 specification.
 */

// ============================================================================
// Payload Size Limits
// ============================================================================

/**
 * Maximum handoff payload size: 800KB
 * D1 row limit is 1MB; 800KB leaves 200KB for metadata columns
 */
export const MAX_HANDOFF_PAYLOAD_SIZE = 800 * 1024;

/**
 * Maximum idempotency response body size: 64KB
 * Hybrid storage threshold - full body stored if below, hash-only if above
 */
export const MAX_IDEMPOTENCY_BODY_SIZE = 64 * 1024;

/**
 * Maximum request body size: 1MB
 * General limit for all incoming request payloads
 */
export const MAX_REQUEST_BODY_SIZE = 1024 * 1024;

// ============================================================================
// TTL & Expiry
// ============================================================================

/**
 * Idempotency key TTL: 1 hour (3600 seconds)
 * Retry windows are typically seconds/minutes; 1 hour provides safety margin
 */
export const IDEMPOTENCY_TTL_SECONDS = 3600;

/**
 * Request log retention: 7 days
 * Enforced via filter-on-read in Phase 1, scheduled cleanup in Phase 2
 */
export const REQUEST_LOG_RETENTION_DAYS = 7;

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * Session staleness threshold: 45 minutes
 * Default value - can be overridden via CONTEXT_SESSION_STALE_MINUTES env var
 */
export const STALE_AFTER_MINUTES = 45;

/**
 * Heartbeat interval: 10 minutes (600 seconds)
 * Base interval before jitter is applied
 * Provides 4.5x safety margin before staleness
 */
export const HEARTBEAT_INTERVAL_SECONDS = 600;

/**
 * Heartbeat jitter: ±2 minutes (±120 seconds)
 * Prevents thundering herd by randomizing heartbeat timing
 */
export const HEARTBEAT_JITTER_SECONDS = 120;

// ============================================================================
// Auth & Attribution
// ============================================================================

/**
 * Actor key ID length: 16 hex characters
 * Derived from SHA-256(key).substring(0, 16)
 * Represents 8 bytes of hash
 */
export const ACTOR_KEY_ID_LENGTH = 16;

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
} as const;

// ============================================================================
// Schema Versions
// ============================================================================

/**
 * Current schema version for all entities
 * Increment when making breaking changes to API contracts
 */
export const CURRENT_SCHEMA_VERSION = '1.0';

// ============================================================================
// Pagination
// ============================================================================

/**
 * Default page size for paginated queries
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Maximum page size for paginated queries
 */
export const MAX_PAGE_SIZE = 100;

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
} as const;

// ============================================================================
// Venture Enum
// ============================================================================

/**
 * Full venture metadata - single source of truth
 * Used by /ventures endpoint and sod-universal.sh
 *
 * To add a new venture:
 * 1. Add entry here
 * 2. Add to VENTURES array below
 * 3. Deploy crane-context
 */
export const VENTURE_CONFIG = {
  vc: { name: 'Venture Crane', org: 'venturecrane', capabilities: ['has_api', 'has_database'] as readonly string[] },
  sc: { name: 'Silicon Crane', org: 'siliconcrane', capabilities: ['has_api', 'has_database'] as readonly string[] },
  dfg: { name: 'Durgan Field Guide', org: 'durganfieldguide', capabilities: ['has_api', 'has_database'] as readonly string[] },
  ke: { name: 'Kid Expenses', org: 'kidexpenses', capabilities: ['has_api', 'has_database'] as readonly string[] },
  smd: { name: 'SMD Ventures', org: 'smd-ventures', capabilities: [] as readonly string[] },
  dc: { name: 'Draft Crane', org: 'draftcrane', capabilities: ['has_database'] as readonly string[] },
} as const;

/**
 * Valid venture identifiers
 * Used for validation and query filtering
 */
export const VENTURES = ['dc', 'vc', 'sc', 'dfg', 'ke', 'smd'] as const;
export type Venture = typeof VENTURES[number];

// ============================================================================
// Session Status Enum
// ============================================================================

/**
 * Valid session status values
 */
export const SESSION_STATUSES = ['active', 'ended', 'abandoned'] as const;
export type SessionStatus = typeof SESSION_STATUSES[number];

// ============================================================================
// End Reason Enum
// ============================================================================

/**
 * Valid session end reasons
 */
export const END_REASONS = ['manual', 'stale', 'superseded', 'error'] as const;
export type EndReason = typeof END_REASONS[number];

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
    description: 'Project instructions — product vision, tech stack, principles, constraints.',
    staleness_days: 90,
  },
  {
    doc_name_pattern: '{venture}-api.md',
    scope_type: 'all_ventures',
    required: true,
    condition: 'has_api',
    auto_generate: true,
    generation_sources: '["route_files","openapi","tests"]',
    description: 'API reference — endpoints, auth, request/response shapes.',
    staleness_days: 90,
  },
  {
    doc_name_pattern: '{venture}-schema.md',
    scope_type: 'all_ventures',
    required: true,
    condition: 'has_database',
    auto_generate: true,
    generation_sources: '["migrations","schema_files","wrangler_toml"]',
    description: 'Database schema — tables, columns, relationships.',
    staleness_days: 90,
  },
] as const;
