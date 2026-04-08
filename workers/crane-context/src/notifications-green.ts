/**
 * Crane Context Worker - Green Event Classifier
 *
 * Parallel to notifications-github.ts and notifications-vercel.ts. Classifies
 * `workflow_run.success`, `check_suite.success`, `check_run.success`, and
 * Vercel `deployment.ready` / `deployment.succeeded` events into a structured
 * GreenEvent that can be processed by `processGreenEvent` in notifications.ts
 * to auto-resolve prior failure notifications.
 *
 * THIS IS AN ADDITIVE PATH. The existing failure normalizers in
 * notifications-github.ts and notifications-vercel.ts are completely unchanged.
 * `classifyGreenEvent` runs only AFTER the existing normalizer returns null.
 * A bug in this file CANNOT regress the failure path.
 */

import {
  GREEN_CONCLUSIONS,
  GREEN_DEPLOYMENT_TYPES,
  SCHEDULE_LIKE_EVENTS,
  VERCEL_PROJECT_TO_VENTURE,
} from './constants'
import {
  buildMatchKey,
  computeDedupeHash,
  repoToVenture,
  type BuildMatchKeyParams,
} from './notifications'
import type {
  NotificationMatchKeyVersion,
  NotificationAutoResolveReason,
  NotificationSource,
} from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * A normalized green event ready for `processGreenEvent`.
 *
 * Note: this carries the SAME structural fields as a failure notification
 * (workflow_id, run_id, head_sha, etc.) so the synthetic green row inserted
 * by the auto-resolver is queryable for audit.
 */
export interface GreenEvent {
  source: NotificationSource
  event_type: string
  source_event: 'workflow_run' | 'check_suite' | 'check_run' | 'deployment'
  match_key: string
  match_key_version: NotificationMatchKeyVersion
  run_started_at: string
  head_sha: string | null
  is_schedule_like: boolean
  repo: string | null
  branch: string | null
  venture: string | null
  details_json: string
  summary: string
  auto_resolve_reason: NotificationAutoResolveReason
  // Structural identifiers (carried through to the synthetic green row)
  workflow_id: number | null
  workflow_name: string | null
  run_id: number | null
  check_suite_id: number | null
  check_run_id: number | null
  app_id: number | null
  app_name: string | null
  deployment_id: string | null
  project_name: string | null
  target: string | null
  // Content key for dedupe
  content_key: string
}

// ============================================================================
// GitHub Workflow Run Classifier
// ============================================================================

/**
 * Classify a GitHub workflow_run.completed event with conclusion: success
 * (or neutral) into a GreenEvent. Returns null for non-green events.
 */
export function classifyGreenWorkflowRun(payload: Record<string, unknown>): GreenEvent | null {
  const workflowRun = payload.workflow_run as Record<string, unknown> | undefined
  if (!workflowRun) return null

  const conclusion = workflowRun.conclusion as string
  if (!GREEN_CONCLUSIONS.includes(conclusion as (typeof GREEN_CONCLUSIONS)[number])) {
    return null
  }

  const branch = (workflowRun.head_branch as string) || null
  const repoFullName =
    ((payload.repository as Record<string, unknown>)?.full_name as string) || null
  const workflowId = workflowRun.workflow_id as number | undefined
  const runId = workflowRun.id as number | undefined
  const runStartedAt = (workflowRun.run_started_at as string) || (workflowRun.created_at as string)
  const headSha = (workflowRun.head_sha as string) || null
  const event = (workflowRun.event as string) || ''
  const workflowName = (workflowRun.name as string) || null
  const runNumber = workflowRun.run_number as number | undefined
  const htmlUrl = (workflowRun.html_url as string) || ''

  // Need repo, branch, and workflow_id to construct a v2_id match_key.
  // If any are missing, we cannot match this green to anything reliably.
  if (!repoFullName || !branch || !workflowId || !runStartedAt || !runId) {
    return null
  }

  const matchKeyParams: BuildMatchKeyParams = {
    source: 'github',
    kind: 'workflow_run',
    repo_full_name: repoFullName,
    branch,
    workflow_id: workflowId,
  }
  const { match_key, match_key_version } = buildMatchKey(matchKeyParams)

  const isScheduleLike = SCHEDULE_LIKE_EVENTS.includes(
    event as (typeof SCHEDULE_LIKE_EVENTS)[number]
  )

  const venture = repoFullName ? repoToVenture(repoFullName) : null

  const details = {
    workflow_name: workflowName,
    workflow_id: workflowId,
    run_number: runNumber,
    run_id: runId,
    conclusion,
    branch,
    commit_sha: headSha,
    html_url: htmlUrl,
    event,
    is_schedule_like: isScheduleLike,
  }

  const summary = workflowName
    ? `${workflowName} #${runNumber ?? '?'} ${conclusion} on ${branch}`
    : `Workflow run ${conclusion} on ${branch}`

  return {
    source: 'github',
    event_type: `workflow_run.${conclusion}`,
    source_event: 'workflow_run',
    match_key,
    match_key_version,
    run_started_at: runStartedAt,
    head_sha: headSha,
    is_schedule_like: isScheduleLike,
    repo: repoFullName,
    branch,
    venture,
    details_json: JSON.stringify(details),
    summary,
    auto_resolve_reason: 'green_workflow_run',
    workflow_id: workflowId,
    workflow_name: workflowName,
    run_id: runId,
    check_suite_id: null,
    check_run_id: null,
    app_id: null,
    app_name: null,
    deployment_id: null,
    project_name: null,
    target: null,
    content_key: `workflow_run:${runId}:${conclusion}`,
  }
}

