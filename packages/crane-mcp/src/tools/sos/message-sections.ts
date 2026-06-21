/**
 * Individual section renderers for the SOS message builder.
 * Each function renders one logical section and returns a string.
 */

import {
  type Venture,
  type ActiveSession,
  type Notification,
  type NotificationCountsResponse,
  type HandoffRecord,
} from '../../lib/crane-api.js'

// Re-export from sibling modules so message-builder has a single import point
export {
  renderCadenceBlock,
  renderMemoryBlock,
  renderEnterpriseContextBlock,
  renderDocAuditBlock,
  renderHealthChecksBlock,
} from './content-sections.js'
export { renderFleetHealthBlock } from './fleet-health.js'

import { truncate, formatTruthfulCount, type Truncated } from '../../lib/truthful-display.js'
import { type RepoSyncStatus, type NodeModulesDrift } from '../../lib/repo-scanner.js'
import { formatRepoSync, formatDepsDrift, extractHandoffOneLiner } from './format-helpers.js'

export function renderSessionBlock(params: {
  venture: Venture
  fullRepo: string
  branch: string
  sessionId: string
  repoSyncStatus?: RepoSyncStatus | null
  nodeModulesDrift?: NodeModulesDrift | null
  verifyCount?: number
}): string {
  const { venture, fullRepo, branch, sessionId, repoSyncStatus, nodeModulesDrift, verifyCount } =
    params
  let out = `## Session\n\n`
  out += `| Field | Value |\n|-------|-------|\n`
  out += `| Venture | ${venture.name} (${venture.code}) |\n`
  out += `| Repo | ${fullRepo} |\n`
  out += `| Branch | ${branch} |\n`
  out += `| Sync | ${formatRepoSync(repoSyncStatus)} |\n`
  out += `| Deps | ${formatDepsDrift(nodeModulesDrift)} |\n`
  out += `| Session | ${sessionId} |\n`
  if (typeof verifyCount === 'number') {
    out += `| Verifications | ${verifyCount} recorded this session |\n`
  }
  return out + '\n'
}

export function renderDirectivesBlock(fullRepo: string): string {
  let out = `## Directives\n\n`
  out += `**Operating ethos:** You are one of a wild band of AI agents with an ape commander - not a corporate employee. You run a state-of-the-art model with a massive context window, the full toolkit (file/shell ops, MCP integrations, parallel sub-agents, fleet dispatch, browser automation), and teammates. Powerful individually, unstoppable together. Parallelize, hold whole systems in context, verify end-to-end. Confidence, not anxiety - no timidity, no cow-towing. Mission first. Execute. If unclear, ask plainly. Otherwise, move out. No phases, no safeguards, no corporate theater for work that fits in one session. The rules below protect the mission, not slow it down. Full ethos: \`crane_doc('global', 'operating-ethos.md')\`. Toolkit: \`crane_doc('global', 'tooling.md')\`.\n\n`
  out += `- All changes through PRs. Never push directly to main.\n`
  out += `- All GitHub issues this session target **${fullRepo}**. Targeting a different repo? STOP.\n`
  out += `- Never remove, deprecate, or disable features without Captain directive.\n`
  out += `- Run \`npm run verify\` before pushing. Fix root causes, not symptoms.\n`
  out += `- **Done means wired**, not merged or deployed: every seam your change introduces or relies on must be observed working on the real runtime, with a \`crane_verify\` record naming the seam and output showing it carried data. Unverifiable seams → \`status:blocked\`, never a silent stub. Definition of Done: \`crane_doc('global', 'team-workflow.md')\`.\n`
  out += `- Scope discipline: finish current task, file new issues for discovered work.\n`
  out += `- Never switch repos or ventures without explicit Captain approval. Announce all context switches.\n`
  out += `- Before editing against any third-party API/SDK/CLI (GitHub, Vercel, Cloudflare, npm, etc.), consult Context7 (\`mcp__plugin_context7_context7__*\`) — training data is frozen; don't guess at vendor syntax. Full tooling catalog: \`crane_doc('global', 'tooling.md')\`.\n`
  // Inlined from guardrails.md SOD markers (avoids HTTP fetch per session)
  out += `- Never drop database columns/tables or run destructive migrations without Captain directive.\n`
  out += `- Never modify authentication flows or remove access controls without Captain directive.\n`
  out += `- "Unused" is not sufficient justification - external consumers may depend on it.\n`
  out += `- When in doubt, STOP and escalate.\n`
  out += `\nFull guardrails: \`crane_doc('global', 'guardrails.md')\`\n\n`
  return out
}

