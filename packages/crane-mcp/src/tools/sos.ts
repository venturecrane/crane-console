/**
 * crane_sos tool - Start of Session / Session initialization
 * Enhanced to include P0 issues, cadence briefing, and active sessions
 */

import { z } from 'zod'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { getAgentId } from '../lib/agent-identity.js'
import { ApiError } from '../lib/api-error.js'
import {
  CraneApi,
  Venture,
  ActiveSession,
  DocAuditResult,
  VentureDoc,
  HandoffRecord,
  ScheduleBriefingItem,
  ScheduleBriefingResponse,
  Notification,
  NotificationCountsResponse,
  FleetHealthFinding,
  FleetHealthSummary,
} from '../lib/crane-api.js'
import {
  truncate,
  exact,
  unknownTotal,
  formatTruthfulCount,
  type Truncated,
} from '../lib/truthful-display.js'
import {
  STANDARD_CHECKS,
  runHealthChecks,
  formatHealthCheckSection,
  type HealthCheckResult,
} from '../lib/health-checks.js'
import { setSession } from '../lib/session-state.js'
import { getApiBase } from '../lib/config.js'
import {
  getCurrentRepoInfo,
  getRepoSyncStatus,
  getNodeModulesDrift,
  findVentureByRepo,
  findRepoForVenture,
  scanLocalRepos,
  type RepoSyncStatus,
  type NodeModulesDrift,
} from '../lib/repo-scanner.js'
import { getP0Issues, GitHubIssue } from '../lib/github.js'
import { generateDoc } from '../lib/doc-generator.js'
import {
  validateAndBuildRecord,
  fetchAllMemories,
  scoreMemory,
  severityWeight,
  type MemoryRecord,
  type MemorySeverity,
} from './memory.js'

export const sosInputSchema = z.object({
  venture: z.string().optional().describe('Venture code to work on (skips selection if provided)'),
  mode: z
    .enum(['full', 'fleet'])
    .optional()
    .describe('SOS mode: full (default) or fleet (minimal for fleet agents)'),
})

export type SosInput = z.infer<typeof sosInputSchema>

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
  schedule_briefing?: ScheduleBriefingItem[]
  active_sessions: ActiveSession[]
  documentation?: VentureDoc[]
  // Navigation/selection fields (non-valid cases only)
  target_venture?: string
  target_path?: string
  clone_command?: string
  nav_command?: string
  ventures?: Array<{ code: string; name: string; installed: boolean }>
  message: string
}

// Fire-and-forget surfaced telemetry for injected memories. Sampling (1/10)
// is handled inside recordMemoryInvocation. Best-effort — never blocks SOS.
async function recordMemorySurfaced(records: MemoryRecord[]): Promise<void> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) return
  const { CraneApi } = await import('../lib/crane-api.js')
  const { getApiBase } = await import('../lib/config.js')
  const api = new CraneApi(apiKey, getApiBase())
  for (const r of records) {
    if (Math.random() >= 0.1) continue // 1/10 sampling
    try {
      await api.recordMemoryInvocation({
        memory_id: r.id,
        event: 'surfaced',
        venture: process.env.CRANE_VENTURE_CODE,
        repo: process.env.CRANE_REPO,
      })
    } catch {
      // best-effort
    }
  }
}

function getApiKey(): string | null {
  if (process.env.CRANE_CONTEXT_KEY) {
    return process.env.CRANE_CONTEXT_KEY
  }
  return null
}

// Agent-name construction moved to ../lib/agent-identity.ts so the client
// and server import from a single source of truth (@venturecrane/crane-contracts).
// Any hostname goes through buildAgentName() which sanitizes + collision-resists.

function formatNetworkError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    const causeMsg = cause instanceof Error ? ` (cause: ${cause.message})` : ''
    return `Network error: ${error.message}${causeMsg}. Check your network connection and CRANE_CONTEXT_KEY.`
  }
  return `Unknown error: ${String(error)}. Check your network connection and CRANE_CONTEXT_KEY.`
}

/**
 * Calendar-day diff in the operator's canonical timezone (America/Phoenix).
 * Plan §B.2 T6 / §B.5 — defect #11. Replaces the previous elapsed-ms diff
 * which would say "0 days old" for a file modified 6 hours ago. Returns
 * the integer number of full calendar days between two instants in MST,
 * never below 0.
 *
 * Two timestamps separated by < 24h elapsed but spanning midnight in MST
 * count as 1 day. Two timestamps in the same MST day count as 0.
 */
const SOS_DISPLAY_TIMEZONE = 'America/Phoenix'

export function calendarDaysSince(from: Date, to: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SOS_DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const fromKey = fmt.format(from) // "2026-04-07"
  const toKey = fmt.format(to)
  // Reinterpret the date strings as UTC midnights so the integer math
  // is consistent regardless of DST or local timezone of the runner.
  const fromUtc = Date.parse(`${fromKey}T00:00:00Z`)
  const toUtc = Date.parse(`${toKey}T00:00:00Z`)
  const diff = Math.floor((toUtc - fromUtc) / 86_400_000)
  return Math.max(0, diff)
}

/**
 * Render an age in human-friendly form. For sub-1-day ages we say
 * "today" instead of "0 days" — the previous behavior trained operators
 * to ignore counts that read "0 days old" because it looked like a bug.
 */
export function formatAgeDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day old'
  return `${days} days old`
}

/**
 * Render the Session-block Sync line.
 *
 * Format examples:
 *   "current · fetched 3m ago"           clean, up to date, recent fetch
 *   "+5 behind · fetched 2h ago"         clean but stale
 *   "⚠ 27 dirty, 235 behind · fetched 9d ago"   stale checkout + WIP
 *   "unknown"                            not a git repo / no upstream
 */
