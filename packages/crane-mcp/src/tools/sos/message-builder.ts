/**
 * SOS message builder — assembles section outputs into the final briefing string.
 */

import {
  type Venture,
  type ActiveSession,
  type DocAuditResult,
  type VentureDoc,
  type HandoffRecord,
  type ScheduleBriefingResponse,
  type Notification,
  type NotificationCountsResponse,
  type FleetHealthFinding,
  type FleetHealthSummary,
} from '../../lib/crane-api.js'
import { type Truncated } from '../../lib/truthful-display.js'
import { type HealthCheckResult } from '../../lib/health-checks.js'
import { type RepoSyncStatus, type NodeModulesDrift } from '../../lib/repo-scanner.js'
import { type GitHubIssue } from '../../lib/github.js'
import { type MemoryRecord } from '../memory.js'
import { type HealingResults } from './doc-heal.js'
import {
  renderSessionBlock,
  renderDirectivesBlock,
  renderContinuityBlock,
  renderAlertsBlock,
  renderFleetHealthBlock,
  renderCadenceBlock,
  renderMemoryBlock,
  renderEnterpriseContextBlock,
  renderDocAuditBlock,
  renderHealthChecksBlock,
} from './message-sections.js'

export interface BuildSosMessageParams {
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
   * Truncated CI/CD alerts (Plan §B.2).
   */
  ciAlerts?: Truncated<Notification>
  /**
   * Fleet-wide notification counts (Plan §B.3).
   */
  ciCounts?: NotificationCountsResponse | null
  /**
   * Results of the System Health checks (Plan §B.7).
   */
  healthCheckResults?: HealthCheckResult[]
  /**
   * Fleet health findings from the weekly fleet-ops-health audit.
   */
  fleetHealthFindings?: FleetHealthFinding[]
  fleetHealthSummary?: FleetHealthSummary | null
  mode: 'full' | 'fleet'
  repoSyncStatus?: RepoSyncStatus | null
  nodeModulesDrift?: NodeModulesDrift | null
  criticalAntiPatterns?: MemoryRecord[]
  relevantLessons?: MemoryRecord[]
  memoryAuditDaysSince?: number | null
  verifyCount?: number
  documentation?: VentureDoc[]
}

function renderPostAlertFullSections(params: BuildSosMessageParams): string {
  let out = renderHealthChecksBlock(params.healthCheckResults)
  if (params.venture.code === 'vc') {
    out += renderFleetHealthBlock({
      fleetHealthFindings: params.fleetHealthFindings,
      fleetHealthSummary: params.fleetHealthSummary,
    })
  }
  out += renderCadenceBlock(params.scheduleBriefing)
  if (params.kbNotes.length > 0) {
    out += `## Knowledge Base\n\n`
    out += `${params.kbNotes.length} note(s). Browse: \`crane_notes()\` | Search: \`crane_notes(q: "...")\`\n\n`
  }
  out += renderMemoryBlock({
    criticalAntiPatterns: params.criticalAntiPatterns,
    relevantLessons: params.relevantLessons,
    memoryAuditDaysSince: params.memoryAuditDaysSince,
  })
  out += renderEnterpriseContextBlock({
    rawEcNotes: params.ecNotes,
    ventureCode: params.venture.code,
  })
  return out
}

function applyBudgetCheck(message: string): string {
  const SOS_BUDGET = 8_192
  if (message.length <= SOS_BUDGET) return message
  const banner =
    `> **SOS BUDGET WARNING:** message size ${Math.round(message.length / 1024)} KB exceeds budget.\n` +
    `> Run \`crane_status\`, \`crane_notifications()\`, ` +
    `or \`crane_schedule(action: 'list')\` for full details.\n\n`
  return banner + message
}

export function buildSosMessage(params: BuildSosMessageParams): string {
  const isFleet = params.mode === 'fleet'
  let message = ''

  if (!process.env.GH_TOKEN) {
    message += `**Warning:** GH_TOKEN not set - GitHub operations will fail\n\n`
  }

  message += renderSessionBlock({
    venture: params.venture,
    fullRepo: params.fullRepo,
    branch: params.branch,
    sessionId: params.sessionId,
    repoSyncStatus: params.repoSyncStatus,
    nodeModulesDrift: params.nodeModulesDrift,
    verifyCount: params.verifyCount,
  })
  message += renderDirectivesBlock(params.fullRepo)

  if (!isFleet) {
    message += renderContinuityBlock({
      recentHandoffsTruncated: params.recentHandoffs,
      lastHandoff: params.lastHandoff,
      ventureCode: params.venture.code,
    })
  }

  message += renderAlertsBlock({
    p0Issues: params.p0Issues,
    ciAlertsTruncated: params.ciAlerts,
    ciCounts: params.ciCounts,
    activeSessions: params.activeSessions,
    ventureCode: params.venture.code,
  })

  if (!isFleet) {
    message += renderPostAlertFullSections(params)
  }

  message += renderDocAuditBlock({
    healingResults: params.healingResults,
    docAudit: params.docAudit,
    isFleet,
  })

  message += `---\n`
  if (!isFleet) {
    message += `Full documentation index: \`crane_doc_audit()\`\n\n`
  }
  message += `**What would you like to focus on?**\n\n`
  message += `---\n\n`
  message += `**STOP. Do not start any work, explore the codebase, run commands, view PRs, or take any other action until the user responds with their focus.**`

  return applyBudgetCheck(message)
}
