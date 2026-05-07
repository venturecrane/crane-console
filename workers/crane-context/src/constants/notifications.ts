export const NOTIFICATION_SEVERITIES = ['critical', 'warning', 'info'] as const
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number]

export const NOTIFICATION_STATUSES = ['new', 'acked', 'resolved'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const NOTIFICATION_SOURCES = ['github', 'vercel'] as const
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number]

export const MAX_NOTIFICATION_DETAILS_SIZE = 200 * 1024

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
 * Branches that count as "protected" for CI ingestion.
 *
 * Only events on these branches become notifications. Non-protected branches
 * (dependabot rebumps, feature/PR branches) are ignored at the normalizer/
 * green-classifier layer — their CI status is already visible on each PR's
 * Checks tab and never becomes individually actionable in our inbox.
 *
 * Hardcoded list rather than a GitHub-API lookup of each repo's actual
 * `default_branch` field: all current ventures use `main`, the API call
 * adds latency to every webhook, and revisiting takes a 1-line edit if a
 * future repo uses something else. See `fix(notifications): drop non-default-
 * branch ingestion` PR for the rationale.
 */
export const PROTECTED_BRANCHES = ['main', 'master', 'production'] as const

export function isProtectedBranch(branch: string | null): boolean {
  if (!branch) return false
  return (PROTECTED_BRANCHES as readonly string[]).includes(branch)
}

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
  // Issue #563: branch-deleted webhook resolver + cron TTL backstop.
  'branch_deleted',
  'aged_out_non_main',
] as const
export type NotificationAutoResolveReason = (typeof NOTIFICATION_AUTO_RESOLVE_REASONS)[number]

export const VERCEL_PROJECT_TO_VENTURE: Record<string, string> = {
  'crane-console': 'vc',
  'ke-console': 'ke',
  'sc-console': 'sc',
  'dfg-console': 'dfg',
  'dc-console': 'dc',
  'ss-console': 'ss',
  'vc-web': 'vc',
}
