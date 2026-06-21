/**
 * Crane Context API - Extended Types (Part 2)
 *
 * Contains: Notification, Skill Invocation, Memory Invocation,
 * Verification Ledger, Deploy Heartbeat, and Fleet Health types.
 */

import { z } from 'zod'

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: string
  source: string
  event_type: string
  severity: string
  status: string
  summary: string
  details_json: string
  external_id: string | null
  dedupe_hash: string
  venture: string | null
  repo: string | null
  branch: string | null
  environment: string | null
  created_at: string
  received_at: string
  updated_at: string
  actor_key_id: string
  // Match-key columns added in migration 0023. The worker's listNotifications
  // returns SELECT * so these are always on the wire; declared optional for
  // back-compat with rows pre-dating the migration.
  run_id?: number | null
  app_name?: string | null
  match_key?: string | null
}

export interface ListNotificationsParams {
  status?: string
  severity?: string
  venture?: string
  repo?: string
  source?: string
  limit?: number
  cursor?: string
}

export interface ListNotificationsResponse {
  notifications: Notification[]
  pagination?: {
    next_cursor?: string
  }
}

export interface UpdateNotificationStatusResponse {
  notification: Notification
}

// Plan §B.3: truthful counts endpoint
export interface NotificationCountsParams {
  status?: string
  severity?: string
  venture?: string
  repo?: string
  source?: string
  /** When 'venture', response includes a `by_venture` map. */
  group_by?: 'venture'
}

export interface NotificationCountsResponse {
  total: number
  by_severity: {
    critical: number
    warning: number
    info: number
  }
  by_status: {
    new: number
    acked: number
    resolved: number
  }
  by_venture?: Record<string, { critical: number; warning: number; info: number; total: number }>
  window: {
    retention_days: number
    filters: NotificationCountsParams
  }
  correlation_id?: string
}

// ============================================================================
// Skill Invocation Telemetry
// ============================================================================

export interface RecordSkillInvocationRequest {
  skill_name: string
  session_id?: string
  venture?: string
  repo?: string
  status?: 'started' | 'completed' | 'failed'
  duration_ms?: number
  error_message?: string
}

export interface SkillInvocationRecord {
  id: string
  skill_name: string
  status: string
  created_at: string
}

export interface RecordSkillInvocationResponse {
  invocation: SkillInvocationRecord
}

export interface SkillUsageStat {
  skill_name: string
  invocation_count: number
  last_invoked_at: string
}

/**
 * Runtime validation for the `/skills/usage` aggregate response.
 * Worker SQL contract (workers/crane-context/src/endpoints/skill-invocations.ts):
 *   SELECT skill_name, COUNT(*) AS invocation_count, MAX(created_at) AS last_invoked_at
 * Catches wire-shape drift at the API client boundary (e.g. column renames
 * that compile but produce undefined at runtime).
 */
export const SkillUsageStatSchema = z.object({
  skill_name: z.string(),
  invocation_count: z.number(),
  last_invoked_at: z.string(),
})

export const GetSkillUsageResponseSchema = z.object({
  since: z.string(),
  stats: z.array(SkillUsageStatSchema),
})

export interface GetSkillUsageParams {
  since?: string
  skill_name?: string
}

export interface GetSkillUsageResponse {
  since: string
  stats: SkillUsageStat[]
}

// ============================================================================
// Memory Invocation Telemetry types
// ============================================================================

export type MemoryInvocationEvent = 'surfaced' | 'cited' | 'parse_error'

export interface RecordMemoryInvocationRequest {
  memory_id: string
  event: MemoryInvocationEvent
  session_id?: string
  venture?: string
  repo?: string
}

export interface MemoryInvocationRecord {
  id: string
  memory_id: string
  event: MemoryInvocationEvent
  created_at: string
}

export interface RecordMemoryInvocationResponse {
  invocation: MemoryInvocationRecord
}

export interface MemoryUsageStat {
  memory_id: string
  total_surfaced: number
  total_cited: number
  total_parse_error: number
  last_event_at: string | null
}

