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

function checkContextKey(): PreflightCheck {
  if (process.env.CRANE_CONTEXT_KEY) {
    return { name: 'CRANE_CONTEXT_KEY', status: 'pass', message: 'API key is set' }
  }
  return { name: 'CRANE_CONTEXT_KEY', status: 'fail', message: 'Not set. Launch with: crane vc' }
}

function checkGitHub(): PreflightCheck {
  const ghAuth = checkGhAuth()
  if (ghAuth.authenticated) {
    const msg =
      ghAuth.method === 'token' ? 'Authenticated via GH_TOKEN' : 'Authenticated via gh auth login'
    return { name: 'GitHub CLI', status: 'pass', message: msg }
  }
  if (ghAuth.installed) {
    return {
      name: 'GitHub CLI',
      status: 'fail',
      message: 'Not authenticated. Set GH_TOKEN or run: gh auth login',
    }
  }
  return { name: 'GitHub CLI', status: 'fail', message: 'Not installed. Run: brew install gh' }
}

function checkGitRepo(): PreflightCheck {
  const repoInfo = getCurrentRepoInfo()
  if (repoInfo) {
    return {
      name: 'Git repository',
      status: 'pass',
      message: `${repoInfo.org}/${repoInfo.repo} (${repoInfo.branch})`,
    }
  }
  return { name: 'Git repository', status: 'warn', message: 'Not in a git repository' }
}

async function checkApiCheck(): Promise<PreflightCheck> {
  const apiReachable = await checkApiConnectivity()
  const envName = getEnvironmentName()
  if (apiReachable) {
    return { name: 'Crane Context API', status: 'pass', message: `Connected (${envName})` }
  }
  return {
    name: 'Crane Context API',
    status: 'fail',
    message: `Cannot reach ${envName} API. Check network connection.`,
  }
}

function buildPreflightMessage(
  checks: PreflightCheck[],
  hasCriticalFailure: boolean,
  allPassed: boolean
): string {
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
  return message
}

export async function executePreflight(_input: PreflightInput): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [
    checkContextKey(),
    checkGitHub(),
    checkGitRepo(),
    await checkApiCheck(),
  ]

  const CRITICAL_CHECK_NAMES = ['CRANE_CONTEXT_KEY', 'Crane Context API']
  const criticalFailures = checks.filter(
    (c) => c.status === 'fail' && CRITICAL_CHECK_NAMES.includes(c.name)
  )
  const allPassed = checks.every((c) => c.status !== 'fail')
  const hasCriticalFailure = criticalFailures.length > 0

  const message = buildPreflightMessage(checks, hasCriticalFailure, allPassed)

  return {
    all_passed: allPassed,
    has_critical_failure: hasCriticalFailure,
    checks,
    message,
  }
}
