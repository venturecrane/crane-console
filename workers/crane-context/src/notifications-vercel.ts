/**
 * Crane Context Worker - Vercel Event Normalizer
 *
 * Normalizes Vercel deployment webhook events into the notifications schema.
 * Only deployment.error and deployment.canceled events produce notifications;
 * deployment.created, deployment.succeeded, and deployment.ready are ignored.
 */

import { VERCEL_PROJECT_TO_VENTURE } from './constants'
import { computeDedupeHash } from './notifications'
import type { NotificationSeverity } from './types'

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