/**
 * Runtime validation for the `/memory/invocations/all` aggregate response.
 * Worker SQL contract (workers/crane-context/src/endpoints/memory-invocations.ts):
 *   SELECT memory_id,
 *          SUM(CASE WHEN event = 'surfaced'    THEN 1 ELSE 0 END) AS total_surfaced,
 *          SUM(CASE WHEN event = 'cited'       THEN 1 ELSE 0 END) AS total_cited,
 *          SUM(CASE WHEN event = 'parse_error' THEN 1 ELSE 0 END) AS total_parse_error,
 *          MAX(created_at) AS last_event_at
 * Catches wire-shape drift at the API client boundary. The original silent
 * failure we are guarding against: TypeScript-only alias fields (surfaced_count,
 * cited_count) declared on the interface but never emitted by the SQL → six
 * call sites read undefined and audit deprecation logic was a no-op for months.
 * Zod runs at every fetch; any drift fails fast and loud.
 */
export const MemoryUsageStatSchema = z.object({
  memory_id: z.string(),
  total_surfaced: z.number(),
  total_cited: z.number(),
  total_parse_error: z.number(),
  // Worker GROUP BY memory_id guarantees at least one row per group, so
  // MAX(created_at) is non-null. Allow null defensively in case the SQL
  // contract drifts (a null leaks through and surfaces an obvious error
  // downstream rather than crashing the call site).
  last_event_at: z.string().nullable(),
})

export const GetMemoryUsageResponseSchema = z.object({
  since: z.string(),
  stats: z.array(MemoryUsageStatSchema),
})

export interface GetMemoryUsageParams {
  since?: string
  memory_id?: string
}

export interface GetMemoryUsageResponse {
  since: string
  stats: MemoryUsageStat[]
}

// ============================================================================
// Verification Ledger (crane_verify)
// ============================================================================

export type VerifyMethod = 'live_state' | 'fresh_process' | 'vendor_docs'
export type VerifySource = 'manual' | 'tool' | 'hook'
export type VerifyToolUsed =
  | 'Bash'
  | 'Context7'
  | 'WebFetch'
  | 'gh_api'
  | 'wrangler'
  | 'vendor_mcp'
  | 'other'
export type VerifyTruncation = 'none' | 'head' | 'tail' | 'head_tail'

export interface RecordVerificationRequest {
  method: VerifyMethod
  claim: string
  output: string
  tool_used: VerifyToolUsed
  command?: string
  files_touched?: string[]
  fresh_runtime?: boolean
  fresh_runtime_justification?: string
  output_truncation?: VerifyTruncation
  source?: VerifySource
  session_id?: string
  venture?: string
  repo?: string
}

export interface VerificationRecord {
  id: string
  method: VerifyMethod
  source: VerifySource
  redacted: boolean
  output_truncation: VerifyTruncation
  files_touched: string[]
}

export interface RecordVerificationResponse {
  verify: VerificationRecord
  correlation_id?: string
}

export interface ClaimOriginEntry {
  verify_id: string
  session_id: string | null
  claim: string
  method: VerifyMethod
  ts: string
  files_touched: string[]
}

export interface GetClaimOriginParams {
  file: string
  since?: string
  limit?: number
}

export interface GetClaimOriginResponse {
  file: string
  since: string
  limit: number
  claims: ClaimOriginEntry[]
  correlation_id?: string
}

export interface GetVerifySessionCountResponse {
  session_id: string
  count: number
  correlation_id?: string
}

/** One verify-ledger row's gate-relevant facts (relevance + aliveness gates). */
export interface VerificationDetailEntry {
  id: string
  method: string
  files_touched: string[]
  output_nonempty: boolean
}

export interface GetSessionVerificationsResponse {
  session_id: string
  verifications: VerificationDetailEntry[]
  correlation_id?: string
}

export interface VerifyLookupResponse {
  exists: Record<string, boolean>
  records?: Record<string, Omit<VerificationDetailEntry, 'id'>>
  correlation_id?: string
}

// ============================================================================
// Deploy heartbeats (Plan §B.6)
// ============================================================================

export interface DeployHeartbeat {
  venture: string
  repo_full_name: string
  workflow_id: number
  branch: string

  last_main_commit_at: string | null
  last_main_commit_sha: string | null

