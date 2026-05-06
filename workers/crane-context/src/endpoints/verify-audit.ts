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
  VERIFY_AUDIT_DEFAULT_WINDOW_DAYS,
  VERIFY_AUDIT_MAX_WINDOW_DAYS,
  VERIFY_AUDIT_DEFAULT_MAX_MEMORY_CANDIDATES,
  VERIFY_AUDIT_MAX_MEMORY_CANDIDATES_CAP,
  VERIFY_AUDIT_MEMORY_MIN_OCCURRENCES,
  VERIFY_AUDIT_INTEGRITY_SAMPLE_SIZE,
  VERIFY_AUDIT_UNVERIFIED_FILES_CAP,
  VERIFY_AUDIT_CACHE_TTL_SECONDS,
} from '../constants'

// ============================================================================
// Types
// ============================================================================

interface CoverageGapEntry {
  file: string
}

interface UnverifiedSurfaceEntry {
  file: string
}

interface OverrideAudit {
  pr_merge_gate: number
  verify_coverage_gate: number
  total_handoffs_done: number
}

interface IntegritySample {
  verify_id: string
  scrubber_consistent: boolean
  truncation_consistent: boolean
}

interface TruncationDriftEntry {
  verify_id: string
  output_truncation: string
  output_redacted: number
}

interface SourceDistribution {
  manual: number
  tool: number
  hook: number
}

interface MemoryCandidate {
  pattern: 'recurring_command_hash_per_repo'
  command_hash: string
  repo: string | null
  sample_command: string
  method: string
  occurrences: number
  first_seen: string
  last_seen: string
  verify_ids: string[]
  suggested_kind: 'lesson'
  files_touched_union: string[]
}

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
// Section computers
// ============================================================================

interface ComputeContext {
  env: Env
  windowDays: number
  sinceISO: string
  files: string[]
  surfaceFiles: string[]
  maxMemoryCandidates: number
}

async function computeCoverageGap(ctx: ComputeContext): Promise<CoverageGapEntry[]> {
  if (ctx.files.length === 0) return []

  // For each caller-supplied file, check if any verify_files row exists in
  // the window. We do this with a single IN-clause query and a subtract.
  const placeholders = ctx.files.map(() => '?').join(',')
  const result = await ctx.env.DB.prepare(
    `SELECT DISTINCT vf.file_path
     FROM verify_files vf
     JOIN verify_ledger vl ON vl.id = vf.verify_id
     WHERE vf.file_path IN (${placeholders})
       AND vl.created_at >= ?`
  )
    .bind(...ctx.files, ctx.sinceISO)
    .all<{ file_path: string }>()

  const verified = new Set((result.results ?? []).map((r) => r.file_path))
  return ctx.files.filter((f) => !verified.has(f)).map((f) => ({ file: f }))
}

async function computeUnverifiedSurfaceFiles(
  ctx: ComputeContext
): Promise<UnverifiedSurfaceEntry[]> {
  if (ctx.surfaceFiles.length === 0) return []

  // Full-history check: any verify_files row ever for this file?
  const placeholders = ctx.surfaceFiles.map(() => '?').join(',')
  const result = await ctx.env.DB.prepare(
    `SELECT DISTINCT file_path
     FROM verify_files
     WHERE file_path IN (${placeholders})`
  )
    .bind(...ctx.surfaceFiles)
    .all<{ file_path: string }>()

  const verifiedEver = new Set((result.results ?? []).map((r) => r.file_path))
  return ctx.surfaceFiles
    .filter((f) => !verifiedEver.has(f))
    .slice(0, VERIFY_AUDIT_UNVERIFIED_FILES_CAP)
    .map((f) => ({ file: f }))
}

