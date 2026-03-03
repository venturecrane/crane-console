/**
 * Crane Context Worker - GitHub Event Normalizers
 *
 * Normalizes GitHub CI events (workflow_run, check_suite, check_run)
 * into the notifications schema. Only failure/timeout events produce
 * notifications; success events are silently ignored.
 */

import { repoToVenture, computeDedupeHash } from './notifications'
import type { NotificationSeverity } from './types'

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

  const summary = `${workflowName} #${runNumber} ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`

  const details = {
    workflow_name: workflowName,
    run_number: runNumber,
    run_id: workflowRun.id,
    conclusion,
    branch,
    commit_sha: workflowRun.head_sha,
    html_url: htmlUrl,
    actor: (workflowRun.actor as Record<string, unknown>)?.login || null,
    event: workflowRun.event,
  }

  const venture = repo ? repoToVenture(repo) : null

  return {
    event_type: `workflow_run.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: isProtectedBranch(branch) ? 'production' : 'preview',
    venture,
    content_key: `workflow_run:${workflowRun.id}:${conclusion}`,
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
  const app = ((checkSuite.app as Record<string, unknown>)?.name as string) || 'Unknown'

  const summary = `Check suite (${app}) ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`

  const details = {
    check_suite_id: checkSuite.id,
    app_name: app,
    conclusion,
    branch,
    commit_sha: checkSuite.head_sha,
    total_count: (checkSuite as Record<string, unknown>).latest_check_runs_count,
  }

  const venture = repo ? repoToVenture(repo) : null

  return {
    event_type: `check_suite.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: isProtectedBranch(branch) ? 'production' : 'preview',
    venture,
    content_key: `check_suite:${checkSuite.id}:${conclusion}`,
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

  const summary = `Check "${checkName}" ${conclusion} on ${branch || 'unknown branch'} (${repo || 'unknown repo'})`

  const details = {
    check_run_id: checkRun.id,
    check_name: checkName,
    conclusion,
    branch,
    commit_sha: checkRun.head_sha,
    html_url: checkRun.html_url,
    app_name: (checkRun.app as Record<string, unknown>)?.name || null,
  }

  const venture = repo ? repoToVenture(repo) : null

  return {
    event_type: `check_run.${conclusion}`,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: isProtectedBranch(branch) ? 'production' : 'preview',
    venture,
    content_key: `check_run:${checkRun.id}:${conclusion}`,
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
