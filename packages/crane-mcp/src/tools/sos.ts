/**
 * crane_sos tool - Start of Session / Session initialization
 * Enhanced to include P0 issues, weekly plan status, and active sessions
 */

import { z } from 'zod'
import { homedir, hostname } from 'node:os'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import {
  CraneApi,
  Venture,
  ActiveSession,
  DocAuditResult,
  VentureDoc,
  HandoffRecord,
  ScheduleBriefingItem,
  Notification,
} from '../lib/crane-api.js'
import { setSession } from '../lib/session-state.js'
import { getApiBase } from '../lib/config.js'
import {
  getCurrentRepoInfo,
  findVentureByRepo,
  findRepoForVenture,
  scanLocalRepos,
} from '../lib/repo-scanner.js'
import { getP0Issues, GitHubIssue } from '../lib/github.js'
import { generateDoc } from '../lib/doc-generator.js'

export const sosInputSchema = z.object({
  venture: z.string().optional().describe('Venture code to work on (skips selection if provided)'),
  mode: z
    .enum(['full', 'fleet'])
    .optional()
    .describe('SOS mode: full (default) or fleet (minimal for fleet agents)'),
})

export type SosInput = z.infer<typeof sosInputSchema>

export interface WeeklyPlanStatus {
  status: 'valid' | 'stale' | 'missing'
  priority_venture?: string
  age_days?: number
}

export interface SosResult {
  status: 'valid' | 'needs_navigation' | 'needs_clone' | 'select_venture' | 'error'
  current_dir: string
  context?: {
    venture: string
    venture_name: string
    repo: string
    branch: string
    session_id: string
  }
  last_handoff?: {
    summary: string
    from_agent: string
    status: string
    created_at: string
  }
  recent_handoffs?: HandoffRecord[]
  p0_issues: GitHubIssue[]
  weekly_plan: WeeklyPlanStatus
  schedule_briefing?: ScheduleBriefingItem[]
  active_sessions: ActiveSession[]
  documentation?: VentureDoc[]
  // Legacy fields for backwards compatibility
  detected_venture?: string
  detected_repo?: string
  target_venture?: string
  target_path?: string
  clone_command?: string
  nav_command?: string
  session_id?: string
  ventures?: Array<{ code: string; name: string; installed: boolean }>
  message: string
}

function getApiKey(): string | null {
  if (process.env.CRANE_CONTEXT_KEY) {
    return process.env.CRANE_CONTEXT_KEY
  }
  return null
}

function getAgentName(): string {
  const host = process.env.HOSTNAME || hostname() || 'unknown'
  return `crane-mcp-${host}`
}

