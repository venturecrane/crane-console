/**
 * Crane Context API client
 *
 * This file is the public surface. It re-exports all types from the split
 * type files and extends CraneApiBase with telemetry, notification,
 * verification, deploy-heartbeat, and fleet-health methods.
 */

import { CraneApiSchedule } from './crane-api-schedule.js'
import { parseApiError } from './api-error.js'
import {
  GetSkillUsageResponseSchema,
  GetMemoryUsageResponseSchema,
} from './crane-api-extended-types.js'
import type {
  QueryHandoffsParams,
  QueryHandoffsResponse,
  HandoffRecord,
  HandoffRequest,
} from './crane-api-types.js'
import type {
  RecordSkillInvocationRequest,
  SkillInvocationRecord,
  RecordSkillInvocationResponse,
  GetSkillUsageParams,
  SkillUsageStat,
  RecordMemoryInvocationRequest,
  MemoryInvocationRecord,
  RecordMemoryInvocationResponse,
  GetMemoryUsageParams,
  MemoryUsageStat,
  NotificationCountsParams,
  NotificationCountsResponse,
  ListNotificationsParams,
  ListNotificationsResponse,
  UpdateNotificationStatusResponse,
  RecordVerificationRequest,
  VerificationRecord,
  RecordVerificationResponse,
  GetClaimOriginParams,
  GetClaimOriginResponse,
  GetVerifySessionCountResponse,
  VerifyLookupResponse,
  GetVerifyAuditParams,
  VerifyAuditResponse,
  DeployHeartbeatsResponse,
  FleetFindingStatus,
  FleetFindingSeverity,
  FleetFindingSource,
  FleetHealthFindingsResponse,
  FleetHealthSummary,
} from './crane-api-extended-types.js'

// Barrel re-exports — all callers import from 'crane-api.js' and continue to work
export * from './crane-api-types.js'
export * from './crane-api-extended-types.js'
export { CraneApiBase, _clearVenturesCacheForTests } from './crane-api-base.js'
export { CraneApiSchedule } from './crane-api-schedule.js'

// ============================================================================
// CraneApi — extends CraneApiSchedule with telemetry, notification,
//             verification, deploy-heartbeat, and fleet-health methods.
// ============================================================================

export class CraneApi extends CraneApiSchedule {
  // ============================================================================
  // Handoff / EOS
  // ============================================================================

  async createHandoff(handoff: HandoffRequest): Promise<void> {
    const response = await fetch(`${this.apiBase}/eos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify({
        schema_version: '1.0',
        agent: handoff.agent,
        venture: handoff.venture,
        repo: handoff.repo,
        session_id: handoff.session_id,
        summary: handoff.summary,
        status_label: handoff.status,
        issue_number: handoff.issue_number,
        last_activity_at: handoff.last_activity_at,
        payload: handoff.payload ?? {},
        keep_session_open: handoff.keep_session_open,
      }),
    })

    if (!response.ok) {
      throw await parseApiError(response, '/eos')
    }
  }

  async queryHandoffs(params: QueryHandoffsParams): Promise<QueryHandoffsResponse> {
    const queryParts: string[] = [
      `venture=${encodeURIComponent(params.venture)}`,
      `repo=${encodeURIComponent(params.repo)}`,
    ]
    if (params.track !== undefined) queryParts.push(`track=${params.track}`)
    if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`)

    const response = await fetch(`${this.apiBase}/handoffs?${queryParts.join('&')}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Query handoffs failed (${response.status}): ${text}`)
    }