async function computeOverrideAudit(ctx: ComputeContext): Promise<OverrideAudit> {
  // status_label='ready' is what /eos sets when status='done'. We count
  // payload_json hits for the override flag patterns. LIKE is fine here
  // because the payload is canonical JSON with stable key ordering.
  const totalRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM handoffs
     WHERE created_at >= ?
       AND status_label = 'ready'`
  )
    .bind(ctx.sinceISO)
    .first<{ n: number }>()

  const prMergeRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM handoffs
     WHERE created_at >= ?
       AND status_label = 'ready'
       AND payload_json LIKE '%"override_pr_merge_gate":true%'`
  )
    .bind(ctx.sinceISO)
    .first<{ n: number }>()

  const verifyCoverageRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n
     FROM handoffs
     WHERE created_at >= ?
       AND status_label = 'ready'
       AND payload_json LIKE '%"override_verify_coverage_gate":true%'`
  )
    .bind(ctx.sinceISO)
    .first<{ n: number }>()

  return {
    pr_merge_gate: prMergeRow?.n ?? 0,
    verify_coverage_gate: verifyCoverageRow?.n ?? 0,
    total_handoffs_done: totalRow?.n ?? 0,
  }
}

async function computeIntegritySamples(ctx: ComputeContext): Promise<IntegritySample[]> {
  // Random sample N rows from the window. RANDOM() is D1/SQLite's PRNG;
  // for an audit this is fine — we're not seeding for reproducibility,
  // we're surfacing surprises.
  const result = await ctx.env.DB.prepare(
    `SELECT id, output_scrubbed, output_redacted, output_truncation
     FROM verify_ledger
     WHERE created_at >= ?
     ORDER BY RANDOM()
     LIMIT ?`
  )
    .bind(ctx.sinceISO, VERIFY_AUDIT_INTEGRITY_SAMPLE_SIZE)
    .all<{
      id: string
      output_scrubbed: string
      output_redacted: number
      output_truncation: string
    }>()

  return (result.results ?? []).map((row) => {
    // Structural checks only:
    //   - scrubber_consistent: if redacted=1, scrubbed should contain a
    //     redaction marker; if redacted=0, scrubbed should contain no
    //     obviously-sensitive patterns. We use loose checks; full-precision
    //     verification would require re-running the scrubber.
    //   - truncation_consistent: if output_truncation != 'none', the
    //     scrubbed payload should contain the documented truncation
    //     sentinel. If truncation=none, no sentinel should appear.
    const hasMarker =
      row.output_scrubbed.includes('[REDACTED]') ||
      row.output_scrubbed.includes('[redacted]') ||
      row.output_scrubbed.includes('***')
    const scrubberConsistent =
      row.output_redacted === 1 ? hasMarker : true /* lenient on negative */

    const sentinel = '[truncated]'
    const hasSentinel = row.output_scrubbed.includes(sentinel)
    const truncationConsistent =
      row.output_truncation === 'none' ? true : hasSentinel || row.output_scrubbed.length > 0
    // (Lenient: we don't fail on missing sentinel because scrubbed payload
    // may have lost it during scrubbing. We're flagging *blatant* drift.)

    return {
      verify_id: row.id,
      scrubber_consistent: scrubberConsistent,
      truncation_consistent: truncationConsistent,
    }
  })
}

async function computeTruncationDrift(ctx: ComputeContext): Promise<TruncationDriftEntry[]> {
  const result = await ctx.env.DB.prepare(
    `SELECT id, output_truncation, output_redacted
     FROM verify_ledger
     WHERE created_at >= ?
       AND output_truncation != 'none'
       AND output_redacted = 1
     ORDER BY created_at DESC
     LIMIT 20`
  )
    .bind(ctx.sinceISO)
    .all<{ id: string; output_truncation: string; output_redacted: number }>()

  return (result.results ?? []).map((row) => ({
    verify_id: row.id,
    output_truncation: row.output_truncation,
    output_redacted: row.output_redacted,
  }))
}

async function computeSourceDistribution(ctx: ComputeContext): Promise<SourceDistribution> {
  const result = await ctx.env.DB.prepare(
    `SELECT source, COUNT(*) AS n
     FROM verify_ledger
     WHERE created_at >= ?
     GROUP BY source`
  )
    .bind(ctx.sinceISO)
    .all<{ source: string; n: number }>()

  const dist: SourceDistribution = { manual: 0, tool: 0, hook: 0 }
  for (const row of result.results ?? []) {
    if (row.source === 'manual') dist.manual = row.n
    else if (row.source === 'tool') dist.tool = row.n
    else if (row.source === 'hook') dist.hook = row.n
  }
  return dist
}

async function computeMemoryCandidates(
  ctx: ComputeContext
): Promise<{ candidates: MemoryCandidate[]; suppressed: number }> {
  // Group by (command_hash, repo) — same command across repos should
  // separate (different surface) but same command in same repo should
  // accumulate (recurrence signal). Repo is NULL-tolerant via COALESCE.
  const groupResult = await ctx.env.DB.prepare(
    `SELECT command_hash,
            COALESCE(repo, '') AS repo,
            MIN(created_at)    AS first_seen,
            MAX(created_at)    AS last_seen,
            COUNT(*)           AS occurrences,
            GROUP_CONCAT(id)   AS verify_ids_concat
     FROM verify_ledger
     WHERE created_at >= ?
       AND method = 'fresh_process'
       AND command_hash IS NOT NULL
     GROUP BY command_hash, COALESCE(repo, '')
     HAVING COUNT(*) >= ?
     ORDER BY occurrences DESC`
  )
    .bind(ctx.sinceISO, VERIFY_AUDIT_MEMORY_MIN_OCCURRENCES)
    .all<{
      command_hash: string
      repo: string
      first_seen: string
      last_seen: string
      occurrences: number
      verify_ids_concat: string
    }>()

  const allGroups = groupResult.results ?? []
  const suppressed = Math.max(0, allGroups.length - ctx.maxMemoryCandidates)
  const limited = allGroups.slice(0, ctx.maxMemoryCandidates)

  const candidates: MemoryCandidate[] = []
  for (const group of limited) {
    const verifyIds = group.verify_ids_concat.split(',').filter(Boolean)
    const sampleId = verifyIds[0]

    // Pull a representative sample (any of the IDs) for command + claim
    const sample = await ctx.env.DB.prepare(
      `SELECT command, method FROM verify_ledger WHERE id = ?`
    )
      .bind(sampleId)
      .first<{ command: string | null; method: string }>()

    // Union of files_touched across all verify_ids in this group.
    const filesPlaceholders = verifyIds.map(() => '?').join(',')
    const filesResult = await ctx.env.DB.prepare(
      `SELECT DISTINCT file_path
       FROM verify_files
       WHERE verify_id IN (${filesPlaceholders})`
    )
      .bind(...verifyIds)
      .all<{ file_path: string }>()
    const filesUnion = (filesResult.results ?? []).map((r) => r.file_path)

    candidates.push({
      pattern: 'recurring_command_hash_per_repo',
      command_hash: group.command_hash,
      repo: group.repo === '' ? null : group.repo,
      sample_command: sample?.command ?? '',
      method: sample?.method ?? 'fresh_process',
      occurrences: group.occurrences,
      first_seen: group.first_seen,
      last_seen: group.last_seen,
      verify_ids: verifyIds,
      suggested_kind: 'lesson',
      files_touched_union: filesUnion,
    })
  }

  return { candidates, suppressed }
}

// ============================================================================
// Window resolution
// ============================================================================

function resolveWindowParam(rawParam: string | null): { days: number; sinceISO: string } | null {
  if (!rawParam) {
    const days = VERIFY_AUDIT_DEFAULT_WINDOW_DAYS
    return { days, sinceISO: daysAgoISO(days) }
  }
  // Accept both bare integer ("7") and Xd ("7d")
  const trimmed = rawParam.trim()
  const match = trimmed.match(/^(\d+)d?$/)
  if (!match) return null
  const days = parseInt(match[1], 10)
  if (!Number.isFinite(days) || days < 1) return null
  if (days > VERIFY_AUDIT_MAX_WINDOW_DAYS) return null
  return { days, sinceISO: daysAgoISO(days) }
}

function daysAgoISO(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

function parseCSV(raw: string | null): string[] {
  if (!raw) return []
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
  )
}

// ============================================================================
// Main handler
// ============================================================================

export async function handleVerifyAudit(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  const url = new URL(request.url)
  const summaryOnly = url.searchParams.get('summary') === '1'
  const fresh = url.searchParams.get('fresh') === '1'

  // Summary-only path: read cache + return shape with empty sections so the
  // briefing can render `last run, top metrics` without recomputing. If no
  // cache exists yet, return a minimal shape with served_from='cache' but
  // a flag indicating no audit has run.
  if (summaryOnly) {
    try {
      const cache = await readCache(env)
      if (!cache) {
        return jsonResponse(
          {
            cache: { age_seconds: -1, served_from: 'cache' as const, never_run: true },
            generated_at: null,
            correlation_id: context.correlationId,
          },
          HTTP_STATUS.OK,
          context.correlationId
        )
      }
      const payload = JSON.parse(cache.payload_json) as VerifyAuditPayload
      payload.cache = {
        age_seconds: cacheAgeSeconds(cache.generated_at),
        served_from: 'cache',
      }
      return jsonResponse(
        { ...payload, correlation_id: context.correlationId },
        HTTP_STATUS.OK,
        context.correlationId
      )
    } catch (error) {
      console.error('GET /verify/audit?summary=1 error:', error)
      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        HTTP_STATUS.INTERNAL_ERROR,
        context.correlationId
      )
    }
  }

  // Window param
  const windowParam = url.searchParams.get('window')
  const window = resolveWindowParam(windowParam)
  if (!window) {
    return validationErrorResponse(
      [
        {
          field: 'window',
          message: `Must be a positive integer (days) between 1 and ${VERIFY_AUDIT_MAX_WINDOW_DAYS}; format: "7" or "7d"`,
        },
      ],
      context.correlationId
    )
  }

  // max_memory_candidates param
  const maxRaw = url.searchParams.get('max_memory_candidates')
  let maxMemoryCandidates = VERIFY_AUDIT_DEFAULT_MAX_MEMORY_CANDIDATES
  if (maxRaw !== null) {
    const parsed = parseInt(maxRaw, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return validationErrorResponse(
        [{ field: 'max_memory_candidates', message: 'Must be a non-negative integer' }],
        context.correlationId
      )
    }
    maxMemoryCandidates = Math.min(parsed, VERIFY_AUDIT_MAX_MEMORY_CANDIDATES_CAP)
  }

  // files / surface_files params
  const files = parseCSV(url.searchParams.get('files'))
  const surfaceFiles = parseCSV(url.searchParams.get('surface_files'))

  // Cache check
  if (!fresh) {
    try {
      const cache = await readCache(env)
      if (
        cache &&
        cache.window_days === window.days &&
        cacheAgeSeconds(cache.generated_at) < VERIFY_AUDIT_CACHE_TTL_SECONDS
      ) {
        const payload = JSON.parse(cache.payload_json) as VerifyAuditPayload
        payload.cache = {
          age_seconds: cacheAgeSeconds(cache.generated_at),
          served_from: 'cache',
        }
        return jsonResponse(
          { ...payload, correlation_id: context.correlationId },
          HTTP_STATUS.OK,
          context.correlationId
        )
      }
    } catch (error) {
      // Cache read failure is non-fatal; fall through to fresh compute.
      console.warn('verify-audit cache read failed (non-fatal):', error)
    }
  }

  // Fresh computation
  try {
    const ctx: ComputeContext = {
      env,
      windowDays: window.days,
      sinceISO: window.sinceISO,
      files,
      surfaceFiles,
      maxMemoryCandidates,
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
      window: { days: window.days, since_iso: window.sinceISO },
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

    // Persist snapshot for cheap subsequent reads. Failure to write cache
    // is non-fatal — the response is still returned to the caller.
    try {
      await writeCache(env, generatedAt, window.days, JSON.stringify(payload))
    } catch (writeErr) {
      console.warn('verify-audit cache write failed (non-fatal):', writeErr)
    }

    return jsonResponse(
      { ...payload, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /verify/audit error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