function getWeeklyPlanStatus(): WeeklyPlanStatus {
  const cwd = process.cwd()
  const planPath = join(cwd, 'docs', 'planning', 'WEEKLY_PLAN.md')

  if (!existsSync(planPath)) {
    return { status: 'missing' }
  }

  try {
    const stat = statSync(planPath)
    const mtime = stat.mtime.getTime()
    const now = Date.now()
    const ageDays = Math.floor((now - mtime) / (1000 * 60 * 60 * 24))
    const isStale = ageDays >= 7

    // Try to extract priority venture from file
    let priorityVenture: string | undefined
    try {
      const { readFileSync } = require('fs')
      const content = readFileSync(planPath, 'utf-8')
      const match = content.match(/## Priority Venture\s*\n+([^\n#]+)/i)
      if (match) {
        priorityVenture = match[1].trim()
      }
    } catch {
      // Ignore read errors
    }

    return {
      status: isStale ? 'stale' : 'valid',
      priority_venture: priorityVenture,
      age_days: ageDays,
    }
  } catch {
    return { status: 'missing' }
  }
}

export async function executeSos(input: SosInput): Promise<SosResult> {
  const cwd = process.cwd()
  const defaultResult: Partial<SosResult> = {
    current_dir: cwd,
    p0_issues: [],
    weekly_plan: { status: 'missing' },
    active_sessions: [],
    documentation: undefined,
  }

  // Check for API key
  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      ...defaultResult,
      status: 'error',
      message: 'CRANE_CONTEXT_KEY not found.\n\n' + 'Launch with: crane vc',
    } as SosResult
  }

  const api = new CraneApi(apiKey, getApiBase())

  // Fetch ventures
  let ventures: Venture[]
  try {
    ventures = await api.getVentures()
  } catch (error) {
    return {
      ...defaultResult,
      status: 'error',
      message: 'Failed to connect to Crane API. Check your network connection.',
    } as SosResult
  }

  // Check current directory
  const currentRepo = getCurrentRepoInfo()

  if (currentRepo) {
    // We're in a git repo - check if it's a known venture
    const venture = findVentureByRepo(ventures, currentRepo.org, currentRepo.repo)

    if (venture) {
      // Valid venture repo - start session
      try {
        const fullRepo = `${currentRepo.org}/${currentRepo.repo}`
        const session = await api.startSession({
          venture: venture.code,
          repo: fullRepo,
          agent: getAgentName(),
        })

        // Store session state for handoff tool
        setSession(session.session.id, venture.code, fullRepo)

        // Query recent handoffs from D1
        let recentHandoffs: HandoffRecord[] = []
        try {
          const handoffResult = await api.queryHandoffs({
            venture: venture.code,
            repo: fullRepo,
            track: 1,
            limit: 5,
          })
          recentHandoffs = handoffResult.handoffs
        } catch {
          // Fall back to single last_handoff from SOD response
        }

        // Get P0 issues
        const p0Result = getP0Issues(currentRepo.org, currentRepo.repo)
        const p0Issues = p0Result.success ? p0Result.issues || [] : []

        // Get weekly plan status
        const weeklyPlan = getWeeklyPlanStatus()

        const isFleet = input.mode === 'fleet'

        // Get active sessions (excluding self)
        const activeSessions = (session.active_sessions || []).filter(
          (s) => s.agent !== getAgentName()
        )

        // Fleet mode: skip cadence and self-healing (not needed for fleet agents)
        const scheduleBriefing = isFleet
          ? []
          : await api
              .getScheduleBriefing(venture.code)
              .then((b) => b.items)
              .catch((): ScheduleBriefingItem[] => [])

        // Get CI/CD notifications (critical + new for this venture)
        let ciAlerts: Notification[] = []
        try {
          const notifResult = await api.listNotifications({
            status: 'new',
            venture: venture.code,
            limit: 10,
          })
          ciAlerts = notifResult.notifications.filter(
            (n) => n.severity === 'critical' || n.severity === 'warning'
          )
        } catch {
          // Graceful degradation - notifications API may not be deployed yet
        }

        const docAudit = session.doc_audit
        const healingResults = isFleet
          ? { generated: [], failed: [] }
          : await healMissingDocs(api, docAudit, venture.code, venture.name, cwd)

        // Build message
        const message = buildSosMessage({
          venture,
          fullRepo,
          branch: currentRepo.branch,
          sessionId: session.session.id,
          recentHandoffs,
          lastHandoff: session.last_handoff,
          p0Issues,
          activeSessions,
          weeklyPlan,
          scheduleBriefing,
          kbNotes: session.knowledge_base?.notes || [],
          ecNotes: session.enterprise_context?.notes || [],
          docAudit,
          healingResults,
          ciAlerts,
          mode: input.mode || 'full',
        })

        return {
          status: 'valid',
          current_dir: cwd,
          context: {
            venture: venture.code,
            venture_name: venture.name,
            repo: fullRepo,
            branch: currentRepo.branch,
            session_id: session.session.id,
          },
          last_handoff: session.last_handoff
            ? {
                summary: session.last_handoff.summary,
                from_agent: session.last_handoff.from_agent,
                status: session.last_handoff.status_label,
                created_at: session.last_handoff.created_at,
              }
            : undefined,
          p0_issues: p0Issues,
          weekly_plan: weeklyPlan,
          schedule_briefing: scheduleBriefing.length > 0 ? scheduleBriefing : undefined,
          active_sessions: activeSessions,
          recent_handoffs: recentHandoffs.length > 0 ? recentHandoffs : undefined,
          documentation: undefined,
          // Legacy fields
          detected_venture: venture.code,
          detected_repo: fullRepo,
          session_id: session.session.id,
          message,
        }
      } catch (error) {
        return {
          ...defaultResult,
          status: 'error',
          detected_venture: venture.code,
          message: 'Failed to start session. Check API connectivity.',
        } as SosResult
      }
    }
  }

  // Not in a valid venture repo
  // If venture code was provided, guide to that venture
  if (input.venture) {
    const targetVenture = ventures.find((v) => v.code === input.venture)

    if (!targetVenture) {
      return {
        ...defaultResult,
        status: 'error',
        message:
          `Unknown venture: ${input.venture}\n\n` +
          `Available: ${ventures.map((v) => v.code).join(', ')}`,
      } as SosResult
    }

    // Check if we have this venture's repo locally
    const localRepo = findRepoForVenture(targetVenture)

    if (localRepo) {
      return {
        ...defaultResult,
        status: 'needs_navigation',
        target_venture: targetVenture.code,
        target_path: localRepo.path,
        nav_command: `cd ${localRepo.path} && claude`,
        message:
          `To work on ${targetVenture.name}:\n\n` +
          `  cd ${localRepo.path} && claude\n\n` +
          `Then run crane_sos again.`,
      } as SosResult
    } else {
      // Need to clone
      const suggestedPath = `${homedir()}/dev/${targetVenture.code}-console`
      const cloneUrl = `git@github.com:${targetVenture.org}/${targetVenture.code}-console.git`

      return {
        ...defaultResult,
        status: 'needs_clone',
        target_venture: targetVenture.code,
        target_path: suggestedPath,
        clone_command: `git clone ${cloneUrl} ${suggestedPath}`,
        nav_command: `cd ${suggestedPath} && claude`,
        message:
          `Repo for ${targetVenture.name} not found locally.\n\n` +
          `Clone it (adjust repo name if needed):\n` +
          `  git clone ${cloneUrl} ${suggestedPath}\n\n` +
          `Then:\n` +
          `  cd ${suggestedPath} && claude`,
      } as SosResult
    }
  }

  // No venture specified - show options
  const localRepos = scanLocalRepos()
  const ventureList = ventures.map((v) => {
    const repo = localRepos.find((r) => {
      if (r.org.toLowerCase() !== v.org.toLowerCase()) return false
      return v.repos?.includes(r.repoName) ?? false
    })
    return {
      code: v.code,
      name: v.name,
      installed: !!repo,
      path: repo?.path,
    }
  })

  return {
    ...defaultResult,
    status: 'select_venture',
    ventures: ventureList.map((v) => ({
      code: v.code,
      name: v.name,
      installed: v.installed,
    })),
    message:
      `Not in a venture repo.\n\n` +
      `Current directory: ${cwd}\n` +
      (currentRepo
        ? `Git remote: ${currentRepo.org}/${currentRepo.repo} (not a known venture)\n`
        : `Not a git repository.\n`) +
      `\nAvailable ventures:\n` +
      ventureList
        .map((v) => `  ${v.code} - ${v.name} ${v.installed ? `[${v.path}]` : '[not installed]'}`)
        .join('\n') +
      `\n\nCall crane_sos with venture parameter to continue.\n` +
      `Example: crane_sos(venture: "vc")`,
  } as SosResult
}