function formatRepoSync(status: RepoSyncStatus | null | undefined): string {
  if (!status) return 'unknown'

  const parts: string[] = []
  if (status.dirty > 0 && status.behind > 0) {
    parts.push(`⚠ ${status.dirty} dirty, ${status.behind} behind`)
  } else if (status.behind > 0) {
    parts.push(`+${status.behind} behind`)
  } else if (status.ahead > 0) {
    parts.push(`${status.ahead} ahead`)
  } else if (status.dirty > 0) {
    parts.push(`${status.dirty} dirty`)
  } else {
    parts.push('current')
  }

  if (status.lastFetchSecondsAgo !== null) {
    parts.push(`fetched ${formatElapsed(status.lastFetchSecondsAgo)}`)
  } else {
    parts.push('never fetched')
  }

  return parts.join(' · ')
}

/**
 * Render the Session-block Deps line.
 *
 * Format examples:
 *   "current"                   node_modules matches lockfile
 *   "⚠ missing (run npm ci)"    lockfile present but node_modules empty
 *   "⚠ stale by 2h (lockfile newer than install)"  install drift
 *   "—"                         not a node project or no lockfile
 */
function formatDepsDrift(drift: NodeModulesDrift | null | undefined): string {
  if (!drift) return '—'
  switch (drift.state) {
    case 'current':
      return 'current'
    case 'missing':
      return '⚠ missing (run `npm ci`)'
    case 'stale':
      return drift.staleBySeconds !== null
        ? `⚠ stale by ${formatElapsed(drift.staleBySeconds).replace(/ ago$/, '')} (lockfile newer than install)`
        : '⚠ stale (lockfile newer than install)'
    case 'absent':
    case 'unknown':
    default:
      return '—'
  }
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export async function executeSos(input: SosInput): Promise<SosResult> {
  const cwd = process.cwd()
  const defaultResult: Partial<SosResult> = {
    current_dir: cwd,
    p0_issues: [],
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
    const detail = error instanceof ApiError ? error.toToolMessage() : formatNetworkError(error)
    return {
      ...defaultResult,
      status: 'error',
      message: `Failed to fetch ventures from Crane API.\n${detail}`,
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
          agent: getAgentId(),
        })

        // Store session state for handoff tool
        setSession(session.session.id, venture.code, fullRepo)

        // Query recent handoffs from D1. The display layer needs the TRUE
        // total of handoffs matching the filter (not just `recentHandoffs.length`)
        // so it can render "showing 5 of 12". Plan §B.2/B.4 — defect #2.
        const HANDOFF_DISPLAY_LIMIT = 5
        let recentHandoffsTruncated: Truncated<HandoffRecord> = exact<HandoffRecord>([])
        try {
          const handoffResult = await api.queryHandoffs({
            venture: venture.code,
            repo: fullRepo,
            track: 1,
            limit: HANDOFF_DISPLAY_LIMIT,
          })
          recentHandoffsTruncated =
            handoffResult.total !== undefined
              ? truncate(handoffResult.handoffs, handoffResult.total)
              : unknownTotal(handoffResult.handoffs)
        } catch {
          // Fall back to single last_handoff from SOD response
        }
        const recentHandoffs = recentHandoffsTruncated.shown as HandoffRecord[]

        // Get P0 issues
        const p0Result = getP0Issues(currentRepo.org, currentRepo.repo)
        const p0Issues = p0Result.success ? p0Result.issues || [] : []

        const isFleet = input.mode === 'fleet'

        // Get active sessions (excluding self)
        const activeSessions = (session.active_sessions || []).filter(
          (s) => s.agent !== getAgentId()
        )

        // Fleet mode: skip cadence and self-healing (not needed for fleet agents).
        //
        // We keep the FULL briefing response — items AND server-computed
        // aggregate counts (overdue_count, due_count, untracked_count) —
        // because the cadence display section MUST trust the server-side
        // aggregates rather than recomputing them from the items array
        // (Plan §B.5 — defect #9: two-sources-of-truth pattern).
        const scheduleBriefing = isFleet
          ? {
              items: [] as ScheduleBriefingItem[],
              overdue_count: 0,
              due_count: 0,
              untracked_count: 0,
            }
          : await api.getScheduleBriefing(venture.code).catch(() => ({
              items: [] as ScheduleBriefingItem[],
              overdue_count: 0,
              due_count: 0,
              untracked_count: 0,
            }))

        // Get CI/CD notifications. We need BOTH the true total counts (for
        // the header) AND a slice of the most recent critical/warning rows
        // (for the table). Plan §B.2/B.3/B.4 — defect #1 (the loud one).
        //
        // Queries run in parallel so the SOS doesn't pay double latency.
        // The counts call is what fixes the "10 unresolved" lie: it returns
        // the true 270 (or whatever the DB actually contains), and the
        // display renders it via formatTruthfulCount.
        //
        // Scope: fleet-wide. The notifications inbox is inherently cross-
        // venture — a red deploy on ke-console is a captain concern whether
        // the session is vc or ke. The table shows repo per row so operators
        // can still see which venture each alert belongs to. See #564.
        const CI_DISPLAY_LIMIT = 10
        let ciAlertsTruncated: Truncated<Notification> = exact<Notification>([])
        let ciCounts: NotificationCountsResponse | null = null
        try {
          const [countsResult, listResult] = await Promise.all([
            api.getNotificationCounts({
              status: 'new',
            }),
            api.listNotifications({
              status: 'new',
              limit: CI_DISPLAY_LIMIT,
            }),
          ])
          ciCounts = countsResult
          // Filter to critical+warning for display, but preserve the TRUE total
          // (critical + warning across the entire matching set, not just the slice).
          const shown = listResult.notifications.filter(
            (n) => n.severity === 'critical' || n.severity === 'warning'
          )
          const trueTotal = countsResult.by_severity.critical + countsResult.by_severity.warning
          ciAlertsTruncated = truncate(shown, trueTotal)
        } catch {
          // Graceful degradation - notifications API may not be deployed yet.
          // Leave ciAlertsTruncated as empty exact() so the display renders nothing.
        }
        const ciAlerts = ciAlertsTruncated.shown as Notification[]

        const docAudit = session.doc_audit
        const healingResults = isFleet
          ? { generated: [], failed: [] }
          : await healMissingDocs(api, docAudit, venture.code, venture.name, cwd)

        // Cross-venture context refresh (cadence-gated). When the
        // `context-refresh` cadence item is due/overdue AND we're in the
        // crane-console session (venture vc), sweep all ventures for
        // stale or missing machine-derivable docs and regenerate them.
        // Hash-gated via crane_doc_audit(fix:true) so no-op if nothing
        // drifted. Captain-interactive steps (exec summary review,
        // ventures.json drift) stay in the /context-refresh skill.
        if (!isFleet && venture.code === 'vc') {
          await maybeAutoRefreshContext(api, scheduleBriefing)
        }

        // Fleet health findings (Plan §C.4 + #657 Phase D). Read-only.
        // Two sources share this table:
        //   - 'github'  — weekly fleet-ops-health org audit (Plan §C.4).
        //   - 'machine' — Hermes-on-mini host-patch orchestrator (#657).
        //
        // We bump the list limit to 20 so the partitioned renderer can
        // show up to 10 per source without a second API call. Summary
        // reflects all-source totals. Skipped in fleet mode, gracefully
        // degraded on failure. Only shown for vc (portfolio lens).
        let fleetHealthFindings: FleetHealthFinding[] = []
        let fleetHealthSummary: FleetHealthSummary | null = null
        if (!isFleet && venture.code === 'vc') {
          try {
            const FLEET_HEALTH_FETCH_LIMIT = 20
            const fhResult = await api.getFleetHealthFindings({
              status: 'new',
              limit: FLEET_HEALTH_FETCH_LIMIT,
            })
            fleetHealthFindings = fhResult.findings
            fleetHealthSummary = fhResult.summary
          } catch {
            // Graceful degradation — the /fleet-health routes may not be
            // deployed yet, or the weekly audit hasn't populated the table.
            // Leave arrays empty so the section renders nothing.
          }
        }

        // System Health checks (Plan §B.7). Skipped in fleet mode (fleet
        // agents have a minimal SOS by design). The notifications-truth-window
        // check uses the count we already gathered for the alerts section,
        // so we pass it through to avoid a redundant round-trip.
        const healthCheckResults = isFleet
          ? []
          : await runHealthChecks(STANDARD_CHECKS, {
              api,
              venture: venture.code,
              ciCountsTotal: ciCounts?.total,
            })

        // Repo sync status (non-mutating — no fetch, just reports local state)
        const repoSyncStatus = getRepoSyncStatus()

        // node_modules drift — mirrors the repo-sync pattern. Surfaces the
        // fleet silent-failure mode (empty node_modules but present
        // package-lock.json) before pre-push verify catches it.
        const nodeModulesDrift = getNodeModulesDrift(cwd)

        // Memory injection (full mode only): fetch captain-approved anti-patterns
        // and context-matched lessons. Graceful degradation on all failures.
        let criticalAntiPatterns: MemoryRecord[] = []
        let relevantLessons: MemoryRecord[] = []
        let memoryAuditDaysSince: number | null = null

        if (!isFleet) {
          try {
            // Check /memory-audit last-run from schedule items
            const scheduleItems = await api.getScheduleItems().catch(() => ({ items: [] }))
            const auditItem = scheduleItems.items.find((i) => i.name === 'memory-audit')
            if (auditItem?.last_completed_at) {
              const then = new Date(auditItem.last_completed_at)
              memoryAuditDaysSince = Math.floor((Date.now() - then.getTime()) / 86_400_000)
            }

            // Only inject if audit is not >60 days overdue
            if (memoryAuditDaysSince === null || memoryAuditDaysSince <= 60) {
              const allMemoryNotes = await fetchAllMemories(api, 'memory', 200)
              const allRecords = allMemoryNotes.map(validateAndBuildRecord)

              const ventureCode = venture.code

              const eligibleBase = allRecords.filter((r) => {
                if (r.parse_error || r.frontmatter.status === 'parse_error') return false
                if (r.frontmatter.status !== 'stable') return false
                if (!r.frontmatter.captain_approved) return false
                const scope = r.frontmatter.scope
                return (
                  scope === 'enterprise' || scope === 'global' || scope === `venture:${ventureCode}`
                )
              })

              // Critical anti-patterns: top 5 sorted by severity
              const severityOrder: Record<string, number> = { P0: 3, P1: 2, P2: 1 }
              criticalAntiPatterns = eligibleBase
                .filter((r) => r.frontmatter.kind === 'anti-pattern')
                .sort(
                  (a, b) =>
                    (severityOrder[b.frontmatter.severity ?? ''] ?? 0) -
                    (severityOrder[a.frontmatter.severity ?? ''] ?? 0)
                )

              // Relevant lessons: top 3 context-matched
              relevantLessons = eligibleBase
                .filter((r) => r.frontmatter.kind === 'lesson')
                .map((r) => ({
                  record: r,
                  score:
                    scoreMemory(r, {
                      venture: venture.code,
                      repo: fullRepo,
                    }) + severityWeight(r.frontmatter.severity as MemorySeverity | undefined),
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map((x) => x.record)
            }
          } catch {
            // Graceful degradation — memory system may not have data yet
          }
        }

        // Build message
        const message = buildSosMessage({
          venture,
          fullRepo,
          branch: currentRepo.branch,
          sessionId: session.session.id,
          recentHandoffs: recentHandoffsTruncated,
          lastHandoff: session.last_handoff,
          p0Issues,
          activeSessions,
          scheduleBriefing,
          kbNotes: session.knowledge_base?.notes || [],
          ecNotes: session.enterprise_context?.notes || [],
          docAudit,
          healingResults,
          ciAlerts: ciAlertsTruncated,
          ciCounts,
          healthCheckResults,
          fleetHealthFindings,
          fleetHealthSummary,
          mode: input.mode || 'full',
          repoSyncStatus,
          nodeModulesDrift,
          criticalAntiPatterns,
          relevantLessons,
          memoryAuditDaysSince,
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
          schedule_briefing: scheduleBriefing.items.length > 0 ? scheduleBriefing.items : undefined,
          active_sessions: activeSessions,
          recent_handoffs: recentHandoffs.length > 0 ? [...recentHandoffs] : undefined,
          message,
        }
      } catch (error) {
        const detail =
          error instanceof ApiError ? error.toToolMessage(getAgentId()) : formatNetworkError(error)
        return {
          ...defaultResult,
          status: 'error',
          message: `Failed to start session.\n${detail}`,
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
  /**
   * Truncated handoffs (Plan §B.2). The wrapper carries the true total
   * matching the filter so the display can render "showing 5 of 12".
   */
  recentHandoffs: Truncated<HandoffRecord>
  lastHandoff?: {
    summary: string
    from_agent: string
    created_at: string
    status_label: string
  }
  p0Issues: GitHubIssue[]
  activeSessions: ActiveSession[]
  /**
   * Full briefing response — items AND server-computed aggregate counts.
   * The cadence section MUST trust the server aggregates (overdue_count,
   * due_count, untracked_count) instead of recomputing them from the items
   * array (Plan §B.5 — defect #9).
   */
  scheduleBriefing: ScheduleBriefingResponse
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
  /**
   * Truncated CI/CD alerts (Plan §B.2). `shown` contains the
   * critical+warning slice; `total` is the TRUE critical+warning count
   * across all matching notifications, not the slice length.
   */
  ciAlerts?: Truncated<Notification>
  /**
   * Fleet-wide notification counts (Plan §B.3, fleet-scoped per #564).
   * Used for the header line "270 total (12 critical, 45 warning, 213 info)".
   */
  ciCounts?: NotificationCountsResponse | null
  /**
   * Results of the System Health checks (Plan §B.7). Empty array means
   * skipped (fleet mode); a non-empty array renders as a dedicated
   * section between Alerts and Cadence.
   */
  healthCheckResults?: HealthCheckResult[]
  /**
   * Fleet health findings from the weekly fleet-ops-health audit (Plan §C.4).
   * Separate from CI/CD alerts (which come from webhook notifications). This
   * section only renders for vc (portfolio-level signal) and only in full mode.
   */
  fleetHealthFindings?: FleetHealthFinding[]
  fleetHealthSummary?: FleetHealthSummary | null
  mode: 'full' | 'fleet'
  /**
   * Local git sync state for the session repo (Plan §B.8).
   * Surfaces stale checkouts in the Session block so agents notice when
   * their working tree is behind origin, even if the launcher didn't
   * auto-sync (e.g., direct `claude` invocation or dirty tree).
   */
  repoSyncStatus?: RepoSyncStatus | null
  /**
   * node_modules drift state for the session repo. Detects the silent
   * failure mode where package-lock.json exists but node_modules is
   * empty (fleet npm ci swallowed a 401) or the installed marker is
   * older than the root lockfile (post-merge lockfile change, no
   * subsequent `npm ci`).
   */
  nodeModulesDrift?: NodeModulesDrift | null
  /**
   * Top-5 captain-approved anti-patterns for always-on SOS injection.
   * Empty array = no approved anti-patterns yet (day 1 state), section omitted.
   */
  criticalAntiPatterns?: MemoryRecord[]
  /**
   * Top-3 captain-approved lessons matched via recall for current context.
   * Empty array = no context matches, section omitted.
   */
  relevantLessons?: MemoryRecord[]
  /**
   * Days since /memory-audit last ran. undefined = no data. >30 = alarm. >60 = pause injection.
   */
  memoryAuditDaysSince?: number | null
}

export function buildSosMessage(params: BuildSosMessageParams): string {
  const {
    venture,
    fullRepo,
    branch,
    sessionId,
    recentHandoffs: recentHandoffsTruncated,
    lastHandoff,
    p0Issues,
    activeSessions,
    scheduleBriefing,
    kbNotes,
    ecNotes: rawEcNotes,
    docAudit,
    healingResults,
    ciAlerts: ciAlertsTruncated,
    ciCounts,
    healthCheckResults,
    fleetHealthFindings,
    fleetHealthSummary,
    mode,
    repoSyncStatus,
    nodeModulesDrift,
    criticalAntiPatterns,
    relevantLessons,
    memoryAuditDaysSince,
  } = params

  // Unwrap the Truncated wrappers ONCE at the top so the rest of the
  // builder can read `.length` on the slices for cosmetic reasons (e.g.,
  // "show resume block only if any active handoffs"). The total is held
  // separately and is the only number rendered to operators.
  const recentHandoffs = recentHandoffsTruncated.shown as HandoffRecord[]
  const recentHandoffsTotal = recentHandoffsTruncated.total
  const ciAlertsArr =
    (ciAlertsTruncated?.shown as Notification[] | undefined) ?? ([] as Notification[])

  const isFleet = mode === 'fleet'

  // Track sections that get dropped by the budget guard so we can render a
  // banner at the TOP of the message instead of burying the warning at the
  // bottom (Plan §B.2 — defect #8). The actual section drop happens at the
  // end after the message has been assembled.
  const droppedSections: string[] = []

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
  message += `| Sync | ${formatRepoSync(repoSyncStatus)} |\n`
  message += `| Deps | ${formatDepsDrift(nodeModulesDrift)} |\n`
  message += `| Session | ${sessionId} |\n\n`

  // --- Directives ---
  message += `## Directives\n\n`
  message += `**Operating ethos:** You are one of a wild band of AI agents with an ape commander - not a corporate employee. You run a state-of-the-art model with a massive context window, the full toolkit (file/shell ops, MCP integrations, parallel sub-agents, fleet dispatch, browser automation), and teammates. Powerful individually, unstoppable together. Parallelize, hold whole systems in context, verify end-to-end. Confidence, not anxiety - no timidity, no cow-towing. Mission first. Execute. If unclear, ask plainly. Otherwise, move out. No phases, no safeguards, no corporate theater for work that fits in one session. The rules below protect the mission, not slow it down. Full ethos: \`crane_doc('global', 'operating-ethos.md')\`. Toolkit: \`crane_doc('global', 'tooling.md')\`.\n\n`
  message += `- All changes through PRs. Never push directly to main.\n`
  message += `- All GitHub issues this session target **${fullRepo}**. Targeting a different repo? STOP.\n`
  message += `- Never remove, deprecate, or disable features without Captain directive.\n`
  message += `- Run \`npm run verify\` before pushing. Fix root causes, not symptoms.\n`
  message += `- Scope discipline: finish current task, file new issues for discovered work.\n`
  message += `- Never switch repos or ventures without explicit Captain approval. Announce all context switches.\n`
  message += `- Before editing against any third-party API/SDK/CLI (GitHub, Vercel, Cloudflare, npm, etc.), consult Context7 (\`mcp__plugin_context7_context7__*\`) — training data is frozen; don't guess at vendor syntax. Full tooling catalog: \`crane_doc('global', 'tooling.md')\`.\n`

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
          message += `*[Truncated — run \`crane_sos(venture: "${venture.code}")\` again or check the handoff summary above for full details]*\n\n`
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
          // Truthful header (Plan §B.2 — defect #2): show the TRUE total of
          // handoffs matching the filter, not just the slice length. Operators
          // must be able to distinguish "5 because there are 5" from "5
          // because that's where the limit ended."
          const handoffsForHeader = truncate(recentHandoffs, recentHandoffsTotal)
          message += `${formatTruthfulCount(handoffsForHeader, 'recent handoff(s)', { hint: `run \`crane_sos(venture: "${venture.code}")\` for full briefing` })}:\n`
        }
        const shown = otherHandoffs.slice(0, MAX_OTHER_HANDOFFS)
        for (const h of shown) {
          const time = new Date(h.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          const summary = extractHandoffOneLiner(h.summary, 200)
          message += `- **${time}** ${h.from_agent} [${h.status_label}]: ${summary}\n`
        }
        if (otherHandoffs.length > MAX_OTHER_HANDOFFS) {
          message += `- _${otherHandoffs.length - MAX_OTHER_HANDOFFS} more in slice — run \`crane_sos(venture: "${venture.code}")\` for full briefing_\n`
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
          message += `*[Truncated — run \`crane_sos(venture: "${venture.code}")\` again for full briefing]*\n\n`
        }
      } else {
        const summary = extractHandoffOneLiner(lastHandoff.summary, 200)
        message += `Last handoff from ${lastHandoff.from_agent} [${lastHandoff.status_label}]: ${summary}\n\n`
      }
    } else {
      message += `No recent handoffs.\n\n`
    }
  }

  // --- Alerts (conditional: only if P0 issues, CI/CD alerts, or active sessions) ---
  // The alerts section is the visible truth restoration moment. Counts come
  // from the new /notifications/counts endpoint (Plan §B.3) so they reflect
  // the TRUE state of the database, not a paginated slice.
  const hasCiAlerts = ciAlertsArr.length > 0 || (ciCounts != null && ciCounts.total > 0)
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

    if (hasCiAlerts && ciAlertsTruncated) {
      const critical = ciAlertsArr.filter((n) => n.severity === 'critical')
      const warnings = ciAlertsArr.filter((n) => n.severity === 'warning')

      // Header line — the loud fix for defect #1. Render the TRUE counts
      // from /notifications/counts, not the slice length. This is the
      // line operators have been silently misled by for weeks.
      if (ciCounts) {
        const breakdown: string[] = []
        if (ciCounts.by_severity.critical > 0)
          breakdown.push(`${ciCounts.by_severity.critical} critical`)
        if (ciCounts.by_severity.warning > 0)
          breakdown.push(`${ciCounts.by_severity.warning} warning`)
        if (ciCounts.by_severity.info > 0) breakdown.push(`${ciCounts.by_severity.info} info`)
        const breakdownStr = breakdown.length > 0 ? ` (${breakdown.join(', ')})` : ''
        message += `**CI/CD Alerts** — ${ciCounts.total} unresolved total${breakdownStr}\n`
        if (critical.length + warnings.length > 0) {
          message += `Showing ${critical.length + warnings.length} most recent critical/warning:\n`
        }
      } else {
        // Fallback path if the counts endpoint failed: render via the
        // truthful-display helper using whatever total we have. The helper
        // will produce "(showing X, +N more)" when truncated.
        message += `**${formatTruthfulCount(ciAlertsTruncated, 'CI/CD Alerts unresolved', { hint: `run \`crane_notifications()\`` })}**\n`
      }

      for (const n of critical) {
        message += `- CRIT: ${n.summary}\n`
      }
      for (const n of warnings) {
        message += `- WARN: ${n.summary}\n`
      }

      // If there are MORE critical+warning alerts than what fit in the
      // slice, surface that explicitly. This is the "+N more" line that
      // tells the operator the table is truncated.
      const trueCritWarn = ciAlertsTruncated.total
      const shownCount = critical.length + warnings.length
      if (trueCritWarn > shownCount) {
        message += `- _+${trueCritWarn - shownCount} more critical/warning — run \`crane_notifications()\`_\n`
      }

      message += `\nDetails: \`crane_notifications()\`\n\n`
    }

    if (activeSessions.length > 0) {
      const MAX_SESSIONS = 5
      const sessionsTruncated = truncate(
        activeSessions.slice(0, MAX_SESSIONS),
        activeSessions.length
      )
      // Header always shows "showing N of M" — even at the exact-limit boundary
      // where shown == M (Plan §B.2 T3 — defect #4). This is the "show
      // truncation even when displayed count equals limit" rule.
      message += `**Other Active Sessions** — ${formatTruthfulCount(sessionsTruncated, 'session(s)')}\n`
      for (const s of sessionsTruncated.shown as ActiveSession[]) {
        message += `- ${s.agent} on ${s.repo}`
        if (s.issue_number) {
          message += ` (Issue #${s.issue_number})`
        }
        message += '\n'
      }
      message += '\n'
    }
  }

  // --- System Health (Plan §B.7) ---
  // Renders between Alerts and Cadence in `full` mode only. Empty
  // result array (e.g., fleet mode) skips the section entirely.
  if (!isFleet && healthCheckResults && healthCheckResults.length > 0) {
    message += formatHealthCheckSection(healthCheckResults)
  }

  // --- Fleet Health (Plan §C.4 + #657 Phase D) ---
  // Portfolio-level signal from two independent audit pipelines sharing
  // the fleet_health_findings table:
  //   - source='github'  — weekly fleet-ops-health org audit (Plan §C.4).
  //   - source='machine' — Hermes-on-mini host-patch orchestrator (#657).
  //
  // Renders for vc (portfolio lens), full mode only. Findings are
  // partitioned by source so a dead github.com/machine/<alias> link is
  // never emitted. Header shows combined count.
  //
  // Heartbeat: if any open machine-source finding's generated_at is
  // older than 10 days, emit a WARN — open machine findings are refreshed
  // on every successful orchestrator run, so staleness directly implies
  // the timer isn't running.
  if (
    !isFleet &&
    venture.code === 'vc' &&
    fleetHealthSummary &&
    fleetHealthSummary.total_open > 0
  ) {
    const FLEET_HEALTH_PER_SOURCE_LIMIT = 10
    message += `## Fleet Health\n\n`

    // Header: truthful count of total open findings + breakdown.
    const { total_open, by_severity, open_repos, newest_generated_at } = fleetHealthSummary
    const breakdownParts: string[] = []
    if (by_severity.error > 0) breakdownParts.push(`${by_severity.error} error`)
    if (by_severity.warning > 0) breakdownParts.push(`${by_severity.warning} warning`)
    if (by_severity.info > 0) breakdownParts.push(`${by_severity.info} info`)
    const breakdown = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : ''

    const ageLabel = newest_generated_at
      ? ` · last audit ${formatAgeDays(calendarDaysSince(new Date(newest_generated_at)))}`
      : ''

    message += `${total_open} open finding${total_open === 1 ? '' : 's'}${breakdown} across ${open_repos} repo${open_repos === 1 ? '' : 's'}${ageLabel}\n\n`

    const findings = fleetHealthFindings ?? []

    // Partition by source. Rows from older workers (pre-#657) carry
    // `source: undefined` and are treated as github by convention.
    const githubFindings = findings.filter((f) => (f.source ?? 'github') === 'github')
    const machineFindings = findings.filter((f) => f.source === 'machine')

    const sevRank: Record<string, number> = { error: 0, warning: 1, info: 2 }
    const sortBySeverityThenRepo = (a: FleetHealthFinding, b: FleetHealthFinding): number => {
      const aRank = sevRank[a.severity] ?? 3
      const bRank = sevRank[b.severity] ?? 3
      if (aRank !== bRank) return aRank - bRank
      return a.repo_full_name.localeCompare(b.repo_full_name)
    }

    const extractMessage = (f: FleetHealthFinding): string => {
      let msg = ''
      try {
        const parsed = JSON.parse(f.details_json) as { message?: string }
        msg = parsed.message || f.details_json
      } catch {
        msg = f.details_json
      }
      if (msg.length > 80) msg = msg.slice(0, 77) + '...'
      return msg.replace(/\|/g, '\\|')
    }

    const sevLabel = (s: string): string =>
      s === 'error' ? 'ERROR' : s === 'warning' ? 'WARN' : 'INFO'

    // Stale-audit heartbeat — only fires when machine findings exist
    // but are older than the expected weekly cadence (10 days).
    if (machineFindings.length > 0) {
      const newestMachine = machineFindings.reduce((acc, f) =>
        new Date(f.generated_at) > new Date(acc.generated_at) ? f : acc
      )
      const ageDays = calendarDaysSince(new Date(newestMachine.generated_at))
      if (ageDays > 10) {
        message += `**⚠ fleet-update timer appears stuck:** newest machine snapshot is ${ageDays} days old. Check \`systemctl list-timers | grep fleet-update\` on mini, or tail \`/var/log/fleet-update/run.log\`.\n\n`
      }
    }

    // Render the GitHub subtable (existing audit — always first).
    if (githubFindings.length > 0) {
      const sorted = [...githubFindings].sort(sortBySeverityThenRepo)
      const shown = sorted.slice(0, FLEET_HEALTH_PER_SOURCE_LIMIT)

      if (machineFindings.length > 0) {
        message += `### Repos (${githubFindings.length})\n\n`
      }
      message += `| Severity | Repo | Finding | Message |\n`
      message += `|----------|------|---------|---------|\n`
      for (const f of shown) {
        message += `| ${sevLabel(f.severity)} | ${f.repo_full_name} | ${f.finding_type} | ${extractMessage(f)} |\n`
      }
      if (githubFindings.length > shown.length) {
        const remaining = githubFindings.length - shown.length
        message += `\nShowing ${shown.length} of ${githubFindings.length} repo finding(s) — +${remaining} more.\n`
      }
      message += '\n'
    }

    // Render the Machines subtable — strips the `machine/` prefix so
    // operators see clean aliases (no dead github.com links).
    if (machineFindings.length > 0) {
      const sorted = [...machineFindings].sort(sortBySeverityThenRepo)
      const shown = sorted.slice(0, FLEET_HEALTH_PER_SOURCE_LIMIT)

      message += `### Machines (${machineFindings.length})\n\n`
      message += `| Severity | Machine | Finding | Message |\n`
      message += `|----------|---------|---------|---------|\n`
      for (const f of shown) {
        // Strip the `machine/` convention prefix so operators see the
        // bare alias. Source-aware branching — never emits a link.
        const alias = f.repo_full_name.startsWith('machine/')
          ? f.repo_full_name.slice('machine/'.length)
          : f.repo_full_name
        message += `| ${sevLabel(f.severity)} | ${alias} | ${f.finding_type} | ${extractMessage(f)} |\n`
      }
      if (machineFindings.length > shown.length) {
        const remaining = machineFindings.length - shown.length
        message += `\nShowing ${shown.length} of ${machineFindings.length} machine finding(s) — +${remaining} more.\n`
      }
      message += '\n'
    }
  }

  // --- Cadence (skipped in fleet mode, actionable items first, max 5) ---
  if (!isFleet && scheduleBriefing.items.length > 0) {
    const MAX_CADENCE_ITEMS = 5

    const actionHints: Record<string, string> = {
      'portfolio-review': '/portfolio-review',
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
      'context-refresh': '/context-refresh',
    }

    // Actionable first (overdue + due), then untracked only if room
    const sorted = [...scheduleBriefing.items].sort((a, b) => a.priority - b.priority)
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

      // TRUST THE SERVER (Plan §B.5 — defect #9). The previous version
      // recomputed `overdueCount` and `dueCount` from the items array,
      // creating a second source of truth that could disagree with the
      // server's own aggregates. The server is the only authority for
      // these counts; we use the values it gave us directly.
      const parts: string[] = []
      if (scheduleBriefing.overdue_count > 0)
        parts.push(`${scheduleBriefing.overdue_count} overdue`)
      if (scheduleBriefing.due_count > 0) parts.push(`${scheduleBriefing.due_count} due`)
      if (parts.length > 0) message += `\n${parts.join(', ')}`

      // Always show "showing N of M" even when N == M (Plan §B.2 T3 —
      // defect #3). Operators must be able to distinguish "5 because there
      // are 5" from "5 because the limit was 5." The "M" is the TRUE
      // total of items in the briefing, which is items.length — that's
      // what the server returned, not a recomputed aggregate.
      const cadenceTruncated = truncate(toShow, scheduleBriefing.items.length)
      message += parts.length > 0 ? ' | ' : '\n'
      message += `${formatTruthfulCount(cadenceTruncated, 'cadence item(s)', { hint: `run \`crane_schedule(action: 'list')\`` })}`
      message += '\n\n'
    }
  }

  // --- Knowledge Base (skipped in fleet mode, pointer only) ---
  if (!isFleet && kbNotes.length > 0) {
    message += `## Knowledge Base\n\n`
    message += `${kbNotes.length} note(s). Browse: \`crane_notes()\` | Search: \`crane_notes(q: "...")\`\n\n`
  }

  // --- Memory: Critical Anti-Patterns + Relevant Lessons ---
  // Only in full mode. Injection requires captain_approved=true (the noise-bomb gate).
  // If /memory-audit is >60 days overdue, anti-pattern injection is paused (stale memory
  // is worse than no memory).
  if (!isFleet) {
    const auditOverdueDays = memoryAuditDaysSince ?? null

    if (auditOverdueDays !== null && auditOverdueDays > 60) {
      message += `## Critical Anti-Patterns\n\n`
      message += `Memory system unaudited for ${auditOverdueDays} days. Anti-pattern injection paused. Run \`/memory-audit\`.\n\n`
    } else {
      // Warn if overdue >30 days
      if (auditOverdueDays !== null && auditOverdueDays > 30) {
        message += `> **Memory system unaudited for ${auditOverdueDays} days** — run \`/memory-audit\`.\n\n`
      }

      // Inject critical anti-patterns (top 5, captain_approved, sorted by severity)
      if (criticalAntiPatterns && criticalAntiPatterns.length > 0) {
        const ANTI_PATTERN_CAP = 5
        const toShow = criticalAntiPatterns.slice(0, ANTI_PATTERN_CAP)
        const overflow = criticalAntiPatterns.length - ANTI_PATTERN_CAP

        message += `## Critical Anti-Patterns\n\n`
        for (const m of toShow) {
          const fm = m.frontmatter
          const severityLabel = fm.severity ? `[${fm.severity}] ` : ''
          message += `- ${severityLabel}**${fm.name}**: ${fm.description}\n`
        }
        if (overflow > 0) {
          message += `- _+${overflow} more: \`crane_memory(action: 'list', kind: 'anti-pattern')\`_\n`
        }
        message += '\n'

        // Fire-and-forget surfaced telemetry for each injected anti-pattern (1/10 sampling handled inside)
        void recordMemorySurfaced(toShow)
      }

      // Inject relevant lessons (top 3, context-matched)
      if (relevantLessons && relevantLessons.length > 0) {
        message += `## Relevant Lessons\n\n`
        for (const m of relevantLessons) {
          const fm = m.frontmatter
          message += `- **${fm.name}**: ${fm.description}\n`
        }
        message += '\n'

        void recordMemorySurfaced(relevantLessons)
      }
    }
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

      // Render the preview WITH explicit truncation accounting (Plan §B.2
      // — defect #7). Silent 800-char slices were the kind of "lie by
      // omission" that hid context decay. Operators must see exactly how
      // many chars were elided so they know when to read the full note.
      const EC_PREVIEW_LIMIT = 800
      const totalChars = primary.content.length
      if (totalChars <= EC_PREVIEW_LIMIT) {
        message += `${primary.content}\n\n`
      } else {
        const totalKb = Math.round(totalChars / 1024)
        message += `${primary.content.slice(0, EC_PREVIEW_LIMIT)}\n\n`
        message += `_[Showing first ${EC_PREVIEW_LIMIT} of ${totalChars.toLocaleString()} chars (~${totalKb} KB). Full: \`crane_notes(q: "${primary.title || primary.id}")\`]_\n\n`
      }

      // Warn if executive summary is stale (>30 calendar days old in MST).
      // Plan §B.5 — defect #11: calendar-day diff, not elapsed-ms.
      const ecAge = calendarDaysSince(new Date(primary.updated_at))
      if (ecAge > 30) {
        message += `**Executive summary is ${formatAgeDays(ecAge)}.** Run \`/context-refresh\` to update.\n\n`
      }

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
      // Only show stale docs that couldn't be auto-healed (non-auto-generable)
      const unhealable = docAudit.stale.filter((d) => !d.auto_generate)
      if (unhealable.length > 0) {
        message += `### Stale Documentation (manual update needed)\n`
        for (const doc of unhealable) {
          message += `- ${doc.doc_name} (${doc.days_since_update} days old, threshold: ${doc.staleness_threshold_days})\n`
        }
        message += '\n'
      }
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
  message += `**What would you like to focus on?**\n\n`

  // Explicit stop directive — re-anchors any agent (Codex, Gemini, etc.) that
  // calls this tool without going through Claude's /sos slash command. Without
  // this line, agents that don't natively pause after tool calls will continue
  // straight into autonomous exploration of whatever the user said before SOS
  // ran. Keep this as the final line of the response so it can't be missed.
  message += `---\n\n`
  message += `**STOP. Do not start any work, explore the codebase, run commands, view PRs, or take any other action until the user responds with their focus.**`

  // SOS budget check (Plan §B.2 — defect #8). When the rendered message
  // exceeds the budget, we drop the LAST (least critical) sections first
  // and surface a banner at the TOP of the message listing exactly what
  // was dropped. The current implementation does not yet pre-render and
  // re-budget per-section (that requires a section-list refactor); for
  // this PR we ensure the warning is visible at the TOP — never buried
  // at the bottom where operators learned to scroll past it.
  const SOS_BUDGET = 8_192
  if (message.length > SOS_BUDGET) {
    droppedSections.push(`message size ${Math.round(message.length / 1024)} KB exceeds budget`)
  }

  if (droppedSections.length > 0) {
    const banner =
      `> **SOS BUDGET WARNING:** ${droppedSections.join('; ')}.\n` +
      `> Run \`crane_status\`, \`crane_notifications()\`, ` +
      `or \`crane_schedule(action: 'list')\` for full details.\n\n`
    message = banner + message
  }

  return message
}

