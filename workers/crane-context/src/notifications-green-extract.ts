/**
 * Crane Context Worker - Green Event Field Extractors
 *
 * Typed field-extraction helpers for classifyGreen* functions. Each helper
 * pulls structured fields out of a raw `Record<string, unknown>` payload and
 * returns a typed object (or null if required fields are absent). Keeping
 * extraction separate from classification holds each classifier below the
 * max-lines-per-function and complexity ceilings.
 */

// ============================================================================
// Primitive coercers (eliminate per-|| complexity branches)
// ============================================================================

/** Return the value as a string if it is a non-empty string, else null. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Return the value as a number if it is a finite number, else undefined. */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined
}

/** Cast to a plain object or return an empty object. */
function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

// ============================================================================
// Shared helpers
// ============================================================================

/** Safely extract the repository full_name from a payload. */
export function extractRepoFullName(payload: Record<string, unknown>): string | null {
  return str(obj(payload.repository).full_name)
}

// ============================================================================
// workflow_run fields
// ============================================================================

export interface WorkflowRunFields {
  conclusion: string
  branch: string
  repoFullName: string
  workflowId: number
  runId: number
  runStartedAt: string
  headSha: string | null
  event: string
  workflowName: string | null
  runNumber: number | undefined
  htmlUrl: string
}

/**
 * Extract and validate all fields needed for a green workflow_run event.
 * Returns null if any required field is missing.
 */
export function extractWorkflowRunFields(
  payload: Record<string, unknown>
): WorkflowRunFields | null {
  const run = obj(payload.workflow_run)
  if (!Object.keys(run).length) return null

  const conclusion = str(run.conclusion)
  const branch = str(run.head_branch)
  const repoFullName = extractRepoFullName(payload)
  const workflowId = num(run.workflow_id)
  const runId = num(run.id)
  const runStartedAt = str(run.run_started_at) ?? str(run.created_at)

  if (!conclusion || !branch || !repoFullName || !workflowId || !runId || !runStartedAt) {
    return null
  }

  return {
    conclusion,
    branch,
    repoFullName,
    workflowId,
    runId,
    runStartedAt,
    headSha: str(run.head_sha),
    event: str(run.event) ?? '',
    workflowName: str(run.name),
    runNumber: num(run.run_number),
    htmlUrl: str(run.html_url) ?? '',
  }
}

// ============================================================================
// check_suite fields
// ============================================================================

export interface CheckSuiteFields {
  conclusion: string
  branch: string
  repoFullName: string
  appId: number
  appName: string | null
  checkSuiteId: number
  headSha: string | null
  runStartedAt: string
}

/**
 * Extract and validate all fields needed for a green check_suite event.
 * Returns null if any required field is missing.
 */
export function extractCheckSuiteFields(payload: Record<string, unknown>): CheckSuiteFields | null {
  const suite = obj(payload.check_suite)
  if (!Object.keys(suite).length) return null

  const conclusion = str(suite.conclusion)
  const branch = str(suite.head_branch)
  const repoFullName = extractRepoFullName(payload)
  const app = obj(suite.app)
  const appId = num(app.id)
  const checkSuiteId = num(suite.id)
  const runStartedAt = str(suite.created_at) ?? str(suite.updated_at)

  if (!conclusion || !branch || !repoFullName || !appId || !checkSuiteId || !runStartedAt) {
    return null
  }

  return {
    conclusion,
    branch,
    repoFullName,
    appId,
    appName: str(app.name),
    checkSuiteId,
    headSha: str(suite.head_sha),
    runStartedAt,
  }
}

// ============================================================================
// check_run fields
// ============================================================================

export interface CheckRunFields {
  conclusion: string
  branch: string
  repoFullName: string
  appId: number
  appName: string | null
  checkRunId: number
  checkName: string
  headSha: string | null
  runStartedAt: string
  htmlUrl: unknown
}

/**
 * Extract and validate all fields needed for a green check_run event.
 * Returns null if any required field is missing or status is not completed.
 */
export function extractCheckRunFields(payload: Record<string, unknown>): CheckRunFields | null {
  const run = obj(payload.check_run)
  if (!Object.keys(run).length) return null
  if (run.status !== 'completed') return null

  const conclusion = str(run.conclusion)
  const branch = str(obj(run.check_suite).head_branch)
  const repoFullName = extractRepoFullName(payload)
  const app = obj(run.app)
  const appId = num(app.id)
  const checkRunId = num(run.id)
  const checkName = str(run.name)
  const runStartedAt = str(run.started_at) ?? str(run.completed_at)

  if (
    !conclusion ||
    !branch ||
    !repoFullName ||
    !appId ||
    !checkRunId ||
    !checkName ||
    !runStartedAt
  ) {
    return null
  }

  return {
    conclusion,
    branch,
    repoFullName,
    appId,
    appName: str(app.name),
    checkRunId,
    checkName,
    headSha: str(run.head_sha),
    runStartedAt,
    htmlUrl: run.html_url,
  }
}

// ============================================================================
// Vercel deployment fields
// ============================================================================

export interface VercelDeploymentFields {
  projectName: string
  deploymentId: string
  target: string
  branch: string
  headSha: string | null
  repoFullName: string
  createdAt: string
  vercelTeamId: string
  deploymentUrl: string | null
}

/** Build the repoFullName from Vercel meta fields. */
function buildVercelRepoFullName(meta: Record<string, unknown>): string | null {
  const repo = str(meta.githubRepo)
  if (!repo) return null
  const org = str(meta.githubOrg) ?? 'unknown'
  return `${org}/${repo}`
}

/** Resolve the Vercel team ID, falling back to "no-team". */
function resolveVercelTeamId(deployment: Record<string, unknown>): string {
  return str(deployment.teamId) ?? str(obj(deployment.team).id) ?? 'no-team'
}

/**
 * Extract and validate all fields needed for a green Vercel deployment event.
 * Returns null if any required field is missing.
 */
export function extractVercelDeploymentFields(
  deployment: Record<string, unknown>
): VercelDeploymentFields | null {
  const meta = obj(deployment.meta)

  const projectName = str(deployment.name)
  const deploymentId = str(deployment.id) ?? str(deployment.uid)
  const target = str(deployment.target) ?? 'preview'
  const branch = str(meta.githubCommitRef)
  const repoFullName = buildVercelRepoFullName(meta)
  const createdAt = str(deployment.createdAt) ?? str(deployment.created)

  if (!projectName || !deploymentId || !branch || !repoFullName || !createdAt) {
    return null
  }

  const rawUrl = str(deployment.url)

  return {
    projectName,
    deploymentId,
    target,
    branch,
    headSha: str(meta.githubCommitSha),
    repoFullName,
    createdAt,
    vercelTeamId: resolveVercelTeamId(deployment),
    deploymentUrl: rawUrl ? `https://${rawUrl}` : null,
  }
}