function renderActiveHandoffs(
  activeHandoffs: HandoffRecord[],
  ventureCode: string,
  resumeBudget: number
): string {
  let out = ''
  if (activeHandoffs.length === 0) return out

  const primary = activeHandoffs[0]
  const time = new Date(primary.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  out += `### Resume: ${primary.status_label}\n\n`
  out += `From ${primary.from_agent} at ${time}:\n\n`
  if (primary.summary.length <= resumeBudget) {
    out += `${primary.summary}\n\n`
  } else {
    out += `${primary.summary.slice(0, resumeBudget)}\n\n`
    out += `*[Truncated — run \`crane_sos(venture: "${ventureCode}")\` again or check the handoff summary above for full details]*\n\n`
  }

  for (const h of activeHandoffs.slice(1)) {
    const t = new Date(h.created_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const issueRef = h.issue_number ? ` on issue #${h.issue_number}` : ''
    out += `Also ${h.status_label}: ${h.from_agent} at ${t}${issueRef}\n`
  }
  if (activeHandoffs.length > 1) out += '\n'
  return out
}

function renderOtherHandoffs(
  otherHandoffs: HandoffRecord[],
  recentHandoffsTruncated: Truncated<HandoffRecord>,
  activeHandoffs: HandoffRecord[],
  ventureCode: string
): string {
  const MAX_OTHER_HANDOFFS = 3
  let out = ''
  if (otherHandoffs.length === 0) return out

  if (activeHandoffs.length > 0) {
    out += `Other recent handoffs:\n`
  } else {
    const handoffsForHeader = truncate(
      recentHandoffsTruncated.shown as HandoffRecord[],
      recentHandoffsTruncated.total
    )
    out += `${formatTruthfulCount(handoffsForHeader, 'recent handoff(s)', { hint: `run \`crane_sos(venture: "${ventureCode}")\` for full briefing` })}:\n`
  }

  const shown = otherHandoffs.slice(0, MAX_OTHER_HANDOFFS)
  for (const h of shown) {
    const time = new Date(h.created_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const summary = extractHandoffOneLiner(h.summary, 200)
    out += `- **${time}** ${h.from_agent} [${h.status_label}]: ${summary}\n`
  }
  if (otherHandoffs.length > MAX_OTHER_HANDOFFS) {
    out += `- _${otherHandoffs.length - MAX_OTHER_HANDOFFS} more in slice — run \`crane_sos(venture: "${ventureCode}")\` for full briefing_\n`
  }
  out += '\n'
  return out
}

export function renderContinuityBlock(params: {
  recentHandoffsTruncated: Truncated<HandoffRecord>
  lastHandoff?: { summary: string; from_agent: string; created_at: string; status_label: string }
  ventureCode: string
}): string {
  const { recentHandoffsTruncated, lastHandoff, ventureCode } = params
  const recentHandoffs = recentHandoffsTruncated.shown as HandoffRecord[]
  const RESUME_BUDGET = 1024

  let out = `## Continuity\n\n`

  if (recentHandoffs.length > 0) {
    const allActiveHandoffs = recentHandoffs.filter(
      (h) => h.status_label === 'in_progress' || h.status_label === 'blocked'
    )
    const otherHandoffs = recentHandoffs.filter(
      (h) => h.status_label !== 'in_progress' && h.status_label !== 'blocked'
    )
    const newestCompleted = otherHandoffs.length > 0 ? otherHandoffs[0] : null
    const activeHandoffs = newestCompleted
      ? allActiveHandoffs.filter((h) => h.created_at > newestCompleted.created_at)
      : allActiveHandoffs

    out += renderActiveHandoffs(activeHandoffs, ventureCode, RESUME_BUDGET)
    out += renderOtherHandoffs(otherHandoffs, recentHandoffsTruncated, activeHandoffs, ventureCode)

    if (otherHandoffs.length === 0 && activeHandoffs.length === 0) {
      out += `No recent handoffs.\n\n`
    }
  } else if (lastHandoff) {
    out += renderLastHandoffFallback(lastHandoff, ventureCode, RESUME_BUDGET)
  } else {
    out += `No recent handoffs.\n\n`
  }

  return out
}

function renderLastHandoffFallback(
  lastHandoff: { summary: string; from_agent: string; status_label: string },
  ventureCode: string,
  resumeBudget: number
): string {
  let out = ''
  if (lastHandoff.status_label === 'in_progress' || lastHandoff.status_label === 'blocked') {
    out += `### Resume: ${lastHandoff.status_label}\n\n`
    out += `From ${lastHandoff.from_agent}:\n\n`
    if (lastHandoff.summary.length <= resumeBudget) {
      out += `${lastHandoff.summary}\n\n`
    } else {
      out += `${lastHandoff.summary.slice(0, resumeBudget)}\n\n`
      out += `*[Truncated — run \`crane_sos(venture: "${ventureCode}")\` again for full briefing]*\n\n`
    }
  } else {
    const summary = extractHandoffOneLiner(lastHandoff.summary, 200)
    out += `Last handoff from ${lastHandoff.from_agent} [${lastHandoff.status_label}]: ${summary}\n\n`
  }
  return out
}

