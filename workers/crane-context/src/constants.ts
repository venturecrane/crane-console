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
 * Used by /ventures endpoint and ccs script
 */
export const VENTURE_CONFIG = {
  vc: { name: 'Venture Crane', org: 'venturecrane' },
  sc: { name: 'Silicon Crane', org: 'siliconcrane' },
  dfg: { name: 'Durgan Field Guide', org: 'durganfieldguide' },
  ke: { name: 'Kid Expenses', org: 'kidexpenses' },
} as const;

/**
 * Valid venture identifiers
 * Used for validation and query filtering
 */
export const VENTURES = ['vc', 'sc', 'dfg', 'ke'] as const;
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
