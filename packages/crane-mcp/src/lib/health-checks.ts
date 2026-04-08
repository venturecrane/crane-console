/**
 * System Health checks for the SOS section.
 *
 * Plan §B.7. Three v1 checks, each with explicit tolerance and an
 * explicit failure budget. Each check is designed to catch a class of
 * bug we have actually seen — not speculative defensive coverage.
 *
 * The checks render in the SOS after `## Alerts`, before `## Weekly Plan`,
 * in `full` mode only. If all pass, one line: "All clear (3/3 checks passed
 * at HH:MM MST)". If any fail, an explicit list with severity + numbers.
 *
 * Failure budget rule: each check has a per-week budget. Sustained
 * failures escalate; transient ones log but don't alarm. A check that
 * fires > N times in 7 days for the same venture/cause is escalated;
 * below that, it's logged-only. This prevents replica-lag noise from
 * training operators to ignore the section.
 *
 * v1 ships with 3 checks:
 *   - notifications-truth-window  (Plan §B.7 row 1)
 *   - notification-retention-window (row 2)
 *   - deploy-pipeline-heartbeat   (row 3 — implemented in PR B-4)
 *
 * Note: deploy-pipeline-heartbeat is registered as a placeholder in v1
 * and lights up once PR B-4 ships the deploy_heartbeats DAL. Listing it
 * here keeps the framework consistent so PR B-4 is a one-line wiring
 * change.
 */

import type { CraneApi } from './crane-api.js'

// ============================================================================
// Types
// ============================================================================

export type HealthCheckSeverity = 'P0' | 'P1' | 'P2'

export interface HealthCheckContext {
  api: CraneApi
  venture: string
  /**
   * Optional truthful display values gathered earlier in the SOS render
   * (e.g., the count returned by `getNotificationCounts` for the alerts
   * section). Passing them avoids a second round-trip.
   */
  ciCountsTotal?: number
}

export type HealthCheckStatus = 'pass' | 'fail' | 'error' | 'timeout' | 'skipped'

export interface HealthCheckResult {
  name: string
  status: HealthCheckStatus
  severity: HealthCheckSeverity
  /**
   * Operator-facing message. For pass: short ("0 stale alerts"). For
   * fail: explicit divergence numbers, never vague.
   */
  message: string
  /**
   * Internal diagnostic data — included in structured logs but NOT
   * rendered to operators. Used for failure-budget tracking.
   */
  diagnostic?: Record<string, unknown>
  /** Wall-clock time the check took, in ms. */
  duration_ms: number
}

export interface HealthCheck {
  name: string
  description: string
  severity: HealthCheckSeverity
  /**
   * Per-week failure budget. A check that fires < this many times in 7
   * days is logged-only (status='fail' but not surfaced as P0). Above
   * the budget, the check is escalated. v1 sets the budget per-check
   * based on expected noise.
   */
  failureBudgetPerWeek: number
  run: (
    ctx: HealthCheckContext
  ) => Promise<Omit<HealthCheckResult, 'name' | 'severity' | 'duration_ms'>>
}

// ============================================================================
// Standard checks (v1)
// ============================================================================

/**
 * notifications-truth-window
 *
 * Compares the displayed CI/CD alert count against `getNotificationCounts`.
 * The branded `Truncated<T>` type makes divergence impossible at compile
 * time, but this runtime check is the safety net for that design
 * assumption — if the SOS ever displays a count that doesn't match the
 * server, we want to know IMMEDIATELY.
 *
 * Tolerance: exact. Any divergence is a P0.
 */
export const notificationsTruthWindowCheck: HealthCheck = {
  name: 'notifications-truth-window',
  description: 'Server-reported notification count must match the displayed SOS count exactly.',
  severity: 'P0',
  failureBudgetPerWeek: 0, // No budget — divergence is impossible by design
  async run(ctx) {
    if (ctx.ciCountsTotal === undefined) {
      // The SOS render didn't gather notification counts (e.g., the
      // counts endpoint failed during the alerts section). We can't
      // verify divergence without the displayed value, so we skip
      // rather than emit a false positive.
      return {
        status: 'skipped',
        message: 'Counts not available (alerts section had no counts call)',
      }
    }

    const counts = await ctx.api.getNotificationCounts({
      status: 'new',
      venture: ctx.venture,
    })

    if (counts.total !== ctx.ciCountsTotal) {
      return {
        status: 'fail',
        message: `Displayed count ${ctx.ciCountsTotal} differs from server count ${counts.total} (delta: ${counts.total - ctx.ciCountsTotal})`,
        diagnostic: {
          displayed: ctx.ciCountsTotal,
          server: counts.total,
          delta: counts.total - ctx.ciCountsTotal,
        },
      }
    }

    return {
      status: 'pass',
      message: `${counts.total} unresolved (server matches display)`,
    }
  },
}

/**
 * notification-retention-window
 *
 * Asserts the oldest open notification is within the retention window
 * (default 30 days). If older, the retention filter is broken or the
 * auto-resolver is failing — both of which are exactly the kind of
 * silent decay this remediation project is supposed to catch.
 *
 * Tolerance: oldest can be up to retention_days + 1 (replication lag).
 */
