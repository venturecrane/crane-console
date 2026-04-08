/**
 * Crane Context Worker - GitHub Event Normalizers
 *
 * Normalizes GitHub CI events (workflow_run, check_suite, check_run)
 * into the notifications schema. Only failure/timeout events produce
 * notifications; success events are silently ignored.
 */

import { repoToVenture, computeDedupeHash, buildMatchKey } from './notifications'
import type { NotificationSeverity, NotificationMatchKeyVersion } from './types'

// ============================================================================
// Types
// ============================================================================

export interface NormalizedNotification {
  event_type: string
  severity: NotificationSeverity
  summary: string
  details_json: string
  repo: string | null
  branch: string | null
  environment: string | null
  venture: string | null
  content_key: string

  // Structural identifiers (added in PR A2 so the auto-resolver can match
  // future greens to these failures via match_key). All optional/nullable
  // for backward compat with normalizers that don't populate them yet.
  workflow_id?: number | null
  workflow_name?: string | null
  run_id?: number | null
  head_sha?: string | null
  check_suite_id?: number | null
  check_run_id?: number | null
  app_id?: number | null
  app_name?: string | null
  // Vercel-only fields (always undefined for github events; included so the
  // single createNotification call site at the ingest endpoint can pass
  // through both NormalizedNotification and NormalizedVercelNotification
  // without per-source branching).
  deployment_id?: string | null
  project_name?: string | null
  target?: string | null
  match_key?: string | null
  match_key_version?: NotificationMatchKeyVersion | null
  run_started_at?: string | null
}

// ============================================================================
// Severity Rules
// ============================================================================

const PROTECTED_BRANCHES = ['main', 'master', 'production']

function isProtectedBranch(branch: string | null): boolean {
  if (!branch) return false
  return PROTECTED_BRANCHES.includes(branch)
}

function deriveSeverity(conclusion: string, branch: string | null): NotificationSeverity | null {
  switch (conclusion) {
    case 'failure':
      return isProtectedBranch(branch) ? 'critical' : 'info'
    case 'timed_out':
      return 'warning'
    case 'cancelled':
      return 'info'
    case 'success':
    case 'neutral':
    case 'skipped':
      return null // Ignored
    default:
      return null
  }
}

// ============================================================================
// Workflow Run Normalizer
// ============================================================================

export function normalizeWorkflowRun(
  payload: Record<string, unknown>
): NormalizedNotification | null {
  const workflowRun = payload.workflow_run as Record<string, unknown> | undefined
  if (!workflowRun) return null

  const conclusion = workflowRun.conclusion as string
  const branch = (workflowRun.head_branch as string) || null
  const severity = deriveSeverity(conclusion, branch)
  if (!severity) return null

  const repo = ((payload.repository as Record<string, unknown>)?.full_name as string) || null
  const workflowName = (workflowRun.name as string) || 'Unknown workflow'
  const runNumber = workflowRun.run_number as number
  const htmlUrl = (workflowRun.html_url as string) || ''
  const workflowId = workflowRun.workflow_id as number | undefined
  const runId = workflowRun.id as number | undefined
  const headSha = (workflowRun.head_sha as string) || null
  const runStartedAt =
    (workflowRun.run_started_at as string) || (workflowRun.created_at as string) || null

  const summary = `${workflowName} #${runNumber} ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`

  const details = {
    workflow_name: workflowName,
    workflow_id: workflowId,
    run_number: runNumber,
    run_id: runId,
    conclusion,
    branch,
    commit_sha: headSha,
    html_url: htmlUrl,
    actor: (workflowRun.actor as Record<string, unknown>)?.login || null,
    event: workflowRun.event,
  }

  const venture = repo ? repoToVenture(repo) : null

  // Compute v2_id match_key only if we have all the required fields.
  // Otherwise the row gets a NULL match_key (consistent with legacy behavior)
  // and is matched only by future code via the v1_name format.
  let matchKey: string | null = null
  let matchKeyVersion: NotificationMatchKeyVersion | null = null
  if (repo && branch && workflowId) {
    const built = buildMatchKey({
      source: 'github',
      kind: 'workflow_run',
      repo_full_name: repo,
      branch,
      workflow_id: workflowId,
    })
    matchKey = built.match_key
    matchKeyVersion = built.match_key_version
  }

  return {
    event_type: `workflow_run.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: isProtectedBranch(branch) ? 'production' : 'preview',
    venture,
    content_key: `workflow_run:${runId}:${conclusion}`,
    workflow_id: workflowId ?? null,
    workflow_name: workflowName,
    run_id: runId ?? null,
    head_sha: headSha,
    match_key: matchKey,
    match_key_version: matchKeyVersion,
    run_started_at: runStartedAt,
  }
}

// ============================================================================
// Check Suite Normalizer
// ============================================================================

export function normalizeCheckSuite(
  payload: Record<string, unknown>
): NormalizedNotification | null {
  const checkSuite = payload.check_suite as Record<string, unknown> | undefined
  if (!checkSuite) return null

  const conclusion = checkSuite.conclusion as string
  const branch = (checkSuite.head_branch as string) || null
  const severity = deriveSeverity(conclusion, branch)
  if (!severity) return null

  const repo = ((payload.repository as Record<string, unknown>)?.full_name as string) || null
  const appObj = (checkSuite.app as Record<string, unknown>) || {}
  const appName = (appObj.name as string) || 'Unknown'
  const appId = appObj.id as number | undefined
  const checkSuiteId = checkSuite.id as number | undefined
  const headSha = (checkSuite.head_sha as string) || null
  const runStartedAt =
    (checkSuite.created_at as string) || (checkSuite.updated_at as string) || null

  const summary = `Check suite (${appName}) ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`

  const details = {
    check_suite_id: checkSuiteId,
    app_id: appId,
    app_name: appName,
    conclusion,
    branch,
    commit_sha: headSha,
    total_count: (checkSuite as Record<string, unknown>).latest_check_runs_count,
  }

  const venture = repo ? repoToVenture(repo) : null

  let matchKey: string | null = null
  let matchKeyVersion: NotificationMatchKeyVersion | null = null
  if (repo && branch && appId) {
    const built = buildMatchKey({
      source: 'github',
      kind: 'check_suite',
      repo_full_name: repo,
      branch,
      app_id: appId,
    })
    matchKey = built.match_key
    matchKeyVersion = built.match_key_version
  }

  return {
    event_type: `check_suite.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: isProtectedBranch(branch) ? 'production' : 'preview',
    venture,
    content_key: `check_suite:${checkSuiteId}:${conclusion}`,
    check_suite_id: checkSuiteId ?? null,
    head_sha: headSha,
    app_id: appId ?? null,
    app_name: appName,
    match_key: matchKey,
    match_key_version: matchKeyVersion,
    run_started_at: runStartedAt,
  }
}

