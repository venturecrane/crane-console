/**
 * Crane Context Worker - Fleet Health Endpoints
 *
 * Plan §C.4. Exposes the fleet_health_findings DAL to:
 *   - the weekly fleet-ops-health GitHub Action (POST ingest)
 *   - the SOS tool (GET findings via relay key)
 *   - the MCP layer (list + resolve)
 *
 *   POST /admin/fleet-health/ingest          — full snapshot ingest (X-Admin-Key)
 *   GET  /fleet-health/findings              — list findings (X-Relay-Key)
 *   GET  /fleet-health/summary               — open counts by severity (X-Relay-Key)
 *   POST /fleet-health/findings/:id/resolve  — manual resolve (X-Relay-Key)
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { verifyAdminKey } from './admin-shared'
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  generateCorrelationId,
} from '../utils'
import { HTTP_STATUS } from '../constants'
import {
  ingestFleetHealth,
  listFleetHealthFindings,
  getFleetHealthSummary,
  manuallyResolveFleetFinding,
} from '../fleet-health'
import type {
  FleetFindingInput,
  FleetFindingSeverity,
  FleetFindingSource,
  FleetFindingStatus,
  FleetHealthIngestRequest,
} from '../fleet-health'

// ============================================================================
// POST /admin/fleet-health/ingest
// ============================================================================

interface IngestBody {
  org?: string
  timestamp?: string
  status?: 'pass' | 'fail'
  /**
   * Source of this snapshot. Defaults to 'github' for back-compat with
   * the existing fleet-ops-health GitHub audit. The Hermes-on-mini host
   * orchestrator posts 'machine' explicitly (#657).
   */
  source?: string
  findings?: Array<{
    repo?: string
    rule?: string
    severity?: string
    message?: string
    extra?: Record<string, unknown>
  }>
}

function validateIngestBody(body: IngestBody): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = []
  if (!body.org) errors.push({ field: 'org', message: 'Required' })
  if (!body.timestamp) errors.push({ field: 'timestamp', message: 'Required ISO8601' })
  if (!body.status || (body.status !== 'pass' && body.status !== 'fail')) {
    errors.push({ field: 'status', message: "Required: 'pass' | 'fail'" })
  }
  if (body.source !== undefined && body.source !== 'github' && body.source !== 'machine') {
    errors.push({ field: 'source', message: "Optional: 'github' | 'machine' (default 'github')" })
  }
  if (!Array.isArray(body.findings)) {
    errors.push({ field: 'findings', message: 'Required array' })
  }
  return errors
}

function normalizeSeverity(raw: string | undefined): FleetFindingSeverity {
  if (raw === 'error' || raw === 'warning' || raw === 'info') return raw
  return 'warning'
}

function normalizeFindings(rawFindings: IngestBody['findings']): FleetFindingInput[] {
  const findings: FleetFindingInput[] = []
  for (const raw of rawFindings || []) {
    if (!raw.repo || !raw.rule || !raw.message) continue
    findings.push({
      repo: raw.repo,
      rule: raw.rule,
      severity: normalizeSeverity(raw.severity),
      message: raw.message,
      extra: raw.extra,
    })
  }
  return findings
}

export async function handleIngestFleetHealth(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    const body = (await request.json()) as IngestBody

    const errors = validateIngestBody(body)
    if (errors.length > 0) {
      return validationErrorResponse(errors, correlationId)
    }

    const req: FleetHealthIngestRequest = {
      org: body.org as string,
      timestamp: body.timestamp as string,
      status: body.status as 'pass' | 'fail',
      source: (body.source as FleetFindingSource | undefined) ?? 'github',
      findings: normalizeFindings(body.findings),
    }

    const result = await ingestFleetHealth(env.DB, req)

    return jsonResponse(
      {
        ok: true,
        org: req.org,
        source: req.source,
        generated_at: result.generated_at,
        inserted: result.inserted,
        updated: result.updated,
        resolved: result.resolved,
        correlation_id: correlationId,
      },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('POST /admin/fleet-health/ingest error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}

// ============================================================================
// GET /fleet-health/findings
// ============================================================================

function coerceFindingStatus(s: string | null): FleetFindingStatus | 'all' {
  if (s === 'all' || s === 'new' || s === 'resolved') return s
  return 'new'
}

function coerceFindingSeverity(s: string | null): FleetFindingSeverity | undefined {
  if (s === 'error' || s === 'warning' || s === 'info') return s
  return undefined
}

function coerceFindingSource(s: string | null): FleetFindingSource | undefined {
  if (s === 'github' || s === 'machine') return s as FleetFindingSource
  return undefined
}

export async function handleListFleetHealthFindings(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const url = new URL(request.url)
    const limitStr = url.searchParams.get('limit')
    const limit = limitStr ? parseInt(limitStr, 10) : undefined

    if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 500)) {
      return errorResponse(
        'limit must be between 1 and 500',
        HTTP_STATUS.BAD_REQUEST,
        context.correlationId
      )
    }

    const findings = await listFleetHealthFindings(env.DB, {
      status: coerceFindingStatus(url.searchParams.get('status')),
      severity: coerceFindingSeverity(url.searchParams.get('severity')),
      source: coerceFindingSource(url.searchParams.get('source')),
      repo_full_name: url.searchParams.get('repo') || undefined,
      finding_type: url.searchParams.get('type') || undefined,
      limit,
    })

    const summary = await getFleetHealthSummary(env.DB)

    return jsonResponse(
      {
        findings,
        total: summary.total_open,
        summary,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /fleet-health/findings error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// GET /fleet-health/summary
// ============================================================================

export async function handleGetFleetHealthSummary(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    const summary = await getFleetHealthSummary(env.DB)
    return jsonResponse(
      { summary, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /fleet-health/summary error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /fleet-health/findings/:id/resolve
// ============================================================================

export async function handleResolveFleetHealthFinding(
  request: Request,
  env: Env,
  findingId: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  try {
    if (!findingId.startsWith('fhf_')) {
      return errorResponse('Invalid finding id', HTTP_STATUS.BAD_REQUEST, context.correlationId)
    }

    const resolved = await manuallyResolveFleetFinding(env.DB, findingId)

    if (!resolved) {
      return jsonResponse(
        {
          ok: false,
          already_resolved: true,
          correlation_id: context.correlationId,
        },
        HTTP_STATUS.OK,
        context.correlationId
      )
    }

    return jsonResponse(
      { ok: true, id: findingId, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /fleet-health/findings/:id/resolve error:', error)
    return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
