/**
 * crane_preflight tool - Environment validation
 */

import { z } from 'zod'
import { checkGhAuth } from '../lib/github.js'
import { getApiBase, getEnvironmentName } from '../lib/config.js'
import { getCurrentRepoInfo } from '../lib/repo-scanner.js'

export const preflightInputSchema = z.object({})

export type PreflightInput = z.infer<typeof preflightInputSchema>

export interface PreflightCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
}

export interface PreflightResult {
  all_passed: boolean
  has_critical_failure: boolean
  checks: PreflightCheck[]
  message: string
}

async function checkApiConnectivity(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBase()}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function executePreflight(_input: PreflightInput): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []

  // Check 1: CRANE_CONTEXT_KEY
  if (process.env.CRANE_CONTEXT_KEY) {
    checks.push({
      name: 'CRANE_CONTEXT_KEY',
      status: 'pass',
      message: 'API key is set',
    })
  } else {
    checks.push({
      name: 'CRANE_CONTEXT_KEY',
      status: 'fail',
      message: 'Not set. Launch with: crane vc',
    })
  }

  // Check 2: gh CLI
  const ghAuth = checkGhAuth()
  if (ghAuth.authenticated) {
    checks.push({
      name: 'GitHub CLI',
      status: 'pass',
      message: 'Installed and authenticated',
    })
  } else if (ghAuth.installed) {
    checks.push({
      name: 'GitHub CLI',
      status: 'fail',
      message: 'Installed but not authenticated. Run: gh auth login',
    })
  } else {
    checks.push({
      name: 'GitHub CLI',
      status: 'fail',
      message: 'Not installed. Run: brew install gh',
    })
  }

  // Check 3: Git repo
  const repoInfo = getCurrentRepoInfo()
  if (repoInfo) {
    checks.push({
      name: 'Git repository',
      status: 'pass',
      message: `${repoInfo.org}/${repoInfo.repo} (${repoInfo.branch})`,
    })
  } else {
    checks.push({
      name: 'Git repository',
      status: 'warn',
      message: 'Not in a git repository',
    })
  }

  // Check 4: API connectivity
  const apiReachable = await checkApiConnectivity()
  const envName = getEnvironmentName()
  if (apiReachable) {
    checks.push({
      name: 'Crane Context API',
      status: 'pass',
      message: `Connected (${envName})`,
    })
  } else {
    checks.push({
      name: 'Crane Context API',
      status: 'fail',
      message: `Cannot reach ${envName} API. Check network connection.`,
    })
  }

  // Summarize
  const criticalFailures = checks.filter(
    (c) => c.status === 'fail' && ['CRANE_CONTEXT_KEY', 'Crane Context API'].includes(c.name)
  )
  const allFailures = checks.filter((c) => c.status === 'fail')
  const allPassed = allFailures.length === 0
  const hasCriticalFailure = criticalFailures.length > 0

  // Build message
  let message = '## Preflight Check\n\n'
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗'
    message += `${icon} **${check.name}**: ${check.message}\n`
  }

  if (hasCriticalFailure) {
    message += '\n**Critical issues detected.** Fix before proceeding.'
  } else if (!allPassed) {
    message += '\n**Warnings present.** Proceed with caution.'
  } else {
    message += '\n**All checks passed.** Ready to proceed.'
  }

  return {
    all_passed: allPassed,
    has_critical_failure: hasCriticalFailure,
    checks,
    message,
  }
}
