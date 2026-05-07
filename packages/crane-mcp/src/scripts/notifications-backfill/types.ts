/**
 * Shared types for the notification backfill script.
 */

export type Fetch = typeof globalThis.fetch

export interface BackfillLogger {
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
}

export interface BackfillOptions {
  /** crane-context base URL, e.g. https://crane-context-staging.workers.dev */
  craneContextUrl: string
  /** X-Admin-Key value */
  craneContextAdminKey: string
  /** GitHub PAT or App token with actions:read scope */
  githubToken: string
  /** Injectable for tests; defaults to global fetch */
  fetch: Fetch
  /** Holder ID for the global lock, e.g. "mac23.local:12345" */
  holderId: string
  /** Logger */
  log: BackfillLogger

  /** Don't actually mutate; just report what would happen */
  dryRun?: boolean
  /** Filter to a single venture (e.g. "vc") */
  venture?: string
  /** Hard cap on notifications resolved per invocation */
  maxRows?: number
  /** Max wall-clock runtime; bail out cleanly if exceeded */
  maxRuntimeMinutes?: number
  /** Base sleep between GitHub API requests in milliseconds */
  baseSleepMs?: number
  /** GitHub API base URL (override for tests) */
  githubApiBase?: string
  /** Lock TTL in seconds */
  lockTtlSeconds?: number
  /** Page size for pending-matches query */
  pageSize?: number
}

export interface BackfillStats {
  pendingMatchesScanned: number
  notificationsResolved: number
  notificationsAlreadyResolved: number
  noGreenInGithub: number
  errors: number
  githubApiCalls: number
  githubApiPages: number
  rateLimitWaits: number
  totalSleepMs: number
  startedAt: string
  endedAt: string
  durationMs: number
  dryRun: boolean
  bailedOutEarly: boolean
  bailReason?: string
}

export interface PendingMatch {
  match_key: string
  match_key_version: string | null
  repo: string | null
  branch: string | null
  workflow_id: number | null
  workflow_name: string | null
  oldest_open_created_at: string
  count: number
}

export interface PendingMatchesResponse {
  matches: PendingMatch[]
  pagination?: { next_cursor?: string }
}

export interface GithubWorkflowRun {
  id: number
  run_started_at: string
  html_url: string
  status: string
  conclusion: string | null
}

export interface GithubRunsResponse {
  total_count: number
  workflow_runs: GithubWorkflowRun[]
}

export interface OpenNotificationForKey {
  id: string
  created_at: string
  match_key: string
  run_started_at: string | null
}