    return (await response.json()) as QueryHandoffsResponse
  }

  async updateHandoffStatus(
    handoffId: string,
    statusLabel: string
  ): Promise<{ handoff: HandoffRecord }> {
    const response = await fetch(
      `${this.apiBase}/handoffs/${encodeURIComponent(handoffId)}/status`,
      {
        method: 'POST',
        headers: {
          'X-Relay-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status_label: statusLabel }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Update handoff status failed (${response.status}): ${text}`)
    }

    return (await response.json()) as { handoff: HandoffRecord }
  }

  // ============================================================================
  // Skill Invocation Telemetry
  // ============================================================================

  async recordSkillInvocation(
    params: RecordSkillInvocationRequest
  ): Promise<SkillInvocationRecord> {
    const response = await fetch(`${this.apiBase}/skills/invocations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Record skill invocation failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as RecordSkillInvocationResponse
    return data.invocation
  }

  async getSkillUsage(params: GetSkillUsageParams = {}): Promise<SkillUsageStat[]> {
    const queryParts: string[] = []
    if (params.since) queryParts.push(`since=${encodeURIComponent(params.since)}`)
    if (params.skill_name) queryParts.push(`skill_name=${encodeURIComponent(params.skill_name)}`)

    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

    const response = await fetch(`${this.apiBase}/skills/usage${qs}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Get skill usage failed (${response.status})`)
    }

    const raw = await response.json()
    const data = GetSkillUsageResponseSchema.parse(raw)
    return data.stats
  }

  // ============================================================================
  // Memory Invocation Telemetry
  // ============================================================================

  async recordMemoryInvocation(
    params: RecordMemoryInvocationRequest
  ): Promise<MemoryInvocationRecord> {
    const response = await fetch(`${this.apiBase}/memory/invocations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Record memory invocation failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as RecordMemoryInvocationResponse
    return data.invocation
  }

  async getMemoryUsage(params: GetMemoryUsageParams = {}): Promise<MemoryUsageStat[]> {
    const queryParts: string[] = []
    if (params.since) queryParts.push(`since=${encodeURIComponent(params.since)}`)
    if (params.memory_id) queryParts.push(`memory_id=${encodeURIComponent(params.memory_id)}`)

    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

    const response = await fetch(`${this.apiBase}/memory/invocations/all${qs}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Get memory usage failed (${response.status})`)
    }

    const raw = await response.json()
    const data = GetMemoryUsageResponseSchema.parse(raw)
    return data.stats
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  /**
   * Get TRUE notification counts (not paginated). Plan §B.3 - the missing
   * endpoint that fixes the loudest defect (SOS displaying "10 unresolved"
   * when DB has 270).
   */
  async getNotificationCounts(
    params: NotificationCountsParams = {}
  ): Promise<NotificationCountsResponse> {
    const queryParts: string[] = []
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`)
    if (params.severity) queryParts.push(`severity=${encodeURIComponent(params.severity)}`)
    if (params.venture) queryParts.push(`venture=${encodeURIComponent(params.venture)}`)
    if (params.repo) queryParts.push(`repo=${encodeURIComponent(params.repo)}`)
    if (params.source) queryParts.push(`source=${encodeURIComponent(params.source)}`)
    if (params.group_by) queryParts.push(`group_by=${encodeURIComponent(params.group_by)}`)
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

    const response = await fetch(`${this.apiBase}/notifications/counts${qs}`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })

    if (!response.ok) {
      throw new Error(`Notification counts API error: ${response.status}`)
    }

    return (await response.json()) as NotificationCountsResponse
  }

  async listNotifications(
    params: ListNotificationsParams = {}
  ): Promise<ListNotificationsResponse> {
    const queryParts: string[] = []
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`)
    if (params.severity) queryParts.push(`severity=${encodeURIComponent(params.severity)}`)
    if (params.venture) queryParts.push(`venture=${encodeURIComponent(params.venture)}`)
    if (params.repo) queryParts.push(`repo=${encodeURIComponent(params.repo)}`)
    if (params.source) queryParts.push(`source=${encodeURIComponent(params.source)}`)
    if (params.limit) queryParts.push(`limit=${params.limit}`)
    if (params.cursor) queryParts.push(`cursor=${encodeURIComponent(params.cursor)}`)

    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

    const response = await fetch(`${this.apiBase}/notifications${qs}`, {
      headers: {
        'X-Relay-Key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return (await response.json()) as ListNotificationsResponse
  }

  async updateNotificationStatus(
    id: string,
    status: 'acked' | 'resolved'
  ): Promise<UpdateNotificationStatusResponse> {
    const response = await fetch(`${this.apiBase}/notifications/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Update notification status failed (${response.status}): ${text}`)
    }

    return (await response.json()) as UpdateNotificationStatusResponse
  }

  // ============================================================================
  // Verification Ledger (crane_verify)
  // ============================================================================

  async recordVerification(params: RecordVerificationRequest): Promise<VerificationRecord> {
    const response = await fetch(`${this.apiBase}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Record verification failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as RecordVerificationResponse
    return data.verify
  }

  async getClaimOrigin(params: GetClaimOriginParams): Promise<GetClaimOriginResponse> {
    const queryParts: string[] = [`file=${encodeURIComponent(params.file)}`]
    if (params.since) queryParts.push(`since=${encodeURIComponent(params.since)}`)
    if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`)

    const response = await fetch(`${this.apiBase}/verify/origin?${queryParts.join('&')}`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Get claim origin failed (${response.status}): ${text}`)
    }

    return (await response.json()) as GetClaimOriginResponse
  }

  async getVerifySessionCount(sessionId: string): Promise<number> {
    const response = await fetch(
      `${this.apiBase}/verify/session-count?session_id=${encodeURIComponent(sessionId)}`,
      {
        headers: { 'X-Relay-Key': this.apiKey },
      }
    )

    if (!response.ok) {
      // Best-effort: SOS shouldn't fail because of a count query.
      return 0
    }

    const data = (await response.json()) as GetVerifySessionCountResponse
    return data.count
  }

  async lookupVerifyIds(ids: string[]): Promise<Record<string, boolean>> {
    if (ids.length === 0) return {}

    const idsParam = ids.map((s) => encodeURIComponent(s)).join(',')
    const response = await fetch(`${this.apiBase}/verify/lookup?ids=${idsParam}`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Verify lookup failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as VerifyLookupResponse
    return data.exists
  }

  async getVerifyAudit(params: GetVerifyAuditParams = {}): Promise<VerifyAuditResponse> {
    const queryParts: string[] = []
    if (params.window !== undefined) {
      queryParts.push(`window=${encodeURIComponent(String(params.window))}`)
    }
    if (params.files && params.files.length > 0) {
      queryParts.push(`files=${params.files.map((f) => encodeURIComponent(f)).join(',')}`)
    }
    if (params.surfaceFiles && params.surfaceFiles.length > 0) {
      queryParts.push(
        `surface_files=${params.surfaceFiles.map((f) => encodeURIComponent(f)).join(',')}`
      )
    }
    if (params.maxMemoryCandidates !== undefined) {
      queryParts.push(`max_memory_candidates=${params.maxMemoryCandidates}`)
    }
    if (params.fresh) queryParts.push('fresh=1')
    if (params.summary) queryParts.push('summary=1')

    const url =
      `${this.apiBase}/verify/audit` + (queryParts.length > 0 ? `?${queryParts.join('&')}` : '')

    const response = await fetch(url, {
      headers: { 'X-Relay-Key': this.apiKey },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Verify audit failed (${response.status}): ${text}`)
    }

    return (await response.json()) as VerifyAuditResponse
  }

  // ============================================================================
  // Deploy heartbeats (Plan §B.6 — defect: cold deploy detector)
  // ============================================================================

  async getDeployHeartbeats(venture: string): Promise<DeployHeartbeatsResponse> {
    const response = await fetch(
      `${this.apiBase}/deploy-heartbeats?venture=${encodeURIComponent(venture)}`,
      {
        headers: { 'X-Relay-Key': this.apiKey },
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Deploy heartbeats failed (${response.status}): ${text}`)
    }
    return (await response.json()) as DeployHeartbeatsResponse
  }

  async suppressDeployHeartbeat(params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
    reason: string
    until?: string | null
  }): Promise<void> {
    const response = await fetch(`${this.apiBase}/deploy-heartbeats/suppress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Suppress heartbeat failed (${response.status}): ${text}`)
    }
  }

  async unsuppressDeployHeartbeat(params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
  }): Promise<void> {
    const response = await fetch(`${this.apiBase}/deploy-heartbeats/unsuppress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Unsuppress heartbeat failed (${response.status}): ${text}`)
    }
  }

  async seedDeployHeartbeat(params: {
    venture: string
    repo_full_name: string
    workflow_id: number
    branch?: string
    cold_threshold_days?: number
  }): Promise<void> {
    const response = await fetch(`${this.apiBase}/deploy-heartbeats/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Seed heartbeat failed (${response.status}): ${text}`)
    }
  }

  // ============================================================================
  // Fleet health findings (Plan §C.4)
  // ============================================================================

  /**
   * List fleet health findings. Defaults to open findings, newest first.
   */
  async getFleetHealthFindings(
    opts: {
      status?: FleetFindingStatus | 'all'
      severity?: FleetFindingSeverity
      source?: FleetFindingSource
      repo?: string
      type?: string
      limit?: number
    } = {}
  ): Promise<FleetHealthFindingsResponse> {
    const params = new URLSearchParams()
    if (opts.status) params.set('status', opts.status)
    if (opts.severity) params.set('severity', opts.severity)
    if (opts.source) params.set('source', opts.source)
    if (opts.repo) params.set('repo', opts.repo)
    if (opts.type) params.set('type', opts.type)
    if (opts.limit !== undefined) params.set('limit', String(opts.limit))

    const qs = params.toString()
    const url = `${this.apiBase}/fleet-health/findings${qs ? `?${qs}` : ''}`

    const response = await fetch(url, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Fleet health findings failed (${response.status}): ${text}`)
    }
    return (await response.json()) as FleetHealthFindingsResponse
  }

  /**
   * Summary counts only — used by System Health check and SOS header.
   */
  async getFleetHealthSummary(): Promise<{ summary: FleetHealthSummary }> {
    const response = await fetch(`${this.apiBase}/fleet-health/summary`, {
      headers: { 'X-Relay-Key': this.apiKey },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Fleet health summary failed (${response.status}): ${text}`)
    }
    return (await response.json()) as { summary: FleetHealthSummary }
  }

  /**
   * Manually resolve a finding (Captain triaged it out of band).
   */
  async resolveFleetHealthFinding(
    findingId: string
  ): Promise<{ ok: boolean; already_resolved?: boolean }> {
    const response = await fetch(
      `${this.apiBase}/fleet-health/findings/${encodeURIComponent(findingId)}/resolve`,
      {
        method: 'POST',
        headers: { 'X-Relay-Key': this.apiKey },
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Resolve fleet finding failed (${response.status}): ${text}`)
    }
    return (await response.json()) as { ok: boolean; already_resolved?: boolean }
  }
}