// ============================================================================
// SOD Message Builder
// ============================================================================

interface BuildSosMessageParams {
  venture: Venture
  fullRepo: string
  branch: string
  sessionId: string
  recentHandoffs: HandoffRecord[]
  lastHandoff?: {
    summary: string
    from_agent: string
    created_at: string
    status_label: string
  }
  p0Issues: GitHubIssue[]
  activeSessions: ActiveSession[]
  weeklyPlan: WeeklyPlanStatus
  scheduleBriefing: ScheduleBriefingItem[]
  kbNotes: Array<{
    id: string
    title: string | null
    tags: string | null
    venture: string | null
    updated_at: string
  }>
  ecNotes: Array<{
    id: string
    title: string | null
    content: string
    tags: string | null
    venture: string | null
    archived: number
    created_at: string
    updated_at: string
    actor_key_id: string | null
    meta_json: string | null
  }>
  docAudit?: DocAuditResult
  healingResults: HealingResults
  ciAlerts?: Notification[]
  mode: 'full' | 'fleet'
}

export function buildSosMessage(params: BuildSosMessageParams): string {
  const {
    venture,
    fullRepo,
    branch,
    sessionId,
    recentHandoffs,
    lastHandoff,
    p0Issues,
    activeSessions,
    weeklyPlan,
    scheduleBriefing,
    kbNotes,
    ecNotes: rawEcNotes,
    docAudit,
    healingResults,
    ciAlerts,
    mode,
  } = params

  const isFleet = mode === 'fleet'

  let message = ''

  // --- Environment warnings (lightweight, no HTTP calls) ---
  if (!process.env.GH_TOKEN) {
    message += `**Warning:** GH_TOKEN not set - GitHub operations will fail\n\n`
  }

  // --- Session ---
  message += `## Session\n\n`
  message += `| Field | Value |\n|-------|-------|\n`
  message += `| Venture | ${venture.name} (${venture.code}) |\n`
  message += `| Repo | ${fullRepo} |\n`
  message += `| Branch | ${branch} |\n`
  message += `| Session | ${sessionId} |\n\n`

  // --- Directives ---
  message += `## Directives\n\n`
  message += `- All changes through PRs. Never push directly to main.\n`
  message += `- All GitHub issues this session target **${fullRepo}**. Targeting a different repo? STOP.\n`
  message += `- Never remove, deprecate, or disable features without Captain directive.\n`
  message += `- Run \`npm run verify\` before pushing. Fix root causes, not symptoms.\n`
  message += `- Scope discipline: finish current task, file new issues for discovered work.\n`
  message += `- Never switch repos or ventures without explicit Captain approval. Announce all context switches.\n`

  // Inlined from guardrails.md SOD markers (avoids HTTP fetch per session)
  message += `- Never drop database columns/tables or run destructive migrations without Captain directive.\n`
  message += `- Never modify authentication flows or remove access controls without Captain directive.\n`
  message += `- "Unused" is not sufficient justification - external consumers may depend on it.\n`
  message += `- When in doubt, STOP and escalate.\n`
  message += `\nFull guardrails: \`crane_doc('global', 'guardrails.md')\`\n\n`

  // --- Continuity (skipped in fleet mode) ---
  if (!isFleet) {
    message += `## Continuity\n\n`
    const RESUME_BUDGET = 1024
    const MAX_OTHER_HANDOFFS = 3
    if (recentHandoffs.length > 0) {
      // Separate active (in_progress/blocked) from completed handoffs
      // recentHandoffs is sorted newest-first (created_at DESC)
      const allActiveHandoffs = recentHandoffs.filter(
        (h) => h.status_label === 'in_progress' || h.status_label === 'blocked'
      )
      const otherHandoffs = recentHandoffs.filter(
        (h) => h.status_label !== 'in_progress' && h.status_label !== 'blocked'
      )

      // Filter out stale active handoffs: if a newer completed handoff exists,
      // the in_progress/blocked one was superseded by a subsequent session
      const newestCompleted = otherHandoffs.length > 0 ? otherHandoffs[0] : null
      const activeHandoffs = newestCompleted
        ? allActiveHandoffs.filter((h) => h.created_at > newestCompleted.created_at)
        : allActiveHandoffs

      // Show full summary for the most recent active handoff
      if (activeHandoffs.length > 0) {
        const primary = activeHandoffs[0]
        const time = new Date(primary.created_at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        message += `### Resume: ${primary.status_label}\n\n`
        message += `From ${primary.from_agent} at ${time}:\n\n`
        if (primary.summary.length <= RESUME_BUDGET) {
          message += `${primary.summary}\n\n`
        } else {
          message += `${primary.summary.slice(0, RESUME_BUDGET)}\n\n`
          message += `*[Truncated — run \`crane_handoffs(venture: "${venture.code}")\` for full details]*\n\n`
        }

        // One-liner callouts for additional active handoffs
        for (const h of activeHandoffs.slice(1)) {
          const t = new Date(h.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          const issueRef = h.issue_number ? ` on issue #${h.issue_number}` : ''
          message += `Also ${h.status_label}: ${h.from_agent} at ${t}${issueRef}\n`
        }
        if (activeHandoffs.length > 1) message += '\n'
      }

      // Show remaining handoffs as truncated one-liners
      if (otherHandoffs.length > 0) {
        if (activeHandoffs.length > 0) {
          message += `Other recent handoffs:\n`
        } else {
          message += `${recentHandoffs.length} recent handoff(s):\n`
        }
        const shown = otherHandoffs.slice(0, MAX_OTHER_HANDOFFS)
        for (const h of shown) {
          const time = new Date(h.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          const summary = truncateOneLine(h.summary, 120)
          message += `- **${time}** ${h.from_agent} [${h.status_label}]: ${summary}\n`
        }
        if (otherHandoffs.length > MAX_OTHER_HANDOFFS) {
          message += `- _${otherHandoffs.length - MAX_OTHER_HANDOFFS} more — run \`crane_handoffs(venture: "${venture.code}")\` for full list_\n`
        }
        message += '\n'
      } else if (activeHandoffs.length === 0) {
        message += `No recent handoffs.\n\n`
      }
    } else if (lastHandoff) {
      // Fallback: show full summary if the single lastHandoff is active
      if (lastHandoff.status_label === 'in_progress' || lastHandoff.status_label === 'blocked') {
        message += `### Resume: ${lastHandoff.status_label}\n\n`
        message += `From ${lastHandoff.from_agent}:\n\n`
        if (lastHandoff.summary.length <= RESUME_BUDGET) {
          message += `${lastHandoff.summary}\n\n`
        } else {
          message += `${lastHandoff.summary.slice(0, RESUME_BUDGET)}\n\n`
          message += `*[Truncated — run \`crane_handoffs(venture: "${venture.code}")\` for full details]*\n\n`
        }
      } else {
        const summary = truncateOneLine(lastHandoff.summary, 120)
        message += `Last handoff from ${lastHandoff.from_agent} [${lastHandoff.status_label}]: ${summary}\n\n`
      }
    } else {
      message += `No recent handoffs.\n\n`
    }
  }

  // --- Alerts (conditional: only if P0 issues, CI/CD alerts, or active sessions) ---
  const hasCiAlerts = (ciAlerts || []).length > 0
  const hasAlerts = p0Issues.length > 0 || hasCiAlerts || activeSessions.length > 0
  if (hasAlerts) {
    message += `## Alerts\n\n`

    if (p0Issues.length > 0) {
      message += `**P0 Issues (Drop Everything)**\n`
      for (const issue of p0Issues) {
        message += `- #${issue.number}: ${issue.title}\n`
      }
      message += '\n'
    }

    if (hasCiAlerts) {
      const alerts = ciAlerts!
      const critical = alerts.filter((n) => n.severity === 'critical')
      const warnings = alerts.filter((n) => n.severity === 'warning')

      message += `**CI/CD Alerts (${alerts.length} unresolved)**\n`
      for (const n of critical) {
        message += `- CRIT: ${n.summary}\n`
      }
      for (const n of warnings) {
        message += `- WARN: ${n.summary}\n`
      }
      message += `\nDetails: \`crane_notifications(venture: "${venture.code}")\`\n\n`
    }

    if (activeSessions.length > 0) {
      const MAX_SESSIONS = 5
      message += `**Other Active Sessions**\n`
      const shownSessions = activeSessions.slice(0, MAX_SESSIONS)
      for (const s of shownSessions) {
        message += `- ${s.agent} on ${s.repo}`
        if (s.issue_number) {
          message += ` (Issue #${s.issue_number})`
        }
        message += '\n'
      }
      if (activeSessions.length > MAX_SESSIONS) {
        message += `- _${activeSessions.length - MAX_SESSIONS} more active sessions_\n`
      }
      message += '\n'
    }
  }

  // --- Weekly Plan (portfolio-level, only relevant for vc) ---
  if (venture.code === 'vc') {
    message += `## Weekly Plan\n\n`
    if (weeklyPlan.status === 'valid') {
      message += `Valid (${weeklyPlan.age_days} days old)`
      if (weeklyPlan.priority_venture) {
        message += ` - Priority: ${weeklyPlan.priority_venture}`
      }
      message += '\n\n'
    } else if (weeklyPlan.status === 'stale') {
      message += `Stale (${weeklyPlan.age_days} days old) - Consider updating\n\n`
    } else {
      message += `Missing - Set priorities before starting work\n\n`
    }
  }

  // --- Cadence (skipped in fleet mode, actionable items first, max 5) ---
  if (!isFleet && scheduleBriefing.length > 0) {
    const MAX_CADENCE_ITEMS = 5

    const actionHints: Record<string, string> = {
      'portfolio-review': '/portfolio-review',
      'weekly-plan': 'Update docs/planning/WEEKLY_PLAN.md',
      'fleet-health': 'scripts/fleet-health.sh',
      'command-sync': 'scripts/sync-commands.sh --fleet',
      'code-review-vc': '/code-review',
      'code-review-ke': '/code-review',
      'code-review-dfg': '/code-review',
      'code-review-sc': '/code-review',
      'code-review-dc': '/code-review',
      'enterprise-review': '/enterprise-review',
      'dependency-freshness': 'npm audit / npm outdated',
      'secrets-rotation-review': 'docs/infra/secrets-rotation-runbook.md',
    }

    // Actionable first (overdue + due), then untracked only if room
    const sorted = [...scheduleBriefing].sort((a, b) => a.priority - b.priority)
    const actionable = sorted.filter((i) => i.status === 'overdue' || i.status === 'due')
    const untracked = sorted.filter((i) => i.status === 'untracked')

    // Show untracked only if fewer than 3 actionable items
    const toShow =
      actionable.length < 3
        ? [...actionable, ...untracked].slice(0, MAX_CADENCE_ITEMS)
        : actionable.slice(0, MAX_CADENCE_ITEMS)

    if (toShow.length === 0) {
      message += `## Cadence\n\nAll current. Full list: \`crane_schedule(action: 'list')\`\n\n`
    } else {
      message += `## Cadence\n\n`
      message += `| Priority | Item | Status | Days Ago | Action |\n`
      message += `|----------|------|--------|----------|--------|\n`

      for (const item of toShow) {
        const priority =
          item.priority === 0
            ? 'P0'
            : item.priority === 1
              ? 'HIGH'
              : item.priority === 2
                ? 'NORMAL'
                : 'LOW'
        const status = item.status.toUpperCase()
        const daysAgo = item.days_since !== null ? String(item.days_since) : 'never'
        const action = actionHints[item.name] || item.name

        message += `| ${priority} | ${item.title} | ${status} | ${daysAgo} | ${action} |\n`
      }

      const overdueCount = scheduleBriefing.filter((i) => i.status === 'overdue').length
      const dueCount = scheduleBriefing.filter((i) => i.status === 'due').length
      const remaining = scheduleBriefing.length - toShow.length

      const parts: string[] = []
      if (overdueCount > 0) parts.push(`${overdueCount} overdue`)
      if (dueCount > 0) parts.push(`${dueCount} due`)
      if (parts.length > 0) message += `\n${parts.join(', ')}`
      if (remaining > 0) message += ` | ${remaining} more: \`crane_schedule(action: 'list')\``
      message += '\n\n'
    }
  }

  // --- Knowledge Base (skipped in fleet mode, pointer only) ---
  if (!isFleet && kbNotes.length > 0) {
    message += `## Knowledge Base\n\n`
    message += `${kbNotes.length} note(s). Browse: \`crane_notes()\` | Read: \`crane_note_read(id: "<id>")\`\n\n`
  }

  // --- Enterprise Context (skipped in fleet mode, excerpt + pointer) ---
  if (!isFleet) {
    const ventureCode = venture.code
    const ecNotes = rawEcNotes
      .filter((n) => n.venture === ventureCode)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    if (ecNotes.length > 0) {
      message += `## Enterprise Context\n\n`
      const primary = ecNotes[0]
      message += `**${primary.title || '(untitled)'}**\n\n`
      message += `${primary.content.slice(0, 200)}...\n\n`
      message += `Full: \`crane_notes(tag: 'executive-summary', venture: '${ventureCode}')\`\n\n`

      if (rawEcNotes.some((n) => n.venture !== ventureCode)) {
        message += `Other ventures: \`crane_notes(tag: 'executive-summary')\`\n\n`
      }
    }
  }

  // --- Doc audit results (summary counts in fleet mode, full in interactive) ---
  if (!isFleet) {
    if (healingResults.generated.length > 0) {
      message += `### Documentation (self-healed)\n`
      for (const doc of healingResults.generated) {
        message += `- Generated: ${doc}\n`
      }
      message += '\n'
    }
    if (healingResults.failed.length > 0) {
      message += `### Missing Documentation (auto-generation failed)\n`
      for (const { doc, reason } of healingResults.failed) {
        message += `- ${doc}: ${reason}\n`
      }
      message += '\n'
    }
    if (docAudit && docAudit.stale.length > 0) {
      message += `### Stale Documentation\n`
      for (const doc of docAudit.stale) {
        message += `- ${doc.doc_name} (${doc.days_since_update} days old, threshold: ${doc.staleness_threshold_days})\n`
      }
      message += '\n'
    }
  } else if (docAudit) {
    // Fleet mode: summary counts only
    const missing = docAudit.missing?.length || 0
    const stale = docAudit.stale?.length || 0
    if (missing > 0 || stale > 0) {
      message += `Docs: ${missing} missing, ${stale} stale. Run \`crane_doc_audit()\` for details.\n\n`
    }
  }

  // --- Footer ---
  message += `---\n`
  if (!isFleet) {
    message += `Full documentation index: \`crane_doc_audit()\`\n\n`
  }
  message += `**What would you like to focus on?**`

  // SOD budget check: warn if over 8KB
  const SOS_BUDGET = 8_192
  if (message.length > SOS_BUDGET) {
    message += `\n\n*SOS truncated at ${Math.round(message.length / 1024)}KB. Run \`crane_status\` / \`crane_schedule(action: 'list')\` for full details.*`
  }

  return message
}

/** Truncate a string to the first line or maxLen chars, whichever is shorter */
function truncateOneLine(text: string, maxLen: number): string {
  const firstLine = text.split('\n')[0]
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.slice(0, maxLen - 3) + '...'
}

// ============================================================================
// Self-Healing Documentation
// ============================================================================

interface HealingResults {
  generated: string[]
  failed: Array<{ doc: string; reason: string }>
}

async function healMissingDocs(
  api: CraneApi,
  docAudit: DocAuditResult | undefined,
  ventureCode: string,
  ventureName: string,
  repoPath: string
): Promise<HealingResults> {
  const results: HealingResults = { generated: [], failed: [] }

  if (!docAudit || docAudit.status === 'complete') {
    return results
  }

  const missing = docAudit.missing || []
  for (const doc of missing) {
    if (!doc.auto_generate) {
      results.failed.push({ doc: doc.doc_name, reason: 'manual generation required' })
      continue
    }

    try {
      const generated = generateDoc(
        doc.doc_name,
        ventureCode,
        ventureName,
        doc.generation_sources,
        repoPath
      )

      if (!generated) {
        results.failed.push({ doc: doc.doc_name, reason: 'insufficient sources' })
        continue
      }

      await api.uploadDoc({
        scope: ventureCode,
        doc_name: doc.doc_name,
        content: generated.content,
        title: generated.title,
        source_repo: `${ventureCode}-console`,
        uploaded_by: 'crane-mcp-autogen',
      })

      results.generated.push(doc.doc_name)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error'
      results.failed.push({ doc: doc.doc_name, reason })
    }
  }

  // Also regenerate stale docs
  const stale = docAudit.stale || []
  for (const doc of stale) {
    if (!doc.auto_generate) continue

    try {
      const generated = generateDoc(
        doc.doc_name,
        ventureCode,
        ventureName,
        doc.generation_sources,
        repoPath
      )

      if (!generated) continue

      await api.uploadDoc({
        scope: ventureCode,
        doc_name: doc.doc_name,
        content: generated.content,
        title: generated.title,
        source_repo: `${ventureCode}-console`,
        uploaded_by: 'crane-mcp-autogen',
      })

      results.generated.push(`${doc.doc_name} (refreshed)`)
    } catch {
      // Stale doc refresh failures are non-critical, don't report
    }
  }

  return results
}
