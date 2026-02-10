/**
 * crane_status tool - Full GitHub issue breakdown
 */

import { z } from 'zod'
import { getIssueBreakdown, GitHubIssue } from '../lib/github.js'
import { getCurrentRepoInfo } from '../lib/repo-scanner.js'

export const statusInputSchema = z.object({})

export type StatusInput = z.infer<typeof statusInputSchema>

export interface StatusResult {
  success: boolean
  repo?: string
  issues?: {
    p0: GitHubIssue[]
    ready: GitHubIssue[]
    in_progress: GitHubIssue[]
    blocked: GitHubIssue[]
    triage: GitHubIssue[]
  }
  error?: string
  message: string
}

function formatIssueList(issues: GitHubIssue[], emptyMessage: string): string {
  if (issues.length === 0) {
    return `  ${emptyMessage}`
  }
  return issues.map((i) => `  - #${i.number}: ${i.title}`).join('\n')
}

export async function executeStatus(_input: StatusInput): Promise<StatusResult> {
  // Get current repo
  const repoInfo = getCurrentRepoInfo()
  if (!repoInfo) {
    return {
      success: false,
      error: 'Not in a git repository',
      message: '**Error:** Not in a git repository. Navigate to a venture repo first.',
    }
  }

  const fullRepo = `${repoInfo.org}/${repoInfo.repo}`

  // Get issue breakdown
  const result = getIssueBreakdown(repoInfo.org, repoInfo.repo)

  if (!result.success || !result.breakdown) {
    return {
      success: false,
      repo: fullRepo,
      error: result.error,
      message: `**Error:** ${result.error}`,
    }
  }

  const { breakdown } = result

  // Build message
  let message = `## Work Queue: ${fullRepo}\n\n`

  // P0 - Critical
  message += `### 🚨 P0 Issues (Drop Everything)\n`
  if (breakdown.p0.length > 0) {
    message += formatIssueList(breakdown.p0, '') + '\n'
    message += `\n**⚠️ P0 issues require immediate attention**\n`
  } else {
    message += `  *None — no fires today* ✅\n`
  }
  message += '\n'

  // Ready for development
  message += `### 📥 Ready for Development\n`
  message += formatIssueList(breakdown.ready, '*No issues in status:ready*') + '\n\n'

  // In progress
  message += `### 🔧 In Progress\n`
  message += formatIssueList(breakdown.in_progress, '*Nothing currently in progress*') + '\n\n'

  // Blocked
  message += `### 🛑 Blocked\n`
  if (breakdown.blocked.length > 0) {
    message += formatIssueList(breakdown.blocked, '') + '\n'
    message += `  *Review blockers — can any be unblocked?*\n`
  } else {
    message += `  *Nothing blocked* ✅\n`
  }
  message += '\n'

  // Triage
  message += `### 📋 Triage Queue (Top 5)\n`
  message += formatIssueList(breakdown.triage, '*Backlog is empty*') + '\n'

  return {
    success: true,
    repo: fullRepo,
    issues: breakdown,
    message,
  }
}
