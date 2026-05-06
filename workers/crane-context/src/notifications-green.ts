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
  isProtectedBranch,
} from './constants'
import {
  buildMatchKey,
  computeDedupeHash,
  repoToVenture,
  type BuildMatchKeyParams,
} from './notifications'
import {
  extractWorkflowRunFields,
  extractCheckSuiteFields,
  extractCheckRunFields,
  extractVercelDeploymentFields,
} from './notifications-green-extract'
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

/** Build the details object for a workflow_run green event. */
function buildWorkflowRunDetails(fields: ReturnType<typeof extractWorkflowRunFields>) {
  if (!fields) return null
  return {
    workflow_name: fields.workflowName,
    workflow_id: fields.workflowId,
    run_number: fields.runNumber,
    run_id: fields.runId,
    conclusion: fields.conclusion,
    branch: fields.branch,
    commit_sha: fields.headSha,
    html_url: fields.htmlUrl,
    event: fields.event,
    is_schedule_like: SCHEDULE_LIKE_EVENTS.includes(
      fields.event as (typeof SCHEDULE_LIKE_EVENTS)[number]
    ),
  }
}

/**
 * Classify a GitHub workflow_run.completed event with conclusion: success
 * (or neutral) into a GreenEvent. Returns null for non-green events.
 */
export function classifyGreenWorkflowRun(payload: Record<string, unknown>): GreenEvent | null {
  const fields = extractWorkflowRunFields(payload)
  if (!fields) return null

  if (!GREEN_CONCLUSIONS.includes(fields.conclusion as (typeof GREEN_CONCLUSIONS)[number])) {
    return null
  }
  if (!isProtectedBranch(fields.branch)) return null

  const matchKeyParams: BuildMatchKeyParams = {
    source: 'github',
    kind: 'workflow_run',
    repo_full_name: fields.repoFullName,
    branch: fields.branch,
    workflow_id: fields.workflowId,
  }
  const { match_key, match_key_version } = buildMatchKey(matchKeyParams)

  const isScheduleLike = SCHEDULE_LIKE_EVENTS.includes(
    fields.event as (typeof SCHEDULE_LIKE_EVENTS)[number]
  )
  const details = buildWorkflowRunDetails(fields)
  const summary = fields.workflowName
    ? `${fields.workflowName} #${fields.runNumber ?? '?'} ${fields.conclusion} on ${fields.branch}`
    : `Workflow run ${fields.conclusion} on ${fields.branch}`

  return {
    source: 'github',
    event_type: `workflow_run.${fields.conclusion}`,
    source_event: 'workflow_run',
    match_key,
    match_key_version,
    run_started_at: fields.runStartedAt,
    head_sha: fields.headSha,
    is_schedule_like: isScheduleLike,
    repo: fields.repoFullName,
    branch: fields.branch,
    venture: repoToVenture(fields.repoFullName),
    details_json: JSON.stringify(details),
    summary,
    auto_resolve_reason: 'green_workflow_run',
    workflow_id: fields.workflowId,
    workflow_name: fields.workflowName,
    run_id: fields.runId,
    check_suite_id: null,
    check_run_id: null,
    app_id: null,
    app_name: null,
    deployment_id: null,
    project_name: null,
    target: null,
    content_key: `workflow_run:${fields.runId}:${fields.conclusion}`,
  }
}

// ============================================================================
// GitHub Check Suite Classifier
// ============================================================================

export function classifyGreenCheckSuite(payload: Record<string, unknown>): GreenEvent | null {
  const fields = extractCheckSuiteFields(payload)
  if (!fields) return null

  if (!GREEN_CONCLUSIONS.includes(fields.conclusion as (typeof GREEN_CONCLUSIONS)[number])) {
    return null
  }
  if (!isProtectedBranch(fields.branch)) return null

  const { match_key, match_key_version } = buildMatchKey({
    source: 'github',
    kind: 'check_suite',
    repo_full_name: fields.repoFullName,
    branch: fields.branch,
    app_id: fields.appId,
  })

  const details = {
    check_suite_id: fields.checkSuiteId,
    app_id: fields.appId,
    app_name: fields.appName,
    conclusion: fields.conclusion,
    branch: fields.branch,
    commit_sha: fields.headSha,
  }

  return {
    source: 'github',
    event_type: `check_suite.${fields.conclusion}`,
    source_event: 'check_suite',
    match_key,
    match_key_version,
    run_started_at: fields.runStartedAt,
    head_sha: fields.headSha,
    is_schedule_like: false,
    repo: fields.repoFullName,
    branch: fields.branch,
    venture: repoToVenture(fields.repoFullName),
    details_json: JSON.stringify(details),
    summary: `Check suite (${fields.appName ?? 'unknown'}) ${fields.conclusion} on ${fields.branch}`,
    auto_resolve_reason: 'green_check_suite',
    workflow_id: null,
    workflow_name: null,
    run_id: null,
    check_suite_id: fields.checkSuiteId,
    check_run_id: null,
    app_id: fields.appId,
    app_name: fields.appName,
    deployment_id: null,
    project_name: null,
    target: null,
    content_key: `check_suite:${fields.checkSuiteId}:${fields.conclusion}`,
  }
}

