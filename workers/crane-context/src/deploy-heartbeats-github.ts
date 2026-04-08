/**
 * GitHub-payload adapter for deploy heartbeats.
 *
 * Plan §B.6. Translates raw GitHub webhook payloads (push, workflow_run)
 * into the typed observations the deploy_heartbeats DAL accepts.
 *
 * Lives in crane-context (NOT crane-watch) so the venture lookup uses the
 * same `VENTURE_CONFIG` source of truth that the rest of the worker reads.
 * Crane-watch just forwards the raw payload.
 */

import { VENTURE_CONFIG } from './constants'
import type { CommitObservation, RunObservation } from './deploy-heartbeats'

/**
 * Resolve a venture code from a `repository.full_name` string. Returns
 * `null` if no venture in the config owns this repo. Caller should
 * gracefully ignore unknown repos rather than 500 — webhooks for
 * archived/orphaned repos still arrive and shouldn't blow up.
 */
export function ventureForRepo(repoFullName: string): string | null {
  const slash = repoFullName.indexOf('/')
  if (slash < 1) return null
  const org = repoFullName.slice(0, slash)
  const repo = repoFullName.slice(slash + 1)

  for (const [code, cfg] of Object.entries(VENTURE_CONFIG)) {
    if (cfg.org !== org) continue
    if (cfg.repos.includes(repo)) return code
  }
  return null
}

/**
 * Per-venture-class default cold thresholds (Plan §B.6). Stored as code
 * defaults until per-venture overrides land in `config/ventures.json`.
 *
 *   - content/marketing (vc-web, dfg, dc-marketing): 2 days
 *   - infrastructure (crane-console, crane-relay): 7 days
 *   - everything else (app consoles): 3 days
 */
const CONTENT_REPOS = new Set([
  'venturecrane/vc-web',
  'venturecrane/dfg-marketing',
  'venturecrane/dc-marketing',
])
const INFRA_REPOS = new Set(['venturecrane/crane-console', 'venturecrane/crane-relay'])

export function defaultColdThresholdDays(repoFullName: string): number {
  if (CONTENT_REPOS.has(repoFullName)) return 2
  if (INFRA_REPOS.has(repoFullName)) return 7
  return 3
}

// ============================================================================
// Push event → CommitObservation[]
// ============================================================================

interface GitHubPushPayload {
  ref?: string
  after?: string
  head_commit?: { id?: string; timestamp?: string }
  repository?: { full_name?: string }
  // Push events don't carry a workflow_id — see note below.
}

export interface PushAdapterResult {
  venture: string
  repo_full_name: string
  branch: string
  commit_at: string
  commit_sha: string
}

/**
 * Convert a GitHub `push` payload into the fields needed to record a
 * commit observation. Returns `null` for unknown ventures, non-default-branch
 * pushes (deploy-heartbeats only tracks main), or malformed payloads.
 *
 * Note: a push event tells us a commit exists but does NOT tell us which
 * workflow_id will run on it. The caller must therefore call recordCommit
 * for EACH workflow_id discovered for the repo (via the reconciliation
 * cron's discoverWorkflows action). The fan-out is intentional: we want
 * each workflow's heartbeat to advance independently.
 */
export function adaptPushPayload(payload: unknown): PushAdapterResult | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as GitHubPushPayload

  const repoFullName = p.repository?.full_name
  if (!repoFullName) return null

  const venture = ventureForRepo(repoFullName)
  if (!venture) return null

  // Only track default branch (main). Feature branches don't need a
  // deploy heartbeat — they're WIP, not "should-have-deployed" signals.
  const ref = p.ref ?? ''
  const branch = ref.replace(/^refs\/heads\//, '')
  if (branch !== 'main') return null

  const commitSha = p.after || p.head_commit?.id
  const commitAt = p.head_commit?.timestamp
  if (!commitSha || !commitAt) return null

  return {
    venture,
    repo_full_name: repoFullName,
    branch,
    commit_at: commitAt,
    commit_sha: commitSha,
  }
}

// ============================================================================
// workflow_run event → RunObservation
// ============================================================================

interface GitHubWorkflowRunPayload {
  action?: string
  workflow_run?: {
    id?: number
    workflow_id?: number
    head_sha?: string
    head_branch?: string
    status?: string
    conclusion?: string | null
    created_at?: string
    updated_at?: string
    run_started_at?: string
  }
  repository?: { full_name?: string }
}

/**
 * Convert a GitHub `workflow_run.completed` payload into a RunObservation.
 * Returns `null` for unknown ventures, non-default-branch runs, in-progress
 * runs (we only care about completed), or malformed payloads.
 *
 * Returns the OBSERVATION typed for `recordRun()`. The caller is responsible
 * for invoking `recordRun(db, obs)` and handling errors.
 */
export function adaptWorkflowRunPayload(payload: unknown): RunObservation | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as GitHubWorkflowRunPayload

  // Only act on `completed` deliveries — `requested` and `in_progress` carry
  // null conclusions and would create stale heartbeat rows.
  if (p.action !== 'completed') return null

  const run = p.workflow_run
  if (!run) return null

  const repoFullName = p.repository?.full_name
  if (!repoFullName) return null

  const venture = ventureForRepo(repoFullName)
  if (!venture) return null

  // Track only default-branch runs. Feature-branch runs don't update the
  // deploy heartbeat — they're not "did the deploy succeed" signals.
  const branch = run.head_branch ?? ''
  if (branch !== 'main') return null

  if (typeof run.workflow_id !== 'number' || typeof run.id !== 'number') return null
  if (!run.conclusion) return null

  // Prefer run_started_at, fall back to updated_at, then created_at.
  const runAt = run.run_started_at ?? run.updated_at ?? run.created_at
  if (!runAt) return null

  return {
    venture,
    repo_full_name: repoFullName,
    workflow_id: run.workflow_id,
    branch,
    run_id: run.id,
    run_at: runAt,
    conclusion: run.conclusion,
    head_sha: run.head_sha ?? null,
  }
}

export type CommitObservationFromPush = PushAdapterResult & Pick<CommitObservation, 'workflow_id'>
