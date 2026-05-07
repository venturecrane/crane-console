/**
 * Notification Auto-Resolver Backfill (Track A PR 3)
 *
 * One-shot CLI to backfill stale notifications by querying the GitHub Actions
 * API for green runs that match each open failure notification, then POSTing
 * to the crane-context admin endpoint to record the auto-resolve.
 *
 * Built for the 2026-04-07 incident where 270 notifications had accumulated
 * because the watcher silently dropped every green webhook event. After PR
 * A2 lands and the feature flag flips, NEW failures will auto-resolve in
 * real time. This script clears the historical backlog.
 *
 * Architecture:
 *
 *   1. Acquire a global lock via /admin/notifications/backfill-lock/acquire.
 *      The lock has a TTL so a crashed run does not block future runs.
 *
 *   2. Loop over /admin/notifications/pending-matches with cursor pagination.
 *      Each page returns up to 100 distinct match_keys with at least one
 *      open notification.
 *
 *   3. For each match_key, query the GitHub Actions API for green runs of
 *      the same workflow on the same branch since the oldest open failure.
 *      Follow GitHub Link headers for pagination of run lists.
 *
 *   4. Adaptive rate limit handling: read X-RateLimit-Remaining and
 *      X-RateLimit-Reset headers; sleep until reset if remaining < 100.
 *
 *   5. For each match where a green run was found, POST to
 *      /admin/notifications/:id/auto-resolve to record the resolve.
 *
 *   6. Track stats: matched, no-match, errors, GitHub API calls, time
 *      spent rate-limited.
 *
 *   7. Release the lock on exit (or expiry if killed).
 *
 * Idempotent: re-running the script is safe. The admin endpoint validates
 * the target notification is still open; already-resolved rows return 200
 * with `already_resolved: true`.
 *
 * Scalable: cursor-based pagination on both the crane-context query and
 * the GitHub API means memory usage is bounded regardless of how many
 * historical notifications exist. Tested up to 1000 distinct match_keys.
 */

import type {
  Fetch,
  BackfillLogger,
  BackfillOptions,
  BackfillStats,
} from './notifications-backfill/types.js'
import { acquireLock, releaseLock } from './notifications-backfill/crane-api.js'
import { parseNextLink } from './notifications-backfill/github.js'
import { runMatchesLoop } from './notifications-backfill/loop.js'

export type { Fetch, BackfillLogger, BackfillOptions, BackfillStats }
export { parseNextLink }

// ============================================================================
// Top-level entry point
// ============================================================================

