/**
 * Crane Context Worker — /verify/audit endpoint (Prong 3)
 *
 * Consumes the verify_ledger built by Prong 1 + 2 and surfaces six week-over-
 * week metrics plus memory-candidate detection. Read-only over the existing
 * tables; uses a singleton cache row in `verify_audit_cache` so the briefing
 * can read cheap summaries without re-running the full computation.
 *
 * Sections:
 *   - coverage_gap            : caller-supplied windowed file list ∩ no-verify-row
 *   - unverified_surface_files: caller-supplied full surface list ∩ no-verify-row-ever
 *   - override_audit          : handoffs.payload_json hits for override flags
 *   - integrity_samples       : N random recent rows + structural integrity checks
 *   - truncation_drift        : rows where output_truncation != none AND output_redacted = 1
 *   - source_distribution     : manual / tool / hook breakdown
 *   - memory_candidates       : recurring (command_hash, repo) tuples for /memory-audit
 *
 * Skip-label audit (skip-eos-gate / skip-verify-gate) was scoped out — those
 * labels live in GitHub PR metadata, not in this DB. Captain runs
 * `gh pr list --search "label:skip-eos-gate is:merged"` per repo for that view.
 *
 * Caching: single-row `verify_audit_cache` table. Reads serve cache when
 * generated_at is within VERIFY_AUDIT_CACHE_TTL_SECONDS unless `?fresh=1`.
 * `?summary=1` returns cached snapshot only (no recomputation), keyed by the
 * briefing path. Writes happen on every full recomputation.
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import {
  HTTP_STATUS,
  VERIFY_AUDIT_MAX_WINDOW_DAYS,
  VERIFY_AUDIT_DEFAULT_MAX_MEMORY_CANDIDATES,
  VERIFY_AUDIT_MAX_MEMORY_CANDIDATES_CAP,
  VERIFY_AUDIT_CACHE_TTL_SECONDS,
} from '../constants'
import {
  type ComputeContext,
  type CoverageGapEntry,
  type UnverifiedSurfaceEntry,
  type OverrideAudit,
  type IntegritySample,
  type TruncationDriftEntry,
  type SourceDistribution,
  type MemoryCandidate,
  computeCoverageGap,
  computeUnverifiedSurfaceFiles,
  computeOverrideAudit,
  computeIntegritySamples,
  computeTruncationDrift,
  computeSourceDistribution,
  computeMemoryCandidates,
  resolveWindowParam,
  parseCSV,
} from './verify-audit-compute.js'

// ============================================================================
// Types
// ============================================================================

interface VerifyAuditPayload {
  window: { days: number; since_iso: string }
  cache: { age_seconds: number; served_from: 'cache' | 'fresh' }
  coverage_gap: CoverageGapEntry[]
  unverified_surface_files: UnverifiedSurfaceEntry[]
  override_audit: OverrideAudit
  integrity_samples: IntegritySample[]
  truncation_drift: TruncationDriftEntry[]
  source_distribution: SourceDistribution
  memory_candidates: MemoryCandidate[]
  memory_candidates_suppressed: number
  generated_at: string
}

// ============================================================================
// Cache helpers
// ============================================================================

const CACHE_ROW_ID = 'singleton'

interface CacheRow {
  generated_at: string
  window_days: number
  payload_json: string
}

async function readCache(env: Env): Promise<CacheRow | null> {
  const result = await env.DB.prepare(
    `SELECT generated_at, window_days, payload_json
     FROM verify_audit_cache
     WHERE id = ?`
  )
    .bind(CACHE_ROW_ID)
    .first<CacheRow>()
  return result ?? null
}

async function writeCache(
  env: Env,
  generatedAt: string,
  windowDays: number,
  payloadJson: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO verify_audit_cache (id, generated_at, window_days, payload_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       generated_at = excluded.generated_at,
       window_days = excluded.window_days,
       payload_json = excluded.payload_json`
  )
    .bind(CACHE_ROW_ID, generatedAt, windowDays, payloadJson)
    .run()
}

function cacheAgeSeconds(generatedAt: string): number {
  const then = new Date(generatedAt).getTime()
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((Date.now() - then) / 1000))
}

// ============================================================================
// Main handler
// ============================================================================

async function handleVerifyAuditSummary(env: Env, correlationId: string): Promise<Response> {
  try {
    const cache = await readCache(env)
    if (!cache) {
      return jsonResponse(
        {
          cache: { age_seconds: -1, served_from: 'cache' as const, never_run: true },
          generated_at: null,
          correlation_id: correlationId,
        },
        HTTP_STATUS.OK,
        correlationId
      )
    }
    const payload = JSON.parse(cache.payload_json) as VerifyAuditPayload
    payload.cache = { age_seconds: cacheAgeSeconds(cache.generated_at), served_from: 'cache' }
    return jsonResponse(
      { ...payload, correlation_id: correlationId },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('GET /verify/audit?summary=1 error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}

interface ParsedAuditParams {
  window: { days: number; sinceISO: string }
  maxMemoryCandidates: number
  files: string[]
  surfaceFiles: string[]
}

/** Parse and validate URL params. Returns null + a Response on validation failure. */
function parseAuditParams(
  url: URL,
  correlationId: string
): { params: ParsedAuditParams; error: null } | { params: null; error: Response } {
  const windowParam = url.searchParams.get('window')
  const window = resolveWindowParam(windowParam)
  if (!window) {
    return {
      params: null,
      error: validationErrorResponse(
        [
          {
            field: 'window',
            message: `Must be a positive integer (days) between 1 and ${VERIFY_AUDIT_MAX_WINDOW_DAYS}; format: "7" or "7d"`,
          },
        ],
        correlationId
      ),
    }
  }
  const maxRaw = url.searchParams.get('max_memory_candidates')
  let maxMemoryCandidates = VERIFY_AUDIT_DEFAULT_MAX_MEMORY_CANDIDATES
  if (maxRaw !== null) {
    const parsed = parseInt(maxRaw, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return {
        params: null,
        error: validationErrorResponse(
          [{ field: 'max_memory_candidates', message: 'Must be a non-negative integer' }],
          correlationId
        ),
      }
    }
    maxMemoryCandidates = Math.min(parsed, VERIFY_AUDIT_MAX_MEMORY_CANDIDATES_CAP)
  }
  return {
    params: {
      window,
      maxMemoryCandidates,
      files: parseCSV(url.searchParams.get('files')),
      surfaceFiles: parseCSV(url.searchParams.get('surface_files')),
    },
    error: null,
  }
}

