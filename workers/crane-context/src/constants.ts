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
  NOTIFICATION: 'notif_',
  PLANNED_EVENT: 'pe_',
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
 * Tags surfaced in the SOD "Venture Knowledge Base" discovery section.
 * Subset of RECOMMENDED_TAGS - excludes executive-summary (already in
 * enterprise context), bio, marketing, and governance (not venture-critical
 * for dev agents).
 */
export const KNOWLEDGE_BASE_TAGS = [
  'prd',
  'design',
  'strategy',
  'methodology',
  'market-research',
] as const

/**
 * Maximum note content size: 500KB
 * D1 rows cap at 1MB; 500KB leaves headroom for metadata columns
 */
export const MAX_NOTE_CONTENT_SIZE = 500 * 1024

// ============================================================================
// Notifications
// ============================================================================

/**
 * Valid notification severity levels
 */
export const NOTIFICATION_SEVERITIES = ['critical', 'warning', 'info'] as const
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number]

/**
 * Valid notification status values
 */
export const NOTIFICATION_STATUSES = ['new', 'acked', 'resolved'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

/**
 * Valid notification source types
 */
export const NOTIFICATION_SOURCES = ['github', 'vercel'] as const
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number]

/**
 * Maximum notification details_json size: 200KB
 */
export const MAX_NOTIFICATION_DETAILS_SIZE = 200 * 1024

/**
 * Notification retention: 30 days (filter-on-read)
 */
export const NOTIFICATION_RETENTION_DAYS = 30

/**
 * Workflow run conclusions that count as "green" for auto-resolve purposes.
 *
 * `success` is the obvious case. `neutral` is GitHub's "completed but not
 * really success or failure" state (e.g. a check that decided not to apply);
 * we treat it as green to mirror the existing severity logic which already
 * lumps neutral with success-class.
 *
 * `skipped` is intentionally NOT a green: a skipped run does not prove that
 * the underlying issue was fixed. The auto-resolver does not auto-resolve
 * on skipped events.
 */
export const GREEN_CONCLUSIONS = ['success', 'neutral'] as const
export type GreenConclusion = (typeof GREEN_CONCLUSIONS)[number]

/**
 * Vercel deployment statuses that count as "green" for auto-resolve.
 */
export const GREEN_DEPLOYMENT_TYPES = ['deployment.succeeded', 'deployment.ready'] as const
export type GreenDeploymentType = (typeof GREEN_DEPLOYMENT_TYPES)[number]

/**
 * Workflow event types that should NOT auto-resolve across commits.
 *
 * For schedule-like events (cron-triggered, repository-dispatch), a green
 * run on a different SHA than the failure does not prove the underlying
 * issue was fixed. We restrict matching to same-SHA only for these events.
 *
 * Rationale: a nightly cron failure followed by a nightly cron success the
 * next night does not prove a fix - the world simply changed. Resolving
 * the prior failure would be a lie.
 */
export const SCHEDULE_LIKE_EVENTS = ['schedule', 'repository_dispatch'] as const
export type ScheduleLikeEvent = (typeof SCHEDULE_LIKE_EVENTS)[number]

/**
 * Match key version markers.
 *
 * `v1_name`: legacy match key built from workflow_name (string).
 *   Used for rows backfilled from details_json by migration 0023.
 *
 * `v2_id`: current match key built from workflow_id (numeric).
 *   Used for rows inserted after PR A2 ships. Stable across workflow
 *   file renames since GitHub guarantees workflow_id is permanent.
 */
export const NOTIFICATION_MATCH_KEY_VERSIONS = ['v1_name', 'v2_id'] as const
export type NotificationMatchKeyVersion = (typeof NOTIFICATION_MATCH_KEY_VERSIONS)[number]

/**
 * Reasons a notification was transitioned to `resolved`.
 *
 * `green_workflow_run`: a real-time green webhook from GitHub matched and
 *   resolved this row via the auto-resolver.
 * `green_check_suite`, `green_check_run`, `green_deployment`: same, for
 *   the corresponding event types.
 * `github_api_backfill`: the one-shot backfill CLI matched and resolved
 *   this row by querying the GitHub Actions API directly.
 * `in_table_backfill`: the in-table-data backfill admin endpoint matched
 *   this row to a green notification row already in the database (used
 *   when a matcher fix is deployed and pre-existing greens should now
 *   resolve previously-unmatched failures).
 * `manual`: an operator called crane_notification_update with status=resolved.
 * `admin_resolve`: an admin endpoint resolved this row directly.
 */
