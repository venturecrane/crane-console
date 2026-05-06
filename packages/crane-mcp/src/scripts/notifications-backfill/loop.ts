/**
 * Core pagination loop for the notification backfill.
 *
 * Extracted to keep runBackfill under the max-lines-per-function and
 * complexity ceilings enforced by @venturecrane/eslint-config.
 */

import type { BackfillOptions, BackfillStats, PendingMatch } from './types.js'
import { fetchPendingMatches } from './crane-api.js'
import { processMatch } from './process-match.js'

interface LoopParams {
  opts: BackfillOptions
  stats: BackfillStats
  startedAtMs: number
  maxRows: number
  maxRuntimeMs: number
  githubApiBase: string
  baseSleepMs: number
  pageSize: number
}

/**
 * Walk pending-matches pages and resolve matching notifications.
 * Mutates `stats` in place. Returns when all pages are consumed or a
 * budget (row/time) is exhausted.
 */
export async function runMatchesLoop(params: LoopParams): Promise<void> {
  const { opts, stats, startedAtMs, maxRows, maxRuntimeMs, githubApiBase, baseSleepMs, pageSize } =
    params

  let cursor: string | undefined = undefined
  let pageNum = 0

  while (true) {
    if (isTimeBudgetExceeded(startedAtMs, maxRuntimeMs)) {
      stats.bailedOutEarly = true
      stats.bailReason = `max runtime ${opts.maxRuntimeMinutes} minutes exceeded`
      opts.log.warn('Bailing out: max runtime exceeded', { stats })
      break
    }

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

    await processPageMatches(opts, page.matches, stats, githubApiBase, baseSleepMs)

    if (!page.pagination?.next_cursor) {
      break
    }
    cursor = page.pagination.next_cursor
  }
}

function isTimeBudgetExceeded(startedAtMs: number, maxRuntimeMs: number): boolean {
  return Date.now() - startedAtMs > maxRuntimeMs
}

async function processPageMatches(
  opts: BackfillOptions,
  matches: PendingMatch[],
  stats: BackfillStats,
  githubApiBase: string,
  baseSleepMs: number
): Promise<void> {
  for (const match of matches) {
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
}