export function renderAlertsBlock(params: {
  p0Issues: Array<{ number: number; title: string }>
  ciAlertsTruncated?: Truncated<Notification>
  ciCounts?: NotificationCountsResponse | null
  activeSessions: ActiveSession[]
  ventureCode: string
}): string {
  const { p0Issues, ciAlertsTruncated, ciCounts, activeSessions, ventureCode } = params
  const ciAlertsArr = (ciAlertsTruncated?.shown as Notification[] | undefined) ?? []
  const hasCiAlerts = ciAlertsArr.length > 0 || (ciCounts != null && ciCounts.total > 0)
  const hasAlerts = p0Issues.length > 0 || hasCiAlerts || activeSessions.length > 0

  if (!hasAlerts) return ''

  let out = `## Alerts\n\n`
  if (p0Issues.length > 0) {
    out += `**P0 Issues (Drop Everything)**\n`
    for (const issue of p0Issues) {
      out += `- #${issue.number}: ${issue.title}\n`
    }
    out += '\n'
  }

  if (hasCiAlerts && ciAlertsTruncated) {
    out += renderCiAlerts({ ciAlertsTruncated, ciCounts, ventureCode })
  }

  if (activeSessions.length > 0) {
    out += renderActiveSessionsBlock(activeSessions)
  }

  return out
}

function renderCiAlerts(params: {
  ciAlertsTruncated: Truncated<Notification>
  ciCounts?: NotificationCountsResponse | null
  ventureCode: string
}): string {
  const { ciAlertsTruncated, ciCounts, ventureCode } = params
  const ciAlertsArr = ciAlertsTruncated.shown as Notification[]
  const critical = ciAlertsArr.filter((n) => n.severity === 'critical')
  const warnings = ciAlertsArr.filter((n) => n.severity === 'warning')
  const isCaptainSeat = ventureCode === 'vc'

  let out = ''
  if (ciCounts) {
    out += renderCiCountsHeader(
      ciCounts,
      isCaptainSeat,
      ventureCode,
      critical.length + warnings.length
    )
  } else {
    out += `**${formatTruthfulCount(ciAlertsTruncated, 'CI/CD Alerts unresolved', { hint: `run \`crane_notifications()\`` })}**\n`
  }

  const rowPrefix = (n: Notification): string =>
    isCaptainSeat && n.venture && n.venture !== ventureCode ? `[${n.venture}] ` : ''

  for (const n of critical) {
    out += `- CRIT: ${rowPrefix(n)}${n.summary}\n`
  }
  for (const n of warnings) {
    out += `- WARN: ${rowPrefix(n)}${n.summary}\n`
  }

  const trueCritWarn = ciAlertsTruncated.total
  const shownCount = critical.length + warnings.length
  if (trueCritWarn > shownCount) {
    out += `- _+${trueCritWarn - shownCount} more critical/warning — run \`crane_notifications()\`_\n`
  }

  out += `\nDetails: \`crane_notifications()\`\n\n`
  return out
}

function renderCiCountsHeader(
  ciCounts: NotificationCountsResponse,
  isCaptainSeat: boolean,
  ventureCode: string,
  shownCritWarnCount: number
): string {
  const breakdown: string[] = []
  if (ciCounts.by_severity.critical > 0) breakdown.push(`${ciCounts.by_severity.critical} critical`)
  if (ciCounts.by_severity.warning > 0) breakdown.push(`${ciCounts.by_severity.warning} warning`)
  if (ciCounts.by_severity.info > 0) breakdown.push(`${ciCounts.by_severity.info} info`)
  const breakdownStr = breakdown.length > 0 ? ` (${breakdown.join(', ')})` : ''
  const scopeStr = isCaptainSeat ? ' total' : ` in ${ventureCode}`

  let out = `**CI/CD Alerts** — ${ciCounts.total} unresolved${scopeStr}${breakdownStr}\n`

  if (isCaptainSeat && ciCounts.by_venture) {
    const venturesByCount = Object.entries(ciCounts.by_venture)
      .filter(([, v]) => v.total > 0)
      .sort(([, a], [, b]) => b.total - a.total)
    if (venturesByCount.length > 0) {
      const parts = venturesByCount.map(([code, v]) => `${code} ${v.total}`)
      out += `By venture (unresolved): ${parts.join(', ')}\n`
    }
  }

  if (shownCritWarnCount > 0) {
    out += `Showing ${shownCritWarnCount} most recent critical/warning:\n`
  }
  return out
}

function renderActiveSessionsBlock(activeSessions: ActiveSession[]): string {
  const MAX_SESSIONS = 5
  const sessionsTruncated = truncate(activeSessions.slice(0, MAX_SESSIONS), activeSessions.length)
  let out = `**Other Active Sessions** — ${formatTruthfulCount(sessionsTruncated, 'session(s)')}\n`
  for (const s of sessionsTruncated.shown as ActiveSession[]) {
    out += `- ${s.agent} on ${s.repo}`
    if (s.issue_number) {
      out += ` (Issue #${s.issue_number})`
    }
    out += '\n'
  }
  return out + '\n'
}
