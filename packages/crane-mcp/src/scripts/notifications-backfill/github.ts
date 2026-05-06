/**
 * GitHub Actions API helpers for the notification backfill script.
 *
 * Covers: green-runs fetch with rate-limit handling and Link-header pagination.
 */

import type {
  BackfillOptions,
  BackfillStats,
  PendingMatch,
  GithubWorkflowRun,
  GithubRunsResponse,
} from './types.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function handleRateLimit(
  res: Response,
  stats: BackfillStats,
  opts: BackfillOptions
): Promise<void> {
  const reset = parseInt(res.headers.get('x-ratelimit-reset') ?? '0', 10)
  const now = Math.floor(Date.now() / 1000)
  const waitSec = Math.max(reset - now, 60)
  stats.rateLimitWaits++
  stats.totalSleepMs += waitSec * 1000
  opts.log.warn(`GitHub API rate-limited. Sleeping ${waitSec}s until reset.`)
  await sleep(waitSec * 1000)
}

async function checkApproachingLimit(
  res: Response,
  stats: BackfillStats,
  opts: BackfillOptions
): Promise<void> {
  const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '5000', 10)
  const reset = parseInt(res.headers.get('x-ratelimit-reset') ?? '0', 10)
  if (remaining < 100) {
    const now = Math.floor(Date.now() / 1000)
    const waitSec = Math.max(reset - now, 0)
    if (waitSec > 0) {
      stats.rateLimitWaits++
      stats.totalSleepMs += waitSec * 1000
      opts.log.info(`Approaching GitHub rate limit. Sleeping ${waitSec}s`, { remaining })
      await sleep(waitSec * 1000)
    }
  }
}

async function fetchOnePage(
  url: string,
  opts: BackfillOptions,
  stats: BackfillStats,
  baseSleepMs: number
): Promise<{ res: Response; retryUrl: string | null }> {
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

  if (res.status === 403 || res.status === 429) {
    await handleRateLimit(res, stats, opts)
    return { res, retryUrl: url }
  }

  return { res, retryUrl: null }
}

/**
 * Fetch all successful GitHub Actions workflow runs for a match key since the
 * oldest open failure. Follows Link-header pagination and handles rate limits.
 */
export async function fetchGreenRunsFromGithub(
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
    `${apiBase}/repos/${match.repo}/actions/workflows/${match.workflow_id}/runs` +
    `?branch=${encodeURIComponent(match.branch)}&status=success&per_page=100` +
    `&created=>${match.oldest_open_created_at}`

  while (url) {
    const { res, retryUrl } = await fetchOnePage(url, opts, stats, baseSleepMs)

    if (retryUrl !== null) {
      url = retryUrl
      continue
    }

    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}: ${await res.text()}`)
    }

    const body = (await res.json()) as GithubRunsResponse
    allRuns.push(...body.workflow_runs)

    await checkApproachingLimit(res, stats, opts)

    url = parseNextLink(res.headers.get('link'))
  }

  return allRuns
}