// ============================================================================
// GitHub Check Run Classifier
// ============================================================================

export function classifyGreenCheckRun(payload: Record<string, unknown>): GreenEvent | null {
  const fields = extractCheckRunFields(payload)
  if (!fields) return null

  if (!GREEN_CONCLUSIONS.includes(fields.conclusion as (typeof GREEN_CONCLUSIONS)[number])) {
    return null
  }
  if (!isProtectedBranch(fields.branch)) return null

  const { match_key, match_key_version } = buildMatchKey({
    source: 'github',
    kind: 'check_run',
    repo_full_name: fields.repoFullName,
    branch: fields.branch,
    app_id: fields.appId,
    name: fields.checkName,
  })

  const details = {
    check_run_id: fields.checkRunId,
    check_name: fields.checkName,
    app_id: fields.appId,
    app_name: fields.appName,
    conclusion: fields.conclusion,
    branch: fields.branch,
    commit_sha: fields.headSha,
    html_url: fields.htmlUrl,
  }

  return {
    source: 'github',
    event_type: `check_run.${fields.conclusion}`,
    source_event: 'check_run',
    match_key,
    match_key_version,
    run_started_at: fields.runStartedAt,
    head_sha: fields.headSha,
    is_schedule_like: false,
    repo: fields.repoFullName,
    branch: fields.branch,
    venture: repoToVenture(fields.repoFullName),
    details_json: JSON.stringify(details),
    summary: `Check "${fields.checkName}" ${fields.conclusion} on ${fields.branch}`,
    auto_resolve_reason: 'green_check_run',
    workflow_id: null,
    workflow_name: null,
    run_id: null,
    check_suite_id: null,
    check_run_id: fields.checkRunId,
    app_id: fields.appId,
    app_name: fields.appName,
    deployment_id: null,
    project_name: null,
    target: null,
    content_key: `check_run:${fields.checkRunId}:${fields.conclusion}`,
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

  const fields = extractVercelDeploymentFields(payload)
  if (!fields) return null

  const { match_key, match_key_version } = buildMatchKey({
    source: 'vercel',
    repo_full_name: fields.repoFullName,
    branch: fields.branch,
    vercel_team_id: fields.vercelTeamId,
    project_name: fields.projectName,
    target: fields.target,
  })

  const details = {
    deployment_id: fields.deploymentId,
    project_name: fields.projectName,
    target: fields.target,
    branch: fields.branch,
    commit_sha: fields.headSha,
    url: fields.deploymentUrl,
  }

  return {
    source: 'vercel',
    event_type: webhookType,
    source_event: 'deployment',
    match_key,
    match_key_version,
    run_started_at: fields.createdAt,
    head_sha: fields.headSha,
    is_schedule_like: false,
    repo: fields.repoFullName,
    branch: fields.branch,
    venture: VERCEL_PROJECT_TO_VENTURE[fields.projectName] || null,
    details_json: JSON.stringify(details),
    summary: `Vercel deployment ready: ${fields.projectName} (${fields.target}) on ${fields.branch}`,
    auto_resolve_reason: 'green_deployment',
    workflow_id: null,
    workflow_name: null,
    run_id: null,
    check_suite_id: null,
    check_run_id: null,
    app_id: null,
    app_name: null,
    deployment_id: fields.deploymentId,
    project_name: fields.projectName,
    target: fields.target,
    content_key: `vercel:${fields.deploymentId}:${webhookType}`,
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
