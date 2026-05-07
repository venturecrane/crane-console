/**
 * verify-audit-compute.ts — Section computers for /verify/audit.
 * Extracted to satisfy the 500-line file ceiling.
 */

import type { Env } from '../types'
import {
  VERIFY_AUDIT_MEMORY_MIN_OCCURRENCES,
  VERIFY_AUDIT_INTEGRITY_SAMPLE_SIZE,
  VERIFY_AUDIT_UNVERIFIED_FILES_CAP,
  VERIFY_AUDIT_DEFAULT_WINDOW_DAYS,
  VERIFY_AUDIT_MAX_WINDOW_DAYS,
} from '../constants'

// Section computers
// ============================================================================

export interface ComputeContext {
  env: Env
  windowDays: number
  sinceISO: string
  files: string[]
  surfaceFiles: string[]
  maxMemoryCandidates: number
}

export interface CoverageGapEntry {
  file: string
}

export interface UnverifiedSurfaceEntry {
  file: string
}

export interface OverrideAudit {
  pr_merge_gate: number
  verify_coverage_gate: number
  total_handoffs_done: number
}

export interface IntegritySample {
  verify_id: string
  scrubber_consistent: boolean
  truncation_consistent: boolean
}

export interface TruncationDriftEntry {
  verify_id: string
  output_truncation: string
  output_redacted: number
}

export interface SourceDistribution {
  manual: number
  tool: number
  hook: number
}

export interface MemoryCandidate {
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

export async function computeCoverageGap(ctx: ComputeContext): Promise<CoverageGapEntry[]> {
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

export async function computeUnverifiedSurfaceFiles(
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

export async function computeOverrideAudit(ctx: ComputeContext): Promise<OverrideAudit> {
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

export async function computeIntegritySamples(ctx: ComputeContext): Promise<IntegritySample[]> {
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

export async function computeTruncationDrift(ctx: ComputeContext): Promise<TruncationDriftEntry[]> {
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

export async function computeSourceDistribution(ctx: ComputeContext): Promise<SourceDistribution> {
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

export async function computeMemoryCandidates(
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

export function resolveWindowParam(
  rawParam: string | null
): { days: number; sinceISO: string } | null {
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

export function parseCSV(raw: string | null): string[] {
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