export const NOTIFICATION_AUTO_RESOLVE_REASONS = [
  'green_workflow_run',
  'green_check_suite',
  'green_check_run',
  'green_deployment',
  'github_api_backfill',
  'in_table_backfill',
  'manual',
  'admin_resolve',
] as const
export type NotificationAutoResolveReason = (typeof NOTIFICATION_AUTO_RESOLVE_REASONS)[number]

/**
 * Vercel project name to venture code mapping
 * Populated from Vercel dashboard audit
 */
export const VERCEL_PROJECT_TO_VENTURE: Record<string, string> = {
  'crane-console': 'vc',
  'ke-console': 'ke',
  'sc-console': 'sc',
  'dfg-console': 'dfg',
  'dc-console': 'dc',
  'ss-console': 'ss',
  'vc-web': 'vc',
}

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
    {
      name: v.name,
      org: v.org,
      repos: v.repos as readonly string[],
      capabilities: v.capabilities as readonly string[],
      portfolio: {
        status: v.portfolio.status,
        bvmStage: (v.portfolio.bvmStage as string | null) ?? null,
        tagline: (v.portfolio.tagline as string | null) ?? null,
        description: (v.portfolio.description as string | null) ?? null,
        techStack: v.portfolio.techStack as readonly string[],
      },
    },
  ])
) as Record<
  string,
  {
    name: string
    org: string
    repos: readonly string[]
    capabilities: readonly string[]
    portfolio: {
      status: string
      bvmStage: string | null
      tagline: string | null
      description: string | null
      techStack: readonly string[]
    }
  }
>

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
    generation_sources: '["claude_md","readme","package_json","docs_process","ventures_json"]',
    description: 'Project instructions - product vision, tech stack, principles, constraints.',
    staleness_days: 30,
  },
  {
    doc_name_pattern: '{venture}-api.md',
    scope_type: 'all_ventures',
    required: true,
    condition: 'has_api',
    auto_generate: true,
    generation_sources: '["route_files","openapi","tests"]',
    description: 'API reference - endpoints, auth, request/response shapes.',
    staleness_days: 60,
  },
  {
    doc_name_pattern: '{venture}-schema.md',
    scope_type: 'all_ventures',
    required: true,
    condition: 'has_database',
    auto_generate: true,
    generation_sources: '["migrations","schema_files","wrangler_toml"]',
    description: 'Database schema - tables, columns, relationships.',
    staleness_days: 60,
  },
  // Portfolio docs (hub-sourced, synced from docs/ventures/{code}/)
  {
    doc_name_pattern: 'product-overview.md',
    scope_type: 'all_ventures',
    required: true,
    condition: null,
    auto_generate: false,
    generation_sources: '[]',
    description: 'Product overview - what it is, target market, value prop, tech stack.',
    staleness_days: 90,
  },
  {
    doc_name_pattern: 'roadmap.md',
    scope_type: 'all_ventures',
    required: true,
    condition: null,
    auto_generate: false,
    generation_sources: '[]',
    description: 'Product roadmap - current milestone, planned work, recent completions.',
    staleness_days: 30,
  },
  {
    doc_name_pattern: 'metrics.md',
    scope_type: 'all_ventures',
    required: true,
    condition: null,
    auto_generate: false,
    generation_sources: '[]',
    description: 'Product metrics - KPIs, stage-appropriate measurements, health signals.',
    staleness_days: 60,
  },
  {
    doc_name_pattern: 'design-spec.md',
    scope_type: 'all_ventures',
    required: true,
    condition: null,
    auto_generate: false,
    generation_sources: '[]',
    description: 'Design spec - tokens, colors, typography, component patterns, brand voice.',
    staleness_days: 90,
  },
  // Global enterprise docs
  {
    doc_name_pattern: 'company-overview.md',
    scope_type: 'global',
    required: true,
    condition: null,
    auto_generate: false,
    generation_sources: '[]',
    description: 'Company structure, mission, entity overview.',
    staleness_days: 180,
  },
  {
    doc_name_pattern: 'strategic-planning.md',
    scope_type: 'global',
    required: true,
    condition: null,
    auto_generate: false,
    generation_sources: '[]',
    description: 'Capital allocation principles, evaluation framework.',
    staleness_days: 90,
  },
] as const
