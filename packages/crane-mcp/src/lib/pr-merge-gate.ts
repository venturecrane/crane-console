/**
 * pr-merge-gate.ts - EOS-time PR merge gate (Layer 4b of the EOS surface verification gate).
 *
 * Catches the failure mode captured in `feedback_finish_means_merged.md`:
 * agents declare a session "done" while their PR is still open with red CI,
 * leaving the next session to discover the broken state.
 *
 * Best-effort by design. If `gh` is missing, the GitHub query fails, or the
 * branch can't be determined, the gate returns `should_block: false` so we
 * never block a handoff because of gate-infrastructure failure.
 */

import { execSync } from 'node:child_process'

export interface OpenPrSummary {
  number: number
  title: string
  state: string
  head_ref: string
  url: string
  mergeable: string
  /** Names of required checks that have completed in FAILURE / ERROR / CANCELLED state. */
  failed_checks: string[]
  /** Names of checks still pending or in progress. */
  pending_checks: string[]
  updated_at: string
}

export interface PrMergeGateResult {
  branch: string | null
  open_prs: OpenPrSummary[]
  blocking_pr_numbers: number[]
  should_block: boolean
  reason: string
}

interface GhPrListItem {
  number: number
  title: string
  state: string
  headRefName: string
  url: string
  mergeable?: string
  updatedAt: string
  statusCheckRollup?: Array<{
    name: string
    conclusion?: string | null
    status?: string | null
  }>
}

const FAIL_CONCLUSIONS = new Set([
  'FAILURE',
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
])

const PENDING_STATUSES = new Set(['QUEUED', 'IN_PROGRESS', 'PENDING'])

function safeExec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function getCurrentBranch(): string | null {
  const out = safeExec('git branch --show-current 2>/dev/null')
  return out && out !== 'HEAD' ? out : null
}

function classifyChecks(rollup: GhPrListItem['statusCheckRollup']): {
  failed: string[]
  pending: string[]
} {
  const failed: string[] = []
  const pending: string[] = []
  for (const c of rollup ?? []) {
    if (c.conclusion && FAIL_CONCLUSIONS.has(c.conclusion.toUpperCase())) {
      failed.push(c.name)
    } else if (!c.conclusion && c.status && PENDING_STATUSES.has(c.status.toUpperCase())) {
      pending.push(c.name)
    }
  }
  return { failed, pending }
}

/**
 * Evaluate the PR merge gate.
 *
 * Decision tree:
 *  1. Current branch is `main` or unresolvable → not blocking (operating on main means no feature PR to verify).
 *  2. No open PR for current branch AND no recent open PRs by @me → not blocking.
 *  3. Open PR(s) found:
 *     - Any with `failed_checks` non-empty → blocking. Captain must fix CI before declaring done.
 *     - All pending or all green → not blocking, but caller may surface for visibility.
 *
 * @param recentHours  Look-back window for "recent open PRs by @me" (default 24h).
 *                     Catches PRs opened earlier in the session that the agent
 *                     might have moved away from before declaring done.
 */
export function evaluatePrMergeGate(recentHours = 24): PrMergeGateResult {
  const branch = getCurrentBranch()

  // gh CLI not installed or auth missing → best-effort skip
  const ghAvailable = safeExec('gh --version') !== null
  if (!ghAvailable) {
    return {
      branch,
      open_prs: [],
      blocking_pr_numbers: [],
      should_block: false,
      reason: '[skip] gh CLI not available; PR merge gate cannot evaluate',
    }
  }

  // Skip on main / detached HEAD — no feature PR to gate.
  if (!branch || branch === 'main' || branch === 'master') {
    return {
      branch,
      open_prs: [],
      blocking_pr_numbers: [],
      should_block: false,
      reason: '[skip] not on a feature branch',
    }
  }

  const seen = new Map<number, OpenPrSummary>()

  // 1) PRs whose head ref matches the current branch — most precise signal.
  const branchListJson = safeExec(
    `gh pr list --head ${JSON.stringify(branch)} --state open ` +
      `--json number,title,state,headRefName,url,mergeable,updatedAt,statusCheckRollup ` +
      `--limit 5 2>/dev/null`
  )
  if (branchListJson) {
    try {
      const items: GhPrListItem[] = JSON.parse(branchListJson)
      for (const it of items) {
        const { failed, pending } = classifyChecks(it.statusCheckRollup)
        seen.set(it.number, {
          number: it.number,
          title: it.title,
          state: it.state,
          head_ref: it.headRefName,
          url: it.url,
          mergeable: it.mergeable ?? 'UNKNOWN',
          failed_checks: failed,
          pending_checks: pending,
          updated_at: it.updatedAt,
        })
      }
    } catch {
      // ignore parse error — continue with the @me search below
    }
  }

  // 2) Recent open PRs by @me — catches PRs opened earlier today on different branches.
  const sinceTs = new Date(Date.now() - recentHours * 3600 * 1000).toISOString()
  const recentListJson = safeExec(
    `gh pr list --author @me --state open ` +
      `--search ${JSON.stringify(`updated:>=${sinceTs}`)} ` +
      `--json number,title,state,headRefName,url,mergeable,updatedAt,statusCheckRollup ` +
      `--limit 10 2>/dev/null`
  )
  if (recentListJson) {
    try {
      const items: GhPrListItem[] = JSON.parse(recentListJson)
      for (const it of items) {
        if (seen.has(it.number)) continue
        const { failed, pending } = classifyChecks(it.statusCheckRollup)
        seen.set(it.number, {
          number: it.number,
          title: it.title,
          state: it.state,
          head_ref: it.headRefName,
          url: it.url,
          mergeable: it.mergeable ?? 'UNKNOWN',
          failed_checks: failed,
          pending_checks: pending,
          updated_at: it.updatedAt,
        })
      }
    } catch {
      // ignore
    }
  }

  const open_prs = Array.from(seen.values())
  const blocking = open_prs.filter((p) => p.failed_checks.length > 0)
  const blocking_pr_numbers = blocking.map((p) => p.number)

  if (blocking.length > 0) {
    const lines = blocking.map(
      (p) =>
        `  - PR #${p.number} (${p.head_ref}): ${p.failed_checks.length} failed check(s) — ${p.failed_checks.slice(0, 3).join(', ')}${p.failed_checks.length > 3 ? ', …' : ''}\n    ${p.url}`
    )
    return {
      branch,
      open_prs,
      blocking_pr_numbers,
      should_block: true,
      reason:
        `[gate] Cannot declare status=done with open PRs failing CI:\n${lines.join('\n')}\n\n` +
        `Fix CI and merge, OR pass status=blocked with the external blocker named.`,
    }
  }

  return {
    branch,
    open_prs,
    blocking_pr_numbers: [],
    should_block: false,
    reason:
      open_prs.length > 0
        ? `[ok] ${open_prs.length} open PR(s) for this session, all checks green or pending`
        : '[ok] no open PRs from this session',
  }
}
