/**
 * Crane Context Worker - GitHub Event Normalizers
 *
 * Normalizes GitHub CI events (workflow_run, check_suite, check_run)
 * into the notifications schema. Only failure/timeout events produce
 * notifications; success events are silently ignored.
 */

import { isProtectedBranch } from './constants'
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

function deriveSeverity(conclusion: string, branch: string | null): NotificationSeverity | null {
  // Only ingest CI events on protected branches. Non-protected branches
  // (dependabot rebumps, feature/PR branches) duplicate signal already
  // visible on each PR's Checks tab. Per the
  // `fix(notifications): drop non-default-branch ingestion` PR.
  if (!isProtectedBranch(branch)) return null

  switch (conclusion) {
    case 'failure':
      return 'critical'
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
// Shared helpers
// ============================================================================

function repoFromPayload(payload: Record<string, unknown>): string | null {
  return ((payload.repository as Record<string, unknown>)?.full_name as string) || null
}

interface MatchKeyResult {
  match_key: string | null
  match_key_version: NotificationMatchKeyVersion | null
}

function buildWorkflowMatchKey(
  repo: string | null,
  branch: string | null,
  workflowId: number | undefined
): MatchKeyResult {
  if (!repo || !branch || !workflowId) return { match_key: null, match_key_version: null }
  const built = buildMatchKey({
    source: 'github',
    kind: 'workflow_run',
    repo_full_name: repo,
    branch,
    workflow_id: workflowId,
  })
  return { match_key: built.match_key, match_key_version: built.match_key_version }
}

function buildCheckSuiteMatchKey(
  repo: string | null,
  branch: string | null,
  appId: number | undefined
): MatchKeyResult {
  if (!repo || !branch || !appId) return { match_key: null, match_key_version: null }
  const built = buildMatchKey({
    source: 'github',
    kind: 'check_suite',
    repo_full_name: repo,
    branch,
    app_id: appId,
  })
  return { match_key: built.match_key, match_key_version: built.match_key_version }
}

function buildCheckRunMatchKey(
  repo: string | null,
  branch: string | null,
  appId: number | undefined,
  checkName: string
): MatchKeyResult {
  if (!repo || !branch || !appId) return { match_key: null, match_key_version: null }
  const built = buildMatchKey({
    source: 'github',
    kind: 'check_run',
    repo_full_name: repo,
    branch,
    app_id: appId,
    name: checkName,
  })
  return { match_key: built.match_key, match_key_version: built.match_key_version }
}

// ============================================================================
// Workflow Run Normalizer
// ============================================================================

interface WorkflowRunFields {
  workflowName: string
  runNumber: number
  htmlUrl: string
  workflowId: number | undefined
  runId: number | undefined
  headSha: string | null
  runStartedAt: string | null
  actorLogin: unknown
  event: unknown
}

function extractWorkflowRunFields(run: Record<string, unknown>): WorkflowRunFields {
  return {
    workflowName: (run.name as string) || 'Unknown workflow',
    runNumber: run.run_number as number,
    htmlUrl: (run.html_url as string) || '',
    workflowId: run.workflow_id as number | undefined,
    runId: run.id as number | undefined,
    headSha: (run.head_sha as string) || null,
    runStartedAt: (run.run_started_at as string) || (run.created_at as string) || null,
    actorLogin: (run.actor as Record<string, unknown>)?.login || null,
    event: run.event,
  }
}

export function normalizeWorkflowRun(
  payload: Record<string, unknown>
): NormalizedNotification | null {
  const workflowRun = payload.workflow_run as Record<string, unknown> | undefined
  if (!workflowRun) return null

  const conclusion = workflowRun.conclusion as string
  const branch = (workflowRun.head_branch as string) || null
  const severity = deriveSeverity(conclusion, branch)
  if (!severity) return null

  const repo = repoFromPayload(payload)
  const f = extractWorkflowRunFields(workflowRun)
  const venture = repo ? repoToVenture(repo) : null
  const { match_key: matchKey, match_key_version: matchKeyVersion } = buildWorkflowMatchKey(
    repo,
    branch,
    f.workflowId
  )

  const summary = `${f.workflowName} #${f.runNumber} ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`
  const details = {
    workflow_name: f.workflowName,
    workflow_id: f.workflowId,
    run_number: f.runNumber,
    run_id: f.runId,
    conclusion,
    branch,
    commit_sha: f.headSha,
    html_url: f.htmlUrl,
    actor: f.actorLogin,
    event: f.event,
  }

  return {
    event_type: `workflow_run.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: 'production',
    venture,
    content_key: `workflow_run:${f.runId}:${conclusion}`,
    workflow_id: f.workflowId ?? null,
    workflow_name: f.workflowName,
    run_id: f.runId ?? null,
    head_sha: f.headSha,
    match_key: matchKey,
    match_key_version: matchKeyVersion,
    run_started_at: f.runStartedAt,
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

  const repo = repoFromPayload(payload)
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
  const { match_key: matchKey, match_key_version: matchKeyVersion } = buildCheckSuiteMatchKey(
    repo,
    branch,
    appId
  )

  return {
    event_type: `check_suite.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: 'production', // Only protected-branch events reach this point post-gate.
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

interface CheckRunFields {
  checkName: string
  checkRunId: number | undefined
  headSha: string | null
  appName: string | null
  appId: number | undefined
  runStartedAt: string | null
  htmlUrl: unknown
}

function extractCheckRunFields(run: Record<string, unknown>): CheckRunFields {
  const appObj = (run.app as Record<string, unknown>) || {}
  return {
    checkName: (run.name as string) || 'Unknown check',
    checkRunId: run.id as number | undefined,
    headSha: (run.head_sha as string) || null,
    appName: (appObj.name as string) || null,
    appId: appObj.id as number | undefined,
    runStartedAt: (run.started_at as string) || (run.completed_at as string) || null,
    htmlUrl: run.html_url,
  }
}

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

  const repo = repoFromPayload(payload)
  const f = extractCheckRunFields(checkRun)
  const venture = repo ? repoToVenture(repo) : null
  const { match_key: matchKey, match_key_version: matchKeyVersion } = buildCheckRunMatchKey(
    repo,
    branch,
    f.appId,
    f.checkName
  )

  const summary = `Check "${f.checkName}" ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`
  const details = {
    check_run_id: f.checkRunId,
    check_name: f.checkName,
    app_id: f.appId,
    app_name: f.appName,
    conclusion,
    branch,
    commit_sha: f.headSha,
    html_url: f.htmlUrl,
  }

  return {
    event_type: `check_run.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: 'production',
    venture,
    content_key: `check_run:${f.checkRunId}:${conclusion}`,
    check_run_id: f.checkRunId ?? null,
    head_sha: f.headSha,
    app_id: f.appId ?? null,
    app_name: f.appName,
    match_key: matchKey,
    match_key_version: matchKeyVersion,
    run_started_at: f.runStartedAt,
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
