/**
 * Crane Context Worker - Vercel Event Normalizer
 *
 * Normalizes Vercel deployment webhook events into the notifications schema.
 * Only deployment.error and deployment.canceled events produce notifications;
 * deployment.created, deployment.succeeded, and deployment.ready are ignored.
 */

import { VERCEL_PROJECT_TO_VENTURE } from './constants'
import { computeDedupeHash, buildMatchKey } from './notifications'
import type { NotificationSeverity, NotificationMatchKeyVersion } from './types'

// ============================================================================
// Types
// ============================================================================

export interface NormalizedVercelNotification {
  event_type: string
  severity: NotificationSeverity
  summary: string
  details_json: string
  repo: string | null
  branch: string | null
  environment: string | null
  venture: string | null
  content_key: string

  // Structural identifiers (PR A2)
  deployment_id?: string | null
  project_name?: string | null
  target?: string | null
  head_sha?: string | null
  // GitHub-only fields (always undefined for vercel events; included so the
  // single createNotification call site at the ingest endpoint can pass
  // through both NormalizedNotification and NormalizedVercelNotification
  // without per-source branching).
  workflow_id?: number | null
  workflow_name?: string | null
  run_id?: number | null
  check_suite_id?: number | null
  check_run_id?: number | null
  app_id?: number | null
  app_name?: string | null
  match_key?: string | null
  match_key_version?: NotificationMatchKeyVersion | null
  run_started_at?: string | null
}

// ============================================================================
// Vercel Deployment Normalizer — helpers
// ============================================================================

interface DeploymentFields {
  projectName: string
  deploymentId: string
  target: string
  branch: string | null
  commitSha: string | null
  commitMessage: string | null
  repo: string | null
  errorMessage: string | null
  vercelTeamId: string
  runStartedAt: string | null
  urlStr: string | null
  creatorUsername: string | null
}

function strOrNull(val: unknown): string | null {
  return typeof val === 'string' && val.length > 0 ? val : null
}

function strOrDefault(val: unknown, fallback: string): string {
  return typeof val === 'string' && val.length > 0 ? val : fallback
}

function extractDeploymentFields(payload: Record<string, unknown>): DeploymentFields {
  const meta = (payload.meta as Record<string, unknown>) ?? {}
  const team = (payload.team as Record<string, unknown>) ?? {}
  const creator = (payload.creator as Record<string, unknown>) ?? {}
  const projectName = strOrDefault(payload.name, 'unknown-project')
  const deploymentId = strOrDefault(payload.id, '') || strOrDefault(payload.uid, 'unknown')
  const target = strOrDefault(payload.target, 'preview')
  const branch = strOrNull(meta.githubCommitRef)
  const commitSha = strOrNull(meta.githubCommitSha)
  const commitMessage = strOrNull(meta.githubCommitMessage)
  const githubOrg = strOrDefault(meta.githubOrg, 'unknown')
  const repo = meta.githubRepo ? `${githubOrg}/${String(meta.githubRepo)}` : null
  const errorMessage = strOrNull(payload.errorMessage)
  const vercelTeamId = strOrDefault(payload.teamId, '') || strOrDefault(team.id, 'no-team')
  const runStartedAt = strOrNull(payload.createdAt) ?? strOrNull(payload.created)
  const urlStr = payload.url ? `https://${String(payload.url)}` : null
  const creatorUsername = strOrNull(creator.username)
  return {
    projectName,
    deploymentId,
    target,
    branch,
    commitSha,
    commitMessage,
    repo,
    errorMessage,
    vercelTeamId,
    runStartedAt,
    urlStr,
    creatorUsername,
  }
}

function computeSeverityAndLabel(
  webhookType: string,
  target: string
): { severity: NotificationSeverity; statusLabel: string } {
  if (webhookType === 'deployment.error') {
    return { severity: target === 'production' ? 'critical' : 'warning', statusLabel: 'failed' }
  }
  return { severity: 'info', statusLabel: 'canceled' }
}

function computeVercelMatchKey(
  repo: string | null,
  branch: string | null,
  projectName: string,
  target: string,
  vercelTeamId: string
): { matchKey: string | null; matchKeyVersion: NotificationMatchKeyVersion | null } {
  if (!repo || !branch) return { matchKey: null, matchKeyVersion: null }
  const built = buildMatchKey({
    source: 'vercel',
    repo_full_name: repo,
    branch,
    vercel_team_id: vercelTeamId,
    project_name: projectName,
    target,
  })
  return { matchKey: built.match_key, matchKeyVersion: built.match_key_version }
}

// ============================================================================
// Vercel Deployment Normalizer
// ============================================================================

/**
 * Normalize a Vercel webhook payload into a notification.
 * Returns null for events we don't care about (success, created, ready).
 */
export function normalizeVercelDeployment(
  webhookType: string,
  payload: Record<string, unknown>
): NormalizedVercelNotification | null {
  // Only process error and canceled events
  if (webhookType !== 'deployment.error' && webhookType !== 'deployment.canceled') {
    return null
  }

  const f = extractDeploymentFields(payload)
  const venture = VERCEL_PROJECT_TO_VENTURE[f.projectName] || null
  const { severity, statusLabel } = computeSeverityAndLabel(webhookType, f.target)
  const branchSuffix = f.branch ? `on ${f.branch}` : ''
  const summary =
    `Vercel deployment ${statusLabel}: ${f.projectName} (${f.target}) ${branchSuffix}`.trim()
  const details: Record<string, unknown> = {
    deployment_id: f.deploymentId,
    project_name: f.projectName,
    target: f.target,
    branch: f.branch,
    commit_sha: f.commitSha,
    commit_message: f.commitMessage,
    error_message: f.errorMessage,
    url: f.urlStr,
    creator: f.creatorUsername,
  }
  const { matchKey, matchKeyVersion } = computeVercelMatchKey(
    f.repo,
    f.branch,
    f.projectName,
    f.target,
    f.vercelTeamId
  )

  return {
    event_type: webhookType,
    severity,
    summary,
    details_json: JSON.stringify(details),
    repo: f.repo,
    branch: f.branch,
    environment: f.target,
    venture,
    content_key: `vercel:${f.deploymentId}:${webhookType}`,
    deployment_id: f.deploymentId,
    project_name: f.projectName,
    target: f.target,
    head_sha: f.commitSha,
    match_key: matchKey,
    match_key_version: matchKeyVersion,
    run_started_at: f.runStartedAt,
  }
}

/**
 * Compute a dedupe hash for a Vercel notification.
 */
export async function computeVercelDedupeHash(
  normalized: NormalizedVercelNotification
): Promise<string> {
  return computeDedupeHash({
    source: 'vercel',
    event_type: normalized.event_type,
    repo: normalized.repo,
    branch: normalized.branch,
    content_key: normalized.content_key,
  })
}
