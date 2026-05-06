/**
 * crane_status tool - Full GitHub issue breakdown
 */

import { z } from 'zod'
import { getIssueBreakdown, GitHubIssue } from '../lib/github.js'
import { getCurrentRepoInfo } from '../lib/repo-scanner.js'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'

export const statusInputSchema = z.object({})

export type StatusInput = z.infer<typeof statusInputSchema>

/**
 * Format a duration in seconds as a humanized "Nh ago" / "Nd ago" string.
 * Used for the verify-audit cache-age tag in the briefing.
 */
function humanAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'never'
  if (seconds < 60) return `${Math.round(seconds)}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

/**
 * Best-effort verify-audit summary block. Reads cached snapshot via
 * /verify/audit?summary=1 (cheap; no recomputation). Returns empty string
 * on any failure so crane_status never blocks on the audit endpoint.
 */
async function fetchVerifyAuditSummary(): Promise<string> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) return ''
  try {
    const api = new CraneApi(apiKey, getApiBase())
    const audit = await api.getVerifyAudit({ summary: true })
    if (audit.cache.never_run) {
      return `### 🔬 Verify Audit\n  *No audit run yet — invoke \`/verify-audit\` to seed the first snapshot*\n\n`
    }
    const ageSeconds = audit.cache.age_seconds
    const overdue = ageSeconds > 7 * 86_400
    const ageTag = humanAge(ageSeconds)
    const totalOverrides =
      audit.override_audit.pr_merge_gate + audit.override_audit.verify_coverage_gate
    const summaryLine = `Coverage gap: ${audit.coverage_gap.length} | Unverified surface: ${audit.unverified_surface_files.length} | Overrides: ${totalOverrides} | Memory candidates: ${audit.memory_candidates.length}`
    let block = `### 🔬 Verify Audit (last run ${ageTag})\n  ${summaryLine}\n`
    if (overdue) {
      block += `  *Audit overdue (>7d) — run \`/verify-audit --fresh\` for current state*\n`
    } else if (ageSeconds > 12 * 3600) {
      block += `  *Snapshot >12h old — run \`/verify-audit --fresh\` if you need current data*\n`
    }
    return block + '\n'
  } catch {
    // Best-effort: silent fall-through on any infra failure
    return ''
  }
}

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
    message += `  *None - no fires today* ✅\n`
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
    message += `  *Review blockers - can any be unblocked?*\n`
  } else {
    message += `  *Nothing blocked* ✅\n`
  }
  message += '\n'

  // Triage
  message += `### 📋 Triage Queue (Top 5)\n`
  message += formatIssueList(breakdown.triage, '*Backlog is empty*') + '\n\n'

  // Verify-ledger audit summary (Prong 3). Cheap cached read; never blocks
  // the briefing — empty string on any failure.
  const verifyAuditBlock = await fetchVerifyAuditSummary()
  if (verifyAuditBlock) {
    message += verifyAuditBlock
  }

  return {
    success: true,
    repo: fullRepo,
    issues: breakdown,
    message,
  }
}
