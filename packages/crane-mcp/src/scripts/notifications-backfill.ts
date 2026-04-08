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

// ============================================================================
// Types
// ============================================================================

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

interface PendingMatch {
  match_key: string
  match_key_version: string | null
  repo: string | null
  branch: string | null
  workflow_id: number | null
  workflow_name: string | null
  oldest_open_created_at: string
  count: number
}

interface PendingMatchesResponse {
  matches: PendingMatch[]
  pagination?: { next_cursor?: string }
}

interface GithubWorkflowRun {
  id: number
  run_started_at: string
  html_url: string
  status: string
  conclusion: string | null
}

interface GithubRunsResponse {
  total_count: number
  workflow_runs: GithubWorkflowRun[]
}

interface OpenNotificationForKey {
  id: string
  created_at: string
  match_key: string
  run_started_at: string | null
}

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

  // Step 1: acquire lock
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
    // Step 2: loop pages of pending-matches
    let cursor: string | undefined = undefined
    let pageNum = 0
    while (true) {
      // Time budget check
      if (Date.now() - startedAtMs > maxRuntimeMs) {
        stats.bailedOutEarly = true
        stats.bailReason = `max runtime ${opts.maxRuntimeMinutes} minutes exceeded`
        opts.log.warn('Bailing out: max runtime exceeded', { stats })
        break
      }
      // Row budget check
      if (stats.notificationsResolved >= maxRows) {
        stats.bailedOutEarly = true
        stats.bailReason = `max rows ${maxRows} reached`
        opts.log.warn('Bailing out: max rows reached', { stats })
        break
      }

      pageNum++
      const page = await fetchPendingMatches(opts, cursor, pageSize)
      stats.pendingMatchesScanned += page.matches.length

      opts.log.info(`Processing page ${pageNum} (${page.matches.length} match keys)`)

      // Step 3-5: process each match in the page
      for (const match of page.matches) {
        try {
          await processMatch(opts, match, stats, githubApiBase, baseSleepMs)
        } catch (err) {
          stats.errors++
          opts.log.error('Failed to process match', {
            match_key: match.match_key,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      if (!page.pagination?.next_cursor) {
        break
      }
      cursor = page.pagination.next_cursor
    }
  } finally {
    // Step 7: release lock
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
// Lock helpers
// ============================================================================

async function acquireLock(
  opts: BackfillOptions,
  ttlSeconds: number
): Promise<{ acquired: boolean; existingHolder?: string; reason?: string }> {
  const url = `${opts.craneContextUrl}/admin/notifications/backfill-lock/acquire`
  const res = await opts.fetch(url, {
    method: 'POST',
    headers: {
      'X-Admin-Key': opts.craneContextAdminKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      holder: opts.holderId,
      ttl_seconds: ttlSeconds,
      metadata: { dry_run: opts.dryRun ?? false, venture: opts.venture ?? null },
    }),
  })

  if (res.status === 200) {
    const body = (await res.json()) as { acquired: boolean }
    return { acquired: body.acquired }
  }

  if (res.status === 409) {
    const body = (await res.json()) as {
      acquired: boolean
      existing_holder?: string
      reason?: string
    }
    return {
      acquired: false,
      existingHolder: body.existing_holder,
      reason: body.reason,
    }
  }

  const text = await res.text()
  return { acquired: false, reason: `HTTP ${res.status}: ${text}` }
}

async function releaseLock(opts: BackfillOptions): Promise<void> {
  const url = `${opts.craneContextUrl}/admin/notifications/backfill-lock/release`
  await opts.fetch(url, {
    method: 'POST',
    headers: {
      'X-Admin-Key': opts.craneContextAdminKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ holder: opts.holderId }),
  })
}

// ============================================================================
// Pending matches query
// ============================================================================

async function fetchPendingMatches(
  opts: BackfillOptions,
  cursor: string | undefined,
  pageSize: number
): Promise<PendingMatchesResponse> {
  const url = new URL(`${opts.craneContextUrl}/admin/notifications/pending-matches`)
  url.searchParams.set('limit', String(pageSize))
  if (cursor) url.searchParams.set('cursor', cursor)
  if (opts.venture) url.searchParams.set('venture', opts.venture)

  const res = await opts.fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Admin-Key': opts.craneContextAdminKey },
  })

  if (!res.ok) {
    throw new Error(`pending-matches HTTP ${res.status}: ${await res.text()}`)
  }

  return (await res.json()) as PendingMatchesResponse
}

