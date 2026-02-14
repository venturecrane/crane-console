/**
 * Environment configuration for crane-mcp.
 *
 * Resolves API base URLs and Infisical paths based on CRANE_ENV.
 *
 * CRANE_ENV values:
 * - 'prod' (default): Production infrastructure
 * - 'dev': Staging infrastructure (currently only vc venture has staging)
 */

export type CraneEnv = 'prod' | 'dev'

const URLS: Record<CraneEnv, string> = {
  prod: 'https://crane-context.automation-ab6.workers.dev',
  dev: 'https://crane-context-staging.automation-ab6.workers.dev',
}

/**
 * Resolve the current environment from CRANE_ENV.
 * Defaults to 'prod'. Unknown values fall back to 'prod'.
 */
export function getCraneEnv(): CraneEnv {
  const raw = process.env.CRANE_ENV?.toLowerCase()
  if (raw === 'dev') return 'dev'
  return 'prod'
}

/**
 * API base URL for MCP server operations. Follows CRANE_ENV.
 */
export function getApiBase(): string {
  return URLS[getCraneEnv()]
}

/** Production API base — always production. Used by launcher for fetchVentures. */
export const API_BASE_PRODUCTION = URLS.prod

/**
 * Human-readable environment name for display in preflight and logs.
 */
export function getEnvironmentName(): string {
  return getCraneEnv() === 'dev' ? 'staging' : 'production'
}

/**
 * Get the Infisical path for staging secrets.
 * Only the vc venture has staging infrastructure — returns null for all others.
 */
export function getStagingInfisicalPath(ventureCode: string): string | null {
  if (ventureCode === 'vc') return '/vc/staging'
  return null
}
