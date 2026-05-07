/**
 * SOS valid-venture session runner. Composes data fetching, message building,
 * and result assembly for the in-venture happy path.
 */

import { hostname as osHostname } from 'node:os'
import { getAgentId } from '../../lib/agent-identity.js'
import { getClientSessionId, jsonlPathFor, extractActivityEvents } from '../../lib/session-log.js'
import {
  CraneApi,
  type Venture,
  type ActiveSession,
  type VentureDoc as _VentureDoc,
  type HandoffRecord,
  type ScheduleBriefingResponse,
  type Notification,
  type NotificationCountsResponse,
  type FleetHealthFinding,
  type FleetHealthSummary,
  type DocAuditResult,
} from '../../lib/crane-api.js'
import { truncate, exact, unknownTotal, type Truncated } from '../../lib/truthful-display.js'
import {
  STANDARD_CHECKS,
  runHealthChecks,
  type HealthCheckResult,
} from '../../lib/health-checks.js'
import { setSession } from '../../lib/session-state.js'
import {
  getCurrentRepoInfo,
  getRepoSyncStatus,
  getNodeModulesDrift,
} from '../../lib/repo-scanner.js'
import { getP0Issues } from '../../lib/github.js'
import { healMissingDocs, maybeAutoRefreshContext } from './doc-heal.js'
import { fetchMemoryInjection } from './memory-inject.js'
import { collapseByRun } from './notifications.js'
import { buildSosMessage } from './message-builder.js'
import { type MemoryRecord } from '../memory.js'
import type { SosInput, SosResult } from '../sos.js'

/**
 * Best-effort: locate the prior session for this tuple+host, parse its Claude
 * Code JSONL transcript, and POST any activity events. Best-effort — never throws.
 */
