/**
 * Per-match processing logic for the notification backfill script.
 */

import type { BackfillOptions, BackfillStats, PendingMatch, GithubWorkflowRun } from './types.js'
import { fetchOpenNotificationsForMatch, postAutoResolve } from './crane-api.js'
import { fetchGreenRunsFromGithub } from './github.js'

/**
 * Process one match key: query GitHub for green runs, then resolve each
 * open notification that occurred before the earliest green run.
 */
export async function processMatch(
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

  const greenRuns = await fetchGreenRunsFromGithub(opts, match, apiBase, baseSleepMs, stats)

  if (greenRuns.length === 0) {
    stats.noGreenInGithub++
    opts.log.info('No green runs found in GitHub', {
      match_key: match.match_key,
      open_count: match.count,
    })
    return
  }

  // Pick the EARLIEST green run after the oldest open failure.
  const sortedRuns = [...greenRuns].sort((a, b) => a.run_started_at.localeCompare(b.run_started_at))
  const matchedRun = sortedRuns[0]

  const openNotifications = await fetchOpenNotificationsForMatch(opts, match)

  for (const notification of openNotifications) {
    if (notification.run_started_at && notification.run_started_at > matchedRun.run_started_at) {
      continue
    }
    await resolveNotification(opts, notification.id, match.match_key, matchedRun, stats)
  }
}

async function resolveNotification(
  opts: BackfillOptions,
  notificationId: string,
  matchKey: string,
  matchedRun: GithubWorkflowRun,
  stats: BackfillStats
): Promise<void> {
  if (opts.dryRun) {
    stats.notificationsResolved++
    opts.log.info('[dry-run] Would resolve notification', {
      notification_id: notificationId,
      match_key: matchKey,
      matched_run_id: matchedRun.id,
      matched_run_url: matchedRun.html_url,
    })
    return
  }

  try {
    const body = await postAutoResolve(opts, notificationId, matchedRun)
    if (body.already_resolved) {
      stats.notificationsAlreadyResolved++
    } else {
      stats.notificationsResolved++
      opts.log.info('Resolved notification', {
        notification_id: notificationId,
        match_key: matchKey,
        matched_run_url: matchedRun.html_url,
      })
    }
  } catch (err) {
    stats.errors++
    opts.log.error('Auto-resolve POST failed', {
      notification_id: notificationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