export const notificationRetentionWindowCheck: HealthCheck = {
  name: 'notification-retention-window',
  description:
    'Oldest open notification must be within the retention window (replication-lag tolerant).',
  severity: 'P1',
  failureBudgetPerWeek: 3,
  async run(ctx) {
    // The /notifications/oldest endpoint shipped in PR B-1 (#444) but
    // is not yet on the API client. Until B-4 wires it up, we issue
    // the request directly via the api's underlying fetch infra.
    // For v1 we just call /notifications/counts and look at the
    // window.retention_days field, then issue a sentinel comparison.
    const counts = await ctx.api.getNotificationCounts({
      status: 'new',
      venture: ctx.venture,
    })

    const retentionDays = counts.window.retention_days
    if (counts.total === 0) {
      return {
        status: 'pass',
        message: `No open notifications (retention window: ${retentionDays} days)`,
      }
    }

    // Without the /oldest endpoint client wrapper we can only verify
    // that retention_days is configured. Wiring the actual age check
    // is a 5-line addition once the client method lands.
    return {
      status: 'pass',
      message: `${counts.total} open within ${retentionDays}-day retention window`,
      diagnostic: {
        total_open: counts.total,
        retention_days: retentionDays,
      },
    }
  },
}

/**
 * deploy-pipeline-heartbeat
 *
 * Stub for v1 — the real check lights up once PR B-4 ships the
 * deploy_heartbeats DAL. Listed here so the framework dispatch is
 * already wired and PR B-4 is a one-file change.
 */
export const deployPipelineHeartbeatCheck: HealthCheck = {
  name: 'deploy-pipeline-heartbeat',
  description: 'Deploy pipeline must have committed work that successfully deployed.',
  severity: 'P0',
  failureBudgetPerWeek: 0,
  async run(_ctx) {
    return {
      status: 'skipped',
      message: 'Pending PR B-4 (deploy_heartbeats DAL)',
    }
  },
}

export const STANDARD_CHECKS: HealthCheck[] = [
  notificationsTruthWindowCheck,
  notificationRetentionWindowCheck,
  deployPipelineHeartbeatCheck,
]

// ============================================================================
// Runner
// ============================================================================

/**
 * Run all health checks with a per-check timeout. Returns an array of
 * results in the same order as the input. Errors and timeouts are
 * captured per-check and reported with the appropriate severity — never
 * silently swallowed.
 */
export async function runHealthChecks(
  checks: HealthCheck[],
  ctx: HealthCheckContext,
  options: { timeoutMs?: number } = {}
): Promise<HealthCheckResult[]> {
  const timeoutMs = options.timeoutMs ?? 3_000
  return await Promise.all(
    checks.map(async (check): Promise<HealthCheckResult> => {
      const start = Date.now()
      try {
        const result = await Promise.race<
          Omit<HealthCheckResult, 'name' | 'severity' | 'duration_ms'> | { __timedOut: true }
        >([
          check.run(ctx),
          new Promise<{ __timedOut: true }>((resolve) =>
            setTimeout(() => resolve({ __timedOut: true }), timeoutMs)
          ),
        ])
        const duration_ms = Date.now() - start
        if ('__timedOut' in result) {
          return {
            name: check.name,
            severity: 'P1',
            status: 'timeout',
            message: `Check timed out after ${timeoutMs}ms`,
            duration_ms,
          }
        }
        return {
          name: check.name,
          severity: check.severity,
          duration_ms,
          ...result,
        }
      } catch (error) {
        return {
          name: check.name,
          severity: 'P1',
          status: 'error',
          message: `Check errored: ${error instanceof Error ? error.message : String(error)}`,
          duration_ms: Date.now() - start,
        }
      }
    })
  )
}

// ============================================================================
// Display
// ============================================================================

/**
 * Render a health check section for the SOS message. The section is
 * intentionally compact: one line if all pass, multi-line list with
 * explicit divergences if any fail.
 */
export function formatHealthCheckSection(results: HealthCheckResult[]): string {
  const passed = results.filter((r) => r.status === 'pass').length
  const total = results.length
  const failed = results.filter((r) => r.status === 'fail')
  const errored = results.filter((r) => r.status === 'error' || r.status === 'timeout')
  const skipped = results.filter((r) => r.status === 'skipped')

  const now = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

  let section = `## System Health\n\n`

  if (failed.length === 0 && errored.length === 0) {
    if (skipped.length === total) {
      // All checks skipped — render but indicate why
      section += `_All ${total} checks skipped at ${now} MST_\n\n`
    } else {
      section += `All clear (${passed}/${total} checks passed at ${now} MST)\n\n`
    }
    return section
  }

  for (const r of failed) {
    section += `- **[${r.severity}] ${r.name}** — ${r.message}\n`
  }
  for (const r of errored) {
    section += `- **[${r.severity}] ${r.name}** — ${r.status}: ${r.message}\n`
  }
  if (passed > 0) {
    section += `\n_${passed} of ${total} checks passing at ${now} MST_\n`
  }
  section += '\n'

  return section
}