async function backfillPriorSessionActivity(args: {
  api: CraneApi
  agent: string
  venture: string
  repo: string
  host: string
  cwd: string
}): Promise<void> {
  try {
    const prior = await args.api.getPriorSession({
      agent: args.agent,
      venture: args.venture,
      repo: args.repo,
      track: 1,
      host: args.host,
      withinHours: 48,
    })
    if (!prior || !prior.client_session_id) return

    const jsonlPath = jsonlPathFor(args.cwd, prior.client_session_id)
    const sinceTs = prior.last_activity_at || prior.created_at
    const events = extractActivityEvents(jsonlPath, sinceTs)
    if (events.length === 0) return

    const clamped = prior.ended_at ? events.filter((ts) => ts <= prior.ended_at!) : events
    if (clamped.length === 0) return

    await args.api.postSessionActivity(
      prior.id,
      clamped.map((ts) => ({ ts })),
      'cc_jsonl'
    )
  } catch (err) {
    console.warn('crane_sos: prior-session activity backfill failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function fetchCiAlerts(
  api: CraneApi,
  ventureCode: string
): Promise<{
  ciAlertsTruncated: Truncated<Notification>
  ciCounts: NotificationCountsResponse | null
}> {
  const CI_DISPLAY_LIMIT = 10
  const isCaptainSeat = ventureCode === 'vc'
  let ciAlertsTruncated: Truncated<Notification> = exact<Notification>([])
  let ciCounts: NotificationCountsResponse | null = null
  try {
    const countsParams = isCaptainSeat
      ? { status: 'new', group_by: 'venture' as const }
      : { status: 'new', venture: ventureCode }
    const listParams = isCaptainSeat
      ? { status: 'new', limit: CI_DISPLAY_LIMIT }
      : { status: 'new', limit: CI_DISPLAY_LIMIT, venture: ventureCode }
    const [countsResult, listResult] = await Promise.all([
      api.getNotificationCounts(countsParams),
      api.listNotifications(listParams),
    ])
    ciCounts = countsResult
    const filtered = listResult.notifications.filter(
      (n) => n.severity === 'critical' || n.severity === 'warning'
    )
    const shown = collapseByRun(filtered)
    const trueTotal = countsResult.by_severity.critical + countsResult.by_severity.warning
    ciAlertsTruncated = truncate(shown, trueTotal)
  } catch {
    // Graceful degradation
  }
  return { ciAlertsTruncated, ciCounts }
}

async function fetchFleetHealth(api: CraneApi): Promise<{
  fleetHealthFindings: FleetHealthFinding[]
  fleetHealthSummary: FleetHealthSummary | null
}> {
  try {
    const FLEET_HEALTH_FETCH_LIMIT = 20
    const fhResult = await api.getFleetHealthFindings({
      status: 'new',
      limit: FLEET_HEALTH_FETCH_LIMIT,
    })
    return { fleetHealthFindings: fhResult.findings, fleetHealthSummary: fhResult.summary }
  } catch {
    return { fleetHealthFindings: [], fleetHealthSummary: null }
  }
}

async function fetchHandoffs(
  api: CraneApi,
  ventureCode: string,
  fullRepo: string
): Promise<Truncated<HandoffRecord>> {
  const HANDOFF_DISPLAY_LIMIT = 5
  let result: Truncated<HandoffRecord> = exact<HandoffRecord>([])
  try {
    const handoffResult = await api.queryHandoffs({
      venture: ventureCode,
      repo: fullRepo,
      track: 1,
      limit: HANDOFF_DISPLAY_LIMIT,
    })
    result =
      handoffResult.total !== undefined
        ? truncate(handoffResult.handoffs, handoffResult.total)
        : unknownTotal(handoffResult.handoffs)
  } catch {
    // Fall back to single last_handoff from SOD response
  }
  return result
}

interface FullModeArgs {
  api: CraneApi
  venture: Venture
  fullRepo: string
  cwd: string
  docAudit: DocAuditResult | undefined
  scheduleBriefing: ScheduleBriefingResponse
  ciCountsTotal: number | undefined
}

async function fetchFullModeData(args: FullModeArgs) {
  const { api, venture, fullRepo, cwd, docAudit, scheduleBriefing, ciCountsTotal } = args
  const isVc = venture.code === 'vc'
  const [healingResults, healthCheckResults, memoryResult] = await Promise.all([
    healMissingDocs(api, docAudit, venture.code, venture.name, cwd),
    runHealthChecks(STANDARD_CHECKS, { api, venture: venture.code, ciCountsTotal }),
    fetchMemoryInjection(api, venture.code, fullRepo),
  ])

  if (isVc) {
    await maybeAutoRefreshContext(api, scheduleBriefing)
  }

  const fleetData = isVc
    ? await fetchFleetHealth(api)
    : {
        fleetHealthFindings: [] as FleetHealthFinding[],
        fleetHealthSummary: null as FleetHealthSummary | null,
      }

  return { healingResults, healthCheckResults, memoryResult, ...fleetData }
}

const EMPTY_SCHEDULE: ScheduleBriefingResponse = {
  items: [],
  overdue_count: 0,
  due_count: 0,
  untracked_count: 0,
}
const EMPTY_FLEET_DATA = {
  healingResults: {
    generated: [] as string[],
    failed: [] as Array<{ doc: string; reason: string }>,
  },
  healthCheckResults: [] as HealthCheckResult[],
  memoryResult: {
    criticalAntiPatterns: [] as MemoryRecord[],
    relevantLessons: [] as MemoryRecord[],
    memoryAuditDaysSince: null as number | null,
  },
  fleetHealthFindings: [] as FleetHealthFinding[],
  fleetHealthSummary: null as FleetHealthSummary | null,
}

interface SessionContextArgs {
  api: CraneApi
  session: Awaited<ReturnType<CraneApi['startSession']>>
  venture: Venture
  fullRepo: string
  isFleet: boolean
  cwd: string
}

async function fetchSessionContext(args: SessionContextArgs) {
  const { api, session, venture, fullRepo, isFleet, cwd } = args
  const scheduleBriefing = isFleet
    ? EMPTY_SCHEDULE
    : await api.getScheduleBriefing(venture.code).catch(() => EMPTY_SCHEDULE)

  const { ciAlertsTruncated, ciCounts } = await fetchCiAlerts(api, venture.code)

  const fleetData = isFleet
    ? EMPTY_FLEET_DATA
    : await fetchFullModeData({
        api,
        venture,
        fullRepo,
        cwd,
        docAudit: session.doc_audit,
        scheduleBriefing,
        ciCountsTotal: ciCounts?.total,
      })

  let verifyCount: number | undefined
  if (!isFleet) {
    try {
      verifyCount = await api.getVerifySessionCount(session.session.id)
    } catch {
      /* best-effort */
    }
  }

  return { scheduleBriefing, ciAlertsTruncated, ciCounts, fleetData, verifyCount }
}

interface BuildSosResultArgs {
  cwd: string
  venture: Venture
  currentRepo: ReturnType<typeof getCurrentRepoInfo> & object
  session: Awaited<ReturnType<CraneApi['startSession']>>
  p0Issues: import('../../lib/github.js').GitHubIssue[]
  activeSessions: ActiveSession[]
  scheduleBriefing: ScheduleBriefingResponse
  recentHandoffs: HandoffRecord[]
  message: string
}

function buildSosResult(args: BuildSosResultArgs): SosResult {
  const {
    cwd,
    venture,
    currentRepo,
    session,
    p0Issues,
    activeSessions,
    scheduleBriefing,
    recentHandoffs,
    message,
  } = args
  const fullRepo = `${currentRepo.org}/${currentRepo.repo}`
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
}

export async function runValidVentureSession(
  api: CraneApi,
  venture: Venture,
  currentRepo: ReturnType<typeof getCurrentRepoInfo> & object,
  input: SosInput,
  cwd: string
): Promise<SosResult> {
  const fullRepo = `${currentRepo.org}/${currentRepo.repo}`
  const agentId = getAgentId()
  const isFleet = input.mode === 'fleet'

  await backfillPriorSessionActivity({
    api,
    agent: agentId,
    venture: venture.code,
    repo: fullRepo,
    host: process.env.HOSTNAME || osHostname() || 'unknown',
    cwd: process.cwd(),
  })

  const session = await api.startSession({
    venture: venture.code,
    repo: fullRepo,
    agent: agentId,
    client_session_id: getClientSessionId() || undefined,
  })
  setSession(session.session.id, venture.code, fullRepo)

  const recentHandoffsTruncated = await fetchHandoffs(api, venture.code, fullRepo)
  const recentHandoffs = recentHandoffsTruncated.shown as HandoffRecord[]
  const p0Result = getP0Issues(currentRepo.org, currentRepo.repo)
  const p0Issues = p0Result.success ? p0Result.issues || [] : []
  const activeSessions = (session.active_sessions ?? []).filter((s) => s.agent !== agentId)
  const repoSyncStatus = getRepoSyncStatus()
  const nodeModulesDrift = getNodeModulesDrift(cwd)

  const { scheduleBriefing, ciAlertsTruncated, ciCounts, fleetData, verifyCount } =
    await fetchSessionContext({ api, session, venture, fullRepo, isFleet, cwd })

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
    kbNotes: session.knowledge_base?.notes ?? [],
    ecNotes: session.enterprise_context?.notes ?? [],
    docAudit: session.doc_audit,
    healingResults: fleetData.healingResults,
    ciAlerts: ciAlertsTruncated,
    ciCounts,
    healthCheckResults: fleetData.healthCheckResults,
    fleetHealthFindings: fleetData.fleetHealthFindings,
    fleetHealthSummary: fleetData.fleetHealthSummary,
    mode: input.mode ?? 'full',
    repoSyncStatus,
    nodeModulesDrift,
    criticalAntiPatterns: fleetData.memoryResult.criticalAntiPatterns,
    relevantLessons: fleetData.memoryResult.relevantLessons,
    memoryAuditDaysSince: fleetData.memoryResult.memoryAuditDaysSince,
    verifyCount,
  })

  return buildSosResult({
    cwd,
    venture,
    currentRepo,
    session,
    p0Issues,
    activeSessions,
    scheduleBriefing,
    recentHandoffs,
    message,
  })
}