  last_success_at: string | null
  last_success_sha: string | null
  last_success_run_id: number | null

  last_run_at: string | null
  last_run_id: number | null
  last_run_conclusion: string | null

  consecutive_failures: number
  suppressed: number
  suppress_reason: string | null
  suppress_until: string | null
  cold_threshold_days: number

  created_at: string
  updated_at: string

  is_cold?: boolean
}

export interface ColdDeployHeartbeat extends DeployHeartbeat {
  age_ms: number
}

export interface DeployHeartbeatsResponse {
  venture: string
  heartbeats: DeployHeartbeat[]
  cold: ColdDeployHeartbeat[]
  stale_webhooks: DeployHeartbeat[]
  suppressed: DeployHeartbeat[]
  window: { stale_webhook_hours: number }
  correlation_id?: string
}

// ============================================================================
// Verify Audit (Prong 3)
// ============================================================================

export interface VerifyAuditCoverageGapEntry {
  file: string
}

export interface VerifyAuditUnverifiedEntry {
  file: string
}

export interface VerifyAuditOverrideAudit {
  pr_merge_gate: number
  verify_coverage_gate: number
  total_handoffs_done: number
}

export interface VerifyAuditIntegritySample {
  verify_id: string
  scrubber_consistent: boolean
  truncation_consistent: boolean
}

export interface VerifyAuditTruncationDriftEntry {
  verify_id: string
  output_truncation: string
  output_redacted: number
}

export interface VerifyAuditSourceDistribution {
  manual: number
  tool: number
  hook: number
}

export interface VerifyAuditMemoryCandidate {
  pattern: 'recurring_command_hash_per_repo'
  command_hash: string
  repo: string | null
  sample_command: string
  method: string
  occurrences: number
  first_seen: string
  last_seen: string
  verify_ids: string[]
  suggested_kind: 'lesson'
  files_touched_union: string[]
}

export interface VerifyAuditResponse {
  window: { days: number; since_iso: string }
  cache: { age_seconds: number; served_from: 'cache' | 'fresh'; never_run?: boolean }
  coverage_gap: VerifyAuditCoverageGapEntry[]
  unverified_surface_files: VerifyAuditUnverifiedEntry[]
  override_audit: VerifyAuditOverrideAudit
  integrity_samples: VerifyAuditIntegritySample[]
  truncation_drift: VerifyAuditTruncationDriftEntry[]
  source_distribution: VerifyAuditSourceDistribution
  memory_candidates: VerifyAuditMemoryCandidate[]
  memory_candidates_suppressed: number
  generated_at: string | null
  correlation_id?: string
}

export interface GetVerifyAuditParams {
  window?: number | string
  files?: string[]
  surfaceFiles?: string[]
  maxMemoryCandidates?: number
  fresh?: boolean
  summary?: boolean
}

// ============================================================================
// Fleet health findings (Plan §C.4)
// ============================================================================

export type FleetFindingSeverity = 'error' | 'warning' | 'info'
export type FleetFindingStatus = 'new' | 'resolved'
/**
 * Source discriminator for a finding (#657). 'github' = weekly
 * fleet-ops-health audit; 'machine' = Hermes-on-mini host-patch
 * orchestrator. Optional because the old worker (pre-migration 0037)
 * didn't return this field — older SOS sessions reading against an
 * un-upgraded worker see `undefined` and treat rows as github by
 * convention in the renderer.
 */
export type FleetFindingSource = 'github' | 'machine'

export interface FleetHealthFinding {
  id: string
  generated_at: string
  repo_full_name: string
  finding_type: string
  severity: FleetFindingSeverity
  source?: FleetFindingSource
  details_json: string
  status: FleetFindingStatus
  resolved_at: string | null
  resolve_reason: 'auto_snapshot' | 'manual' | null
  created_at: string
  updated_at: string
}

export interface FleetHealthSummary {
  total_open: number
  by_severity: { error: number; warning: number; info: number }
  newest_generated_at: string | null
  open_repos: number
}

export interface FleetHealthFindingsResponse {
  findings: FleetHealthFinding[]
  total: number
  summary: FleetHealthSummary
  correlation_id?: string
}