// ============================================================================
// Check Run Normalizer
// ============================================================================

export function normalizeCheckRun(payload: Record<string, unknown>): NormalizedNotification | null {
  const checkRun = payload.check_run as Record<string, unknown> | undefined
  if (!checkRun) return null

  // Only process completed check runs
  if (checkRun.status !== 'completed') return null

  const conclusion = checkRun.conclusion as string
  // Get branch from check_suite within the check_run
  const checkSuiteInRun = checkRun.check_suite as Record<string, unknown> | undefined
  const branch = (checkSuiteInRun?.head_branch as string) || null
  const severity = deriveSeverity(conclusion, branch)
  if (!severity) return null

  const repo = ((payload.repository as Record<string, unknown>)?.full_name as string) || null
  const checkName = (checkRun.name as string) || 'Unknown check'
  const checkRunId = checkRun.id as number | undefined
  const headSha = (checkRun.head_sha as string) || null
  const appObj = (checkRun.app as Record<string, unknown>) || {}
  const appName = (appObj.name as string) || null
  const appId = appObj.id as number | undefined
  const runStartedAt = (checkRun.started_at as string) || (checkRun.completed_at as string) || null

  const summary = `Check "${checkName}" ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`

  const details = {
    check_run_id: checkRunId,
    check_name: checkName,
    app_id: appId,
    app_name: appName,
    conclusion,
    branch,
    commit_sha: headSha,
    html_url: checkRun.html_url,
  }

  const venture = repo ? repoToVenture(repo) : null

  let matchKey: string | null = null
  let matchKeyVersion: NotificationMatchKeyVersion | null = null
  if (repo && branch && appId) {
    const built = buildMatchKey({
      source: 'github',
      kind: 'check_run',
      repo_full_name: repo,
      branch,
      app_id: appId,
      name: checkName,
    })
    matchKey = built.match_key
    matchKeyVersion = built.match_key_version
  }

  return {
    event_type: `check_run.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: isProtectedBranch(branch) ? 'production' : 'preview',
    venture,
    content_key: `check_run:${checkRunId}:${conclusion}`,
    check_run_id: checkRunId ?? null,
    head_sha: headSha,
    app_id: appId ?? null,
    app_name: appName,
    match_key: matchKey,
    match_key_version: matchKeyVersion,
    run_started_at: runStartedAt,
  }
}

// ============================================================================
// Router
// ============================================================================

/**
 * Route a GitHub CI event to the appropriate normalizer.
 */
export function normalizeGitHubEvent(
  eventType: string,
  payload: Record<string, unknown>
): NormalizedNotification | null {
  switch (eventType) {
    case 'workflow_run':
      return normalizeWorkflowRun(payload)
    case 'check_suite':
      return normalizeCheckSuite(payload)
    case 'check_run':
      return normalizeCheckRun(payload)
    default:
      return null
  }
}

/**
 * Compute a dedupe hash for a GitHub notification.
 */
export async function computeGitHubDedupeHash(normalized: NormalizedNotification): Promise<string> {
  return computeDedupeHash({
    source: 'github',
    event_type: normalized.event_type,
    repo: normalized.repo,
    branch: normalized.branch,
    content_key: normalized.content_key,
  })
}