export async function runBackfill(opts: BackfillOptions): Promise<BackfillStats> {
  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  const stats: BackfillStats = {
    pendingMatchesScanned: 0,
    notificationsResolved: 0,
    notificationsAlreadyResolved: 0,
    noGreenInGithub: 0,
    errors: 0,
    githubApiCalls: 0,
    githubApiPages: 0,
    rateLimitWaits: 0,
    totalSleepMs: 0,
    startedAt,
    endedAt: startedAt,
    durationMs: 0,
    dryRun: opts.dryRun ?? false,
    bailedOutEarly: false,
  }

  const maxRows = opts.maxRows ?? 1000
  const maxRuntimeMs = (opts.maxRuntimeMinutes ?? 30) * 60 * 1000
  const baseSleepMs = opts.baseSleepMs ?? 100
  const githubApiBase = opts.githubApiBase ?? 'https://api.github.com'
  const lockTtlSeconds = opts.lockTtlSeconds ?? 3600
  const pageSize = opts.pageSize ?? 100

  const acquired = await acquireLock(opts, lockTtlSeconds)
  if (!acquired.acquired) {
    stats.bailedOutEarly = true
    stats.bailReason = `lock acquisition failed: ${acquired.reason}`
    stats.endedAt = new Date().toISOString()
    stats.durationMs = Date.now() - startedAtMs
    opts.log.error('Failed to acquire backfill lock', {
      existing_holder: acquired.existingHolder,
      reason: acquired.reason,
    })
    return stats
  }

  opts.log.info('Acquired backfill lock', { holder: opts.holderId, ttl_seconds: lockTtlSeconds })

  try {
    await runMatchesLoop({
      opts,
      stats,
      startedAtMs,
      maxRows,
      maxRuntimeMs,
      githubApiBase,
      baseSleepMs,
      pageSize,
    })
  } finally {
    try {
      await releaseLock(opts)
      opts.log.info('Released backfill lock')
    } catch (err) {
      opts.log.warn('Failed to release lock cleanly (will expire via TTL)', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  stats.endedAt = new Date().toISOString()
  stats.durationMs = Date.now() - startedAtMs
  return stats
}

// ============================================================================
// CLI entry point
// ============================================================================

/**
 * Parse process.argv into BackfillOptions. Returns null on --help.
 *
 * Required env vars:
 *   CRANE_CONTEXT_URL
 *   CRANE_CONTEXT_ADMIN_KEY
 *   GITHUB_TOKEN (or GH_TOKEN)
 *
 * Flags:
 *   --dry-run                   don't mutate; just report what would happen
 *   --venture <code>            filter to a single venture (e.g. "vc")
 *   --max-rows <n>              hard cap on rows resolved (default 1000)
 *   --max-runtime-minutes <n>   wall-clock budget (default 30)
 *   --sleep-ms <n>              base delay between GH API calls (default 100)
 *   --help                      show usage
 */
export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined>
): { ok: true; options: BackfillOptions } | { ok: false; help: boolean; reason: string } {
  const help = argv.includes('--help') || argv.includes('-h')
  if (help) {
    return { ok: false, help: true, reason: 'help requested' }
  }

  const url = env.CRANE_CONTEXT_URL
  const adminKey = env.CRANE_CONTEXT_ADMIN_KEY
  const githubToken = env.GITHUB_TOKEN ?? env.GH_TOKEN

  const missing: string[] = []
  if (!url) missing.push('CRANE_CONTEXT_URL')
  if (!adminKey) missing.push('CRANE_CONTEXT_ADMIN_KEY')
  if (!githubToken) missing.push('GITHUB_TOKEN (or GH_TOKEN)')
  if (missing.length > 0) {
    return { ok: false, help: false, reason: `missing required env vars: ${missing.join(', ')}` }
  }

  const dryRun = argv.includes('--dry-run')
  const venture = readFlag(argv, '--venture')
  const maxRows = readFlagInt(argv, '--max-rows', 1000)
  const maxRuntimeMinutes = readFlagInt(argv, '--max-runtime-minutes', 30)
  const baseSleepMs = readFlagInt(argv, '--sleep-ms', 100)
  const holderId = `${env.HOSTNAME ?? 'unknown'}:${env.CRANE_BACKFILL_PID ?? process.pid ?? 'no-pid'}`

  return {
    ok: true,
    options: {
      craneContextUrl: url!,
      craneContextAdminKey: adminKey!,
      githubToken: githubToken!,
      fetch: globalThis.fetch,
      holderId,
      dryRun,
      venture,
      maxRows,
      maxRuntimeMinutes,
      baseSleepMs,
      log: defaultLogger(),
    },
  }
}

function readFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name)
  if (idx === -1) return undefined
  return argv[idx + 1]
}

function readFlagInt(argv: string[], name: string, fallback: number): number {
  const v = readFlag(argv, name)
  if (v === undefined) return fallback
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return fallback
  return n
}

export function defaultLogger(): BackfillLogger {
  return {
    info: (msg: string, data?: Record<string, unknown>) => {
      const line = data ? `${msg} ${JSON.stringify(data)}` : msg
      console.log(`[info] ${line}`)
    },
    warn: (msg: string, data?: Record<string, unknown>) => {
      const line = data ? `${msg} ${JSON.stringify(data)}` : msg
      console.warn(`[warn] ${line}`)
    },
    error: (msg: string, data?: Record<string, unknown>) => {
      const line = data ? `${msg} ${JSON.stringify(data)}` : msg
      console.error(`[error] ${line}`)
    },
  }
}

export function printUsage(): void {
  console.log(`
Notification Auto-Resolver Backfill (Track A PR 3)

Usage:
  notifications-backfill [flags]

Required env vars:
  CRANE_CONTEXT_URL          e.g. https://crane-context.automation-ab6.workers.dev
  CRANE_CONTEXT_ADMIN_KEY    X-Admin-Key value
  GITHUB_TOKEN (or GH_TOKEN) GitHub PAT with actions:read scope

Flags:
  --dry-run                   don't mutate; report what would happen
  --venture <code>            filter to a single venture (e.g. vc)
  --max-rows <n>              hard cap on rows resolved (default 1000)
  --max-runtime-minutes <n>   wall-clock budget (default 30)
  --sleep-ms <n>              base delay between GH API calls (default 100)
  --help                      show this message

Behavior:
  1. Acquires the global notifications backfill lock (refuses if held)
  2. Walks /admin/notifications/pending-matches with cursor pagination
  3. For each match_key, queries GitHub Actions API for green runs
  4. POSTs auto-resolve to each matched open notification
  5. Releases the lock on exit

Idempotent: re-running is safe. Already-resolved rows return 200 with
already_resolved: true.
`)
}