// ============================================================================
// GitHub Check Suite Classifier
// ============================================================================

export function classifyGreenCheckSuite(payload: Record<string, unknown>): GreenEvent | null {
  const checkSuite = payload.check_suite as Record<string, unknown> | undefined
  if (!checkSuite) return null

  const conclusion = checkSuite.conclusion as string
  if (!GREEN_CONCLUSIONS.includes(conclusion as (typeof GREEN_CONCLUSIONS)[number])) {
    return null
  }

  const branch = (checkSuite.head_branch as string) || null
  const repoFullName =
    ((payload.repository as Record<string, unknown>)?.full_name as string) || null
  const app = (checkSuite.app as Record<string, unknown>) || {}
  const appId = app.id as number | undefined
  const appName = (app.name as string) || null
  const checkSuiteId = checkSuite.id as number | undefined
  const headSha = (checkSuite.head_sha as string) || null
  const createdAt = (checkSuite.created_at as string) || null
  const updatedAt = (checkSuite.updated_at as string) || null
  const runStartedAt = createdAt || updatedAt

  if (!repoFullName || !branch || !appId || !checkSuiteId || !runStartedAt) {
    return null
  }

  const { match_key, match_key_version } = buildMatchKey({
    source: 'github',
    kind: 'check_suite',
    repo_full_name: repoFullName,
    branch,
    app_id: appId,
  })

  const venture = repoToVenture(repoFullName)

  const details = {
    check_suite_id: checkSuiteId,
    app_id: appId,
    app_name: appName,
    conclusion,
    branch,
    commit_sha: headSha,
  }

  return {
    source: 'github',
    event_type: `check_suite.${conclusion}`,
    source_event: 'check_suite',
    match_key,
    match_key_version,
    run_started_at: runStartedAt,
    head_sha: headSha,
    is_schedule_like: false,
    repo: repoFullName,
    branch,
    venture,
    details_json: JSON.stringify(details),
    summary: `Check suite (${appName ?? 'unknown'}) ${conclusion} on ${branch}`,
    auto_resolve_reason: 'green_check_suite',
    workflow_id: null,
    workflow_name: null,
    run_id: null,
    check_suite_id: checkSuiteId,
    check_run_id: null,
    app_id: appId,
    app_name: appName,
    deployment_id: null,
    project_name: null,
    target: null,
    content_key: `check_suite:${checkSuiteId}:${conclusion}`,
  }
}

// ============================================================================
// GitHub Check Run Classifier
// ============================================================================

export function classifyGreenCheckRun(payload: Record<string, unknown>): GreenEvent | null {
  const checkRun = payload.check_run as Record<string, unknown> | undefined
  if (!checkRun) return null

  // Only process completed check runs
  if (checkRun.status !== 'completed') return null

  const conclusion = checkRun.conclusion as string
  if (!GREEN_CONCLUSIONS.includes(conclusion as (typeof GREEN_CONCLUSIONS)[number])) {
    return null
  }

  const checkSuiteInRun = checkRun.check_suite as Record<string, unknown> | undefined
  const branch = (checkSuiteInRun?.head_branch as string) || null
  const repoFullName =
    ((payload.repository as Record<string, unknown>)?.full_name as string) || null
  const app = (checkRun.app as Record<string, unknown>) || {}
  const appId = app.id as number | undefined
  const appName = (app.name as string) || null
  const checkRunId = checkRun.id as number | undefined
  const checkName = (checkRun.name as string) || null
  const headSha = (checkRun.head_sha as string) || null
  const startedAt = (checkRun.started_at as string) || null
  const completedAt = (checkRun.completed_at as string) || null
  const runStartedAt = startedAt || completedAt

  if (!repoFullName || !branch || !appId || !checkRunId || !checkName || !runStartedAt) {
    return null
  }

  const { match_key, match_key_version } = buildMatchKey({
    source: 'github',
    kind: 'check_run',
    repo_full_name: repoFullName,
    branch,
    app_id: appId,
    name: checkName,
  })

  const venture = repoToVenture(repoFullName)

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

  return {
    source: 'github',
    event_type: `check_run.${conclusion}`,
    source_event: 'check_run',
    match_key,
    match_key_version,
    run_started_at: runStartedAt,
    head_sha: headSha,
    is_schedule_like: false,
    repo: repoFullName,
    branch,
    venture,
    details_json: JSON.stringify(details),
    summary: `Check "${checkName}" ${conclusion} on ${branch}`,
    auto_resolve_reason: 'green_check_run',
    workflow_id: null,
    workflow_name: null,
    run_id: null,
    check_suite_id: null,
    check_run_id: checkRunId,
    app_id: appId,
    app_name: appName,
    deployment_id: null,
    project_name: null,
    target: null,
    content_key: `check_run:${checkRunId}:${conclusion}`,
  }
}

