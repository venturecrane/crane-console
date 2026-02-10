/**
 * GitHub API wrapper using gh CLI
 * Leverages existing gh auth on dev machines - no additional tokens needed
 */

import { execSync } from 'child_process'

export interface GitHubIssue {
  number: number
  title: string
  url: string
}

export interface GitHubApiResult {
  success: boolean
  issues?: GitHubIssue[]
  error?: string
}

/**
 * Check if gh CLI is installed and authenticated
 */
export function checkGhAuth(): { installed: boolean; authenticated: boolean; error?: string } {
  // Check if gh is installed
  try {
    execSync('which gh', { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    return { installed: false, authenticated: false, error: 'gh CLI not installed' }
  }

  // Check if authenticated
  try {
    execSync('gh auth status 2>&1', { encoding: 'utf-8', stdio: 'pipe' })
    return { installed: true, authenticated: true }
  } catch {
    return { installed: true, authenticated: false, error: 'gh CLI not authenticated' }
  }
}

/**
 * Query issues by label using gh api
 */
export function getIssuesByLabel(
  owner: string,
  repo: string,
  labels: string[],
  limit: number = 10
): GitHubApiResult {
  const authCheck = checkGhAuth()
  if (!authCheck.authenticated) {
    return { success: false, error: authCheck.error }
  }

  try {
    const labelQuery = labels.map((l) => `label:${l}`).join(' ')
    const query = `repo:${owner}/${repo} is:issue is:open ${labelQuery}`

    const result = execSync(
      `gh api -X GET /search/issues -f q='${query}' -f per_page=${limit} --jq '.items | map({number, title, url: .html_url})'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    )

    const issues: GitHubIssue[] = JSON.parse(result || '[]')
    return { success: true, issues }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `GitHub API error: ${message}` }
  }
}

/**
 * Get P0 issues (drop everything priority)
 */
export function getP0Issues(owner: string, repo: string): GitHubApiResult {
  return getIssuesByLabel(owner, repo, ['prio:P0'])
}

/**
 * Get issues by status label
 */
export function getIssuesByStatus(
  owner: string,
  repo: string,
  status: 'ready' | 'in-progress' | 'blocked' | 'triage',
  limit: number = 10
): GitHubApiResult {
  return getIssuesByLabel(owner, repo, [`status:${status}`], limit)
}

/**
 * Get full issue breakdown for status display
 */
export interface IssueBreakdown {
  p0: GitHubIssue[]
  ready: GitHubIssue[]
  in_progress: GitHubIssue[]
  blocked: GitHubIssue[]
  triage: GitHubIssue[]
}

export function getIssueBreakdown(
  owner: string,
  repo: string
): { success: boolean; breakdown?: IssueBreakdown; error?: string } {
  const authCheck = checkGhAuth()
  if (!authCheck.authenticated) {
    return { success: false, error: authCheck.error }
  }

  const p0 = getIssuesByLabel(owner, repo, ['prio:P0'])
  const ready = getIssuesByLabel(owner, repo, ['status:ready'])
  const inProgress = getIssuesByLabel(owner, repo, ['status:in-progress'])
  const blocked = getIssuesByLabel(owner, repo, ['status:blocked'])
  const triage = getIssuesByLabel(owner, repo, ['status:triage'], 5)

  // Check for errors
  const results = [p0, ready, inProgress, blocked, triage]
  const firstError = results.find((r) => !r.success)
  if (firstError) {
    return { success: false, error: firstError.error }
  }

  return {
    success: true,
    breakdown: {
      p0: p0.issues || [],
      ready: ready.issues || [],
      in_progress: inProgress.issues || [],
      blocked: blocked.issues || [],
      triage: triage.issues || [],
    },
  }
}
