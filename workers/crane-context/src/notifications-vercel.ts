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

  const deployment = payload as Record<string, unknown>
  const meta = (deployment.meta as Record<string, unknown>) || {}

  const projectName = (deployment.name as string) || 'unknown-project'
  const deploymentId = (deployment.id as string) || (deployment.uid as string) || 'unknown'
  const target = (deployment.target as string) || 'preview'
  const branch = (meta.githubCommitRef as string) || null
  const commitSha = (meta.githubCommitSha as string) || null
  const commitMessage = (meta.githubCommitMessage as string) || null
  const repo = meta.githubRepo ? `${meta.githubOrg || 'unknown'}/${meta.githubRepo}` : null
  const errorMessage = (deployment.errorMessage as string) || null

  // Derive venture from project name
  const venture = VERCEL_PROJECT_TO_VENTURE[projectName] || null

  // Severity rules
  let severity: NotificationSeverity
  if (webhookType === 'deployment.error') {
    severity = target === 'production' ? 'critical' : 'warning'
  } else {
    // deployment.canceled
    severity = 'info'
  }

  const statusLabel = webhookType === 'deployment.error' ? 'failed' : 'canceled'
  const summary = `Vercel deployment ${statusLabel}: ${projectName} (${target}) ${branch ? `on ${branch}` : ''}`

  const details: Record<string, unknown> = {
    deployment_id: deploymentId,
    project_name: projectName,
    target,
    branch,
    commit_sha: commitSha,
    commit_message: commitMessage,
    error_message: errorMessage,
    url: deployment.url ? `https://${deployment.url}` : null,
    creator: (deployment.creator as Record<string, unknown>)?.username || null,
  }

  // Compute v2_id match_key only if we have all the required fields.
  let matchKey: string | null = null
  let matchKeyVersion: NotificationMatchKeyVersion | null = null
  if (repo && branch && projectName && target) {
    const built = buildMatchKey({
      source: 'vercel',
      repo_full_name: repo,
      branch,
      project_name: projectName,
      target,
    })
    matchKey = built.match_key
    matchKeyVersion = built.match_key_version
  }

  const runStartedAt = (deployment.createdAt as string) || (deployment.created as string) || null

  return {
    event_type: webhookType,
    severity,
    summary: summary.trim(),
    details_json: JSON.stringify(details),
    repo,
    branch,
    environment: target,
    venture,
    content_key: `vercel:${deploymentId}:${webhookType}`,
    deployment_id: deploymentId,
    project_name: projectName,
    target,
    head_sha: commitSha,
    match_key: matchKey,
    match_key_version: matchKeyVersion,
    run_started_at: runStartedAt,
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