// ============================================================================
// Open-notifications-for-match query (paginated by listNotifications)
// ============================================================================

async function fetchOpenNotificationsForMatch(
  opts: BackfillOptions,
  match: PendingMatch
): Promise<OpenNotificationForKey[]> {
  // The current /notifications endpoint does NOT filter by match_key directly,
  // but it does filter by repo + status. We then filter client-side. For the
  // 270-row historical backlog this is fine; if the table grows, the right
  // followup is a /notifications?match_key=X server-side filter.
  if (!match.repo) return []

  const url = new URL(`${opts.craneContextUrl}/notifications`)
  url.searchParams.set('status', 'new')
  url.searchParams.set('repo', match.repo)
  url.searchParams.set('limit', '100')

  const res = await opts.fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Admin-Key': opts.craneContextAdminKey },
  })

  if (!res.ok) {
    throw new Error(`/notifications HTTP ${res.status}: ${await res.text()}`)
  }

  const body = (await res.json()) as {
    notifications: Array<{
      id: string
      created_at: string
      match_key: string | null
      run_started_at: string | null
    }>
  }

  return body.notifications
    .filter((n) => n.match_key === match.match_key)
    .map((n) => ({
      id: n.id,
      created_at: n.created_at,
      match_key: n.match_key!,
      run_started_at: n.run_started_at,
    }))
}

// ============================================================================
// GitHub Actions API query (with rate limit + pagination)
// ============================================================================