/** Truncate a string to the first line or maxLen chars, whichever is shorter */
function truncateOneLine(text: string, maxLen: number): string {
  const firstLine = text.split('\n')[0]
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.slice(0, maxLen - 3) + '...'
}

/** Extract a meaningful one-liner from a markdown handoff summary, skipping headings and blanks */
function extractHandoffOneLiner(text: string, maxLen: number): string {
  const contentLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))

  if (contentLines.length === 0) return truncateOneLine(text, maxLen)

  // Join bullet items with semicolons for a compact one-liner
  let summary = ''
  for (const line of contentLines) {
    const clean = line.replace(/^[-*]\s+/, '')
    if (summary.length === 0) {
      summary = clean
    } else if (summary.length + clean.length + 2 <= maxLen) {
      summary += '; ' + clean
    } else {
      break
    }
  }

  if (summary.length > maxLen) {
    return summary.slice(0, maxLen - 3) + '...'
  }
  return summary
}

// ============================================================================
// Cross-Venture Context Refresh (cadence-triggered)
// ============================================================================

/**
 * When the `context-refresh` cadence item is due or overdue, sweep all
 * ventures for missing/stale machine-derivable docs and regenerate them.
 * Idempotent (hash-gated in crane_doc_audit fix mode). Failures are
 * swallowed — a missed refresh should never break a session briefing.
 * On success, record completion so the cadence row flips to CURRENT.
 *
 * Keeps /context-refresh as the explicit Captain-interactive path for
 * executive-summary review and ventures.json drift (the parts that
 * can't safely auto-run).
 */