// ============================================================================
// Vercel Deployment Classifier
// ============================================================================

export function classifyGreenDeployment(
  webhookType: string,
  payload: Record<string, unknown>
): GreenEvent | null {
  if (!GREEN_DEPLOYMENT_TYPES.includes(webhookType as (typeof GREEN_DEPLOYMENT_TYPES)[number])) {
    return null
  }

  const deployment = payload as Record<string, unknown>
  const meta = (deployment.meta as Record<string, unknown>) || {}

  const projectName = (deployment.name as string) || null
  const deploymentId = (deployment.id as string) || (deployment.uid as string) || null
  const target = (deployment.target as string) || 'preview'
  const branch = (meta.githubCommitRef as string) || null
  const headSha = (meta.githubCommitSha as string) || null
  const repoFullName = meta.githubRepo ? `${meta.githubOrg || 'unknown'}/${meta.githubRepo}` : null
  const createdAt = (deployment.createdAt as string) || (deployment.created as string) || null
  // Vercel includes teamId at the top level of the payload (or under .team).
  // For payloads without it (single-team setups, legacy webhooks), fall back
  // to the literal "no-team" so the match_key slot remains occupied. This
  // preserves cross-team isolation for any payload that DOES have a team_id.
  const vercelTeamId =
    (deployment.teamId as string) ||
    ((deployment.team as Record<string, unknown>)?.id as string) ||
    'no-team'

  if (!repoFullName || !branch || !projectName || !deploymentId || !createdAt) {
    return null
  }

  const { match_key, match_key_version } = buildMatchKey({
    source: 'vercel',
    repo_full_name: repoFullName,
    branch,
    vercel_team_id: vercelTeamId,
    project_name: projectName,
    target,
  })

  // For Vercel, venture mapping is by project name not repo
  const venture = VERCEL_PROJECT_TO_VENTURE[projectName] || null

  const details = {
    deployment_id: deploymentId,
    project_name: projectName,
    target,
    branch,
    commit_sha: headSha,
    url: deployment.url ? `https://${deployment.url}` : null,
  }

  return {
    source: 'vercel',
    event_type: webhookType,
    source_event: 'deployment',
    match_key,
    match_key_version,
    run_started_at: createdAt,
    head_sha: headSha,
    is_schedule_like: false,
    repo: repoFullName,
    branch,
    venture,
    details_json: JSON.stringify(details),
    summary: `Vercel deployment ready: ${projectName} (${target}) on ${branch}`,
    auto_resolve_reason: 'green_deployment',
    workflow_id: null,
    workflow_name: null,
    run_id: null,
    check_suite_id: null,
    check_run_id: null,
    app_id: null,
    app_name: null,
    deployment_id: deploymentId,
    project_name: projectName,
    target,
    content_key: `vercel:${deploymentId}:${webhookType}`,
  }
}

// ============================================================================
// Top-level Classifier (used by the ingest endpoint)
// ============================================================================

/**
 * Classify a GitHub or Vercel event as a green event. Returns null if the
 * event is not green or cannot be classified (missing required fields).
 *
 * Called from the ingest endpoint AFTER the existing failure normalizer
 * returns null. The two paths never interact.
 */
export function classifyGreenEvent(
  source: 'github' | 'vercel',
  eventType: string,
  payload: Record<string, unknown>
): GreenEvent | null {
  if (source === 'github') {
    switch (eventType) {
      case 'workflow_run':
        return classifyGreenWorkflowRun(payload)
      case 'check_suite':
        return classifyGreenCheckSuite(payload)
      case 'check_run':
        return classifyGreenCheckRun(payload)
      default:
        return null
    }
  }
  if (source === 'vercel') {
    return classifyGreenDeployment(eventType, payload)
  }
  return null
}

/**
 * Compute a dedupe hash for a green event. Mirrors `computeGitHubDedupeHash`
 * and `computeVercelDedupeHash` for the failure path.
 */
export async function computeGreenDedupeHash(green: GreenEvent): Promise<string> {
  return computeDedupeHash({
    source: green.source,
    event_type: green.event_type,
    repo: green.repo,
    branch: green.branch,
    content_key: green.content_key,
  })
}