async function computeAndCacheAudit(
  env: Env,
  p: ParsedAuditParams,
  correlationId: string
): Promise<Response> {
  try {
    const ctx: ComputeContext = {
      env,
      windowDays: p.window.days,
      sinceISO: p.window.sinceISO,
      files: p.files,
      surfaceFiles: p.surfaceFiles,
      maxMemoryCandidates: p.maxMemoryCandidates,
    }
    const [
      coverageGap,
      unverified,
      overrideAudit,
      integritySamples,
      truncationDrift,
      sourceDistribution,
      memCandidatesResult,
    ] = await Promise.all([
      computeCoverageGap(ctx),
      computeUnverifiedSurfaceFiles(ctx),
      computeOverrideAudit(ctx),
      computeIntegritySamples(ctx),
      computeTruncationDrift(ctx),
      computeSourceDistribution(ctx),
      computeMemoryCandidates(ctx),
    ])
    const generatedAt = new Date().toISOString()
    const payload: VerifyAuditPayload = {
      window: { days: p.window.days, since_iso: p.window.sinceISO },
      cache: { age_seconds: 0, served_from: 'fresh' },
      coverage_gap: coverageGap,
      unverified_surface_files: unverified,
      override_audit: overrideAudit,
      integrity_samples: integritySamples,
      truncation_drift: truncationDrift,
      source_distribution: sourceDistribution,
      memory_candidates: memCandidatesResult.candidates,
      memory_candidates_suppressed: memCandidatesResult.suppressed,
      generated_at: generatedAt,
    }
    try {
      await writeCache(env, generatedAt, p.window.days, JSON.stringify(payload))
    } catch (writeErr) {
      console.warn('verify-audit cache write failed (non-fatal):', writeErr)
    }
    return jsonResponse(
      { ...payload, correlation_id: correlationId },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('GET /verify/audit error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}

async function handleVerifyAuditFresh(
  env: Env,
  url: URL,
  correlationId: string,
  useFresh: boolean
): Promise<Response> {
  const { params, error } = parseAuditParams(url, correlationId)
  if (error) return error
  if (!useFresh) {
    try {
      const cache = await readCache(env)
      if (
        cache &&
        cache.window_days === params.window.days &&
        cacheAgeSeconds(cache.generated_at) < VERIFY_AUDIT_CACHE_TTL_SECONDS
      ) {
        const payload = JSON.parse(cache.payload_json) as VerifyAuditPayload
        payload.cache = { age_seconds: cacheAgeSeconds(cache.generated_at), served_from: 'cache' }
        return jsonResponse(
          { ...payload, correlation_id: correlationId },
          HTTP_STATUS.OK,
          correlationId
        )
      }
    } catch (cacheErr) {
      console.warn('verify-audit cache read failed (non-fatal):', cacheErr)
    }
  }
  return computeAndCacheAudit(env, params, correlationId)
}

export async function handleVerifyAudit(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context
  const url = new URL(request.url)
  if (url.searchParams.get('summary') === '1') {
    return handleVerifyAuditSummary(env, context.correlationId)
  }
  return handleVerifyAuditFresh(
    env,
    url,
    context.correlationId,
    url.searchParams.get('fresh') === '1'
  )
}