async function maybeAutoRefreshContext(
  api: CraneApi,
  scheduleBriefing: ScheduleBriefingResponse
): Promise<void> {
  const item = scheduleBriefing.items.find((i) => i.name === 'context-refresh')
  if (!item || (item.status !== 'due' && item.status !== 'overdue')) {
    return
  }

  try {
    const { executeDocAudit } = await import('./doc-audit.js')
    const result = await executeDocAudit({ all: true, fix: true })

    await api
      .completeScheduleItem('context-refresh', {
        result: result.status === 'success' ? 'success' : 'warning',
        summary:
          'auto-regen via SOS (docs only; exec summaries + ventures.json via /context-refresh)',
        completed_by: getAgentId(),
      })
      .catch(() => {
        // Cadence write failure shouldn't break SOS.
      })
  } catch {
    // Audit or regen failed. Next SOS will retry when the cadence
    // item is still due/overdue.
  }
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

  // Also regenerate stale docs with content-hash guard
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

      // Content-hash guard: skip upload if content unchanged
      const newHash = createHash('sha256').update(generated.content).digest('hex')
      const existing = await api.getDoc(ventureCode, doc.doc_name)
      if (existing && existing.content_hash === newHash) {
        await api.touchDoc(ventureCode, doc.doc_name)
        continue
      }

      await api.uploadDoc({
        scope: ventureCode,
        doc_name: doc.doc_name,
        content: generated.content,
        title: generated.title,
        source_repo: `${ventureCode}-console`,
        uploaded_by: 'crane-mcp-sos-heal',
      })

      results.generated.push(`${doc.doc_name} (refreshed)`)
    } catch {
      // Stale doc refresh failures are non-critical, don't report
    }
  }

  return results
}