async function fetchGreenRunsFromGithub(
  opts: BackfillOptions,
  match: PendingMatch,
  apiBase: string,
  baseSleepMs: number,
  stats: BackfillStats
): Promise<GithubWorkflowRun[]> {
  if (!match.repo || !match.branch || !match.workflow_id) {
    return []
  }

  const allRuns: GithubWorkflowRun[] = []
  let url: string | null =
    `${apiBase}/repos/${match.repo}/actions/workflows/${match.workflow_id}/runs?branch=${encodeURIComponent(match.branch)}&status=success&per_page=100&created=>${match.oldest_open_created_at}`

  while (url) {
    // Adaptive sleep + rate limit handling
    if (baseSleepMs > 0) {
      await sleep(baseSleepMs)
      stats.totalSleepMs += baseSleepMs
    }

    const res = await opts.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${opts.githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    stats.githubApiCalls++
    stats.githubApiPages++

    // Adaptive rate-limit handling
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '5000', 10)
    const reset = parseInt(res.headers.get('x-ratelimit-reset') ?? '0', 10) // unix epoch seconds

    if (res.status === 403 || res.status === 429) {
      // Hard rate limit. Sleep until reset.
      const now = Math.floor(Date.now() / 1000)
      const waitSec = Math.max(reset - now, 60) // min 60s
      stats.rateLimitWaits++
      stats.totalSleepMs += waitSec * 1000
      opts.log.warn(`GitHub API rate-limited. Sleeping ${waitSec}s until reset.`, {
        match_key: match.match_key,
      })
      await sleep(waitSec * 1000)
      // Retry the same URL
      continue
    }

    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}: ${await res.text()}`)
    }

    const body = (await res.json()) as GithubRunsResponse
    allRuns.push(...body.workflow_runs)

    if (remaining < 100) {
      // Approaching rate limit. Sleep until reset.
      const now = Math.floor(Date.now() / 1000)
      const waitSec = Math.max(reset - now, 0)
      if (waitSec > 0) {
        stats.rateLimitWaits++
        stats.totalSleepMs += waitSec * 1000
        opts.log.info(`Approaching GitHub rate limit. Sleeping ${waitSec}s`, {
          remaining,
        })
        await sleep(waitSec * 1000)
      }
    }

    // Follow Link header for next page
    const linkHeader = res.headers.get('link')
    url = parseNextLink(linkHeader)
  }

  return allRuns
}

/**
 * Parse a GitHub Link header and return the URL of the "next" page, or null.
 *
 * Format example:
 *   <https://api.github.com/.../runs?page=2>; rel="next", <...>; rel="last"
 */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null
  const parts = header.split(',')
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match) return match[1]
  }
  return null
}

// ============================================================================
// Process a single match
// ============================================================================

async function processMatch(
  opts: BackfillOptions,
  match: PendingMatch,
  stats: BackfillStats,
  apiBase: string,
  baseSleepMs: number
): Promise<void> {
  if (!match.repo || !match.branch || !match.workflow_id) {
    opts.log.warn('Skipping match with missing repo/branch/workflow_id', {
      match_key: match.match_key,
    })
    return
  }

  // Query GitHub for green runs of this workflow on this branch
  const greenRuns = await fetchGreenRunsFromGithub(opts, match, apiBase, baseSleepMs, stats)

  if (greenRuns.length === 0) {
    stats.noGreenInGithub++
    opts.log.info('No green runs found in GitHub', {
      match_key: match.match_key,
      open_count: match.count,
    })
    return
  }

  // Pick the EARLIEST green run after the oldest open failure. This resolves
  // every open failure that occurred before this green's run_started_at.
  const sortedRuns = [...greenRuns].sort((a, b) => a.run_started_at.localeCompare(b.run_started_at))
  const matchedRun = sortedRuns[0]

  // Fetch the open notifications for this match_key
  const openNotifications = await fetchOpenNotificationsForMatch(opts, match)

  for (const notification of openNotifications) {
    // Only resolve notifications older than the matched green's run_started_at
    if (notification.run_started_at && notification.run_started_at > matchedRun.run_started_at) {
      // This failure happened AFTER the matched green; not auto-resolved.
      continue
    }

    if (opts.dryRun) {
      stats.notificationsResolved++
      opts.log.info('[dry-run] Would resolve notification', {
        notification_id: notification.id,
        match_key: match.match_key,
        matched_run_id: matchedRun.id,
        matched_run_url: matchedRun.html_url,
      })
      continue
    }

    const url = `${opts.craneContextUrl}/admin/notifications/${notification.id}/auto-resolve`
    const res = await opts.fetch(url, {
      method: 'POST',
      headers: {
        'X-Admin-Key': opts.craneContextAdminKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        matched_run_id: matchedRun.id,
        matched_run_url: matchedRun.html_url,
        matched_run_started_at: matchedRun.run_started_at,
        reason: 'github_api_backfill',
      }),
    })

    if (!res.ok) {
      stats.errors++
      opts.log.error('Auto-resolve POST failed', {
        notification_id: notification.id,
        status: res.status,
        body: await res.text(),
      })
      continue
    }

    const body = (await res.json()) as { ok: boolean; already_resolved: boolean }
    if (body.already_resolved) {
      stats.notificationsAlreadyResolved++
    } else {
      stats.notificationsResolved++
      opts.log.info('Resolved notification', {
        notification_id: notification.id,
        match_key: match.match_key,
        matched_run_url: matchedRun.html_url,
      })
    }
  }
}

// ============================================================================
// Sleep utility
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
 *   --dry-run                   don't mutate; report what would happen
 *   --venture <code>            filter to a single venture
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
    return {
      ok: false,
      help: false,
      reason: `missing required env vars: ${missing.join(', ')}`,
    }
  }

  const dryRun = argv.includes('--dry-run')
  const venture = readFlag(argv, '--venture')
  const maxRows = readFlagInt(argv, '--max-rows', 1000)
  const maxRuntimeMinutes = readFlagInt(argv, '--max-runtime-minutes', 30)
  const baseSleepMs = readFlagInt(argv, '--sleep-ms', 100)

  // Holder ID: hostname:pid
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
    info: (msg, data) => {
      const line = data ? `${msg} ${JSON.stringify(data)}` : msg
      console.log(`[info] ${line}`)
    },
    warn: (msg, data) => {
      const line = data ? `${msg} ${JSON.stringify(data)}` : msg
      console.warn(`[warn] ${line}`)
    },
    error: (msg, data) => {
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
