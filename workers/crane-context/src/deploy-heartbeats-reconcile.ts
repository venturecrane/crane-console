/**
 * Crane Context Worker - Deploy Heartbeats Reconciliation (#454)
 *
 * Plan v3.1 §B.6 / issue #454. Scheduled-trigger handler that walks
 * every active deploy_heartbeat row and cross-checks the latest
 * GitHub Actions workflow_run against the stored state. If we find
 * a newer run than what the webhook path recorded (e.g. because a
 * webhook delivery was dropped), we catch it up by calling recordRun.
 *
 * The cron fires every 6 hours via a [[triggers]] block in
 * workers/crane-context/wrangler.toml:
 *
 *   [[triggers]]
 *   crons = ["0 *\/6 * * *"]
 *
 * Auth: uses GH_TOKEN (a worker secret holding a fine-grained PAT
 * with read-only access to the venturecrane org). If GH_TOKEN is not
 * set, the cron logs a warning and skips — this avoids breaking
 * deploys in environments where the token hasn't been provisioned yet.
 *
 * Rate limit: walks heartbeats one at a time with a 100ms pause
 * between calls. Each call hits `GET /repos/:repo/actions/workflows/
 * :workflow_id/runs?branch=:branch&per_page=1` — a single row read.
 * With ~50 heartbeats across the fleet and a 100ms pause, a full
 * reconcile takes ~5 seconds and consumes ~50 of the 5000/hour
 * authenticated GitHub API quota.
 */

import type { Env } from './types'
import { recordRun, listAllHeartbeats } from './deploy-heartbeats'

interface GitHubWorkflowRun {
  id: number
  head_sha: string | null
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  run_started_at?: string
  event: string
}

interface GitHubRunsResponse {
  total_count?: number
  workflow_runs?: GitHubWorkflowRun[]
}

interface ReconcileResult {
  walked: number
  updated: number
  errors: number
  rate_limited: boolean
  started_at: string
  completed_at: string
}

/**
 * Sleep helper for rate-limit pacing.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch the latest workflow run for a given (repo, workflow_id, branch)
 * tuple from the GitHub API. Returns null on any error.
 */
async function fetchLatestRun(
  token: string,
  repoFullName: string,
  workflowId: number,
  branch: string
): Promise<GitHubWorkflowRun | null> {
  const url = `https://api.github.com/repos/${repoFullName}/actions/workflows/${workflowId}/runs?branch=${encodeURIComponent(branch)}&per_page=1`
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'crane-context-reconcile/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!resp.ok) {
      console.error(
        `reconcile: GitHub API returned ${resp.status} for ${repoFullName}/${workflowId}`
      )
      return null
    }
    const body = (await resp.json()) as GitHubRunsResponse
    const runs = body.workflow_runs
    if (!runs || runs.length === 0) return null
    return runs[0]
  } catch (err) {
    console.error(`reconcile: fetch error for ${repoFullName}/${workflowId}:`, err)
    return null
  }
}

/**
 * Main reconciliation entry point.
 *
 * Walks every row in deploy_heartbeats across all ventures. For each:
 *   1. Query the latest workflow run from GitHub
 *   2. If the GitHub run's id > heartbeat.last_run_id, we missed an event
 *   3. Call recordRun to advance the stored state
 */
export async function runReconciliation(env: Env): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    walked: 0,
    updated: 0,
    errors: 0,
    rate_limited: false,
    started_at: new Date().toISOString(),
    completed_at: '',
  }

  const token = (env as unknown as { GH_TOKEN?: string }).GH_TOKEN
  if (!token) {
    console.warn('reconcile: GH_TOKEN not set — skipping reconciliation run')
    result.completed_at = new Date().toISOString()
    return result
  }

  const heartbeats = await listAllHeartbeats(env.DB)
  console.log(`reconcile: walking ${heartbeats.length} heartbeats`)

  for (const hb of heartbeats) {
    if (hb.suppressed === 1) continue
    result.walked++

    const run = await fetchLatestRun(token, hb.repo_full_name, hb.workflow_id, hb.branch)
    if (!run) {
      result.errors++
      continue
    }

    // Only update if this run is newer than what we have
    if (hb.last_run_id && run.id <= hb.last_run_id) {
      continue
    }

    // Skip in_progress runs — we want terminal state
    if (run.status !== 'completed') {
      continue
    }
    if (!run.conclusion) {
      continue
    }

    try {
      await recordRun(
        env.DB,
        {
          venture: hb.venture,
          repo_full_name: hb.repo_full_name,
          workflow_id: hb.workflow_id,
          branch: hb.branch,
          run_id: run.id,
          run_at: run.updated_at || run.created_at,
          conclusion: run.conclusion,
          head_sha: run.head_sha,
        },
        hb.cold_threshold_days
      )
      result.updated++
      console.log(
        `reconcile: caught up ${hb.repo_full_name}/${hb.workflow_id} to run ${run.id} (${run.conclusion})`
      )
    } catch (err) {
      console.error(`reconcile: recordRun error for ${hb.repo_full_name}/${hb.workflow_id}:`, err)
      result.errors++
    }

    // Pace ourselves (100ms) so a 50-row walk stays well under GitHub's
    // 5000/hour authenticated quota even on the worst case.
    await sleep(100)
  }

  result.completed_at = new Date().toISOString()
  console.log(
    `reconcile: complete — walked=${result.walked} updated=${result.updated} errors=${result.errors}`
  )
  return result
}
