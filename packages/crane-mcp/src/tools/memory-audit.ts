/**
 * crane_memory_audit tool - Memory health report and auto-apply governance
 *
 * Seven checks: inventory, schema gaps, staleness, deprecated-but-surfaced,
 * zero-usage (with surface floor), supersedes-chain integrity, parse-error count.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import type { MemoryUsageStat } from '../lib/crane-api.js'
import { validateAndBuildRecord, fetchAllMemories } from './memory.js'
import type { MemoryRecord } from './memory.js'
import {
  checkInventory,
  checkSchemaGaps,
  checkStaleness,
  checkDeprecatedButSurfaced,
  checkZeroUsage,
  checkSupersedesChain,
  checkParseErrors,
  checkPendingApproval,
  buildFlags,
} from './memory-audit/checks.js'
import { applyAutoChanges } from './memory-audit/auto-apply.js'
import { buildSummary, formatAuditReport } from './memory-audit/report.js'

// Re-export types consumed by callers
export type { MemoryAuditResult, MemoryAuditToolResult } from './memory-audit/types.js'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const memoryAuditInputSchema = z.object({
  auto_apply: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Auto-promote eligible drafts and auto-deprecate zero-usage memories. Default: false (report-only).'
    ),
  stale_threshold_days: z
    .number()
    .optional()
    .default(180)
    .describe('Days before a memory is considered stale. Default: 180.'),
  include_usage: z
    .boolean()
    .optional()
    .default(true)
    .describe('Fetch usage counts from the API for zero-usage check. Default: true.'),
})

export type MemoryAuditInput = z.infer<typeof memoryAuditInputSchema>

// ---------------------------------------------------------------------------
// Usage fetcher
// ---------------------------------------------------------------------------

async function fetchUsage(
  api: CraneApi,
  include: boolean
): Promise<{ map: Map<string, MemoryUsageStat>; available: boolean }> {
  if (include === false) return { map: new Map(), available: false }
  try {
    const stats = await api.getMemoryUsage({ since: '90d' })
    const map = new Map<string, MemoryUsageStat>()
    for (const s of stats) map.set(s.memory_id, s)
    return { map, available: true }
  } catch {
    return { map: new Map(), available: false }
  }
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeMemoryAudit(
  input: MemoryAuditInput
): Promise<{ status: 'success' | 'error'; message: string }> {
  try {
    const parsed = memoryAuditInputSchema.parse(input)
    const result = await runMemoryAudit(parsed)
    return { status: 'success', message: formatAuditReport(result) }
  } catch (error) {
    return {
      status: 'error',
      message: `Memory audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function runMemoryAudit(
  input: MemoryAuditInput
): Promise<import('./memory-audit/types.js').MemoryAuditResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) throw new Error('CRANE_CONTEXT_KEY not set. Cannot access memories.')

  const api = new CraneApi(apiKey, getApiBase())
  const now = new Date()

  const notes = await fetchAllMemories(api, 'memory', 500)
  const records: MemoryRecord[] = notes.map(validateAndBuildRecord)

  const recordById = new Map<string, MemoryRecord>()
  for (const r of records) recordById.set(r.id, r)

  const { map: usageMap, available: usageDataAvailable } = await fetchUsage(
    api,
    input.include_usage !== false
  )

  const inventory = checkInventory(records)
  const schema_gaps = checkSchemaGaps(records)
  const staleness = checkStaleness(records, input.stale_threshold_days ?? 180, now)
  const deprecated_but_surfaced = checkDeprecatedButSurfaced(records, usageMap, usageDataAvailable)
  const zero_usage_candidates = checkZeroUsage(records, usageMap, usageDataAvailable, now)
  const supersedes_chain_issues = checkSupersedesChain(records, recordById)
  const parse_errors = checkParseErrors(records)
  const pending_captain_approval = checkPendingApproval(records, usageMap)

  let promoted: string[] = []
  let deprecated_auto: string[] = []
  let autoFlagged: string[] = []

  if (input.auto_apply) {
    const applied = await applyAutoChanges({
      records,
      recordById,
      schemaGaps: schema_gaps,
      zeroCandidates: zero_usage_candidates,
      api,
      now,
    })
    promoted = applied.promoted
    deprecated_auto = applied.deprecated_auto
    autoFlagged = applied.flagged
  }

  const flagged = [
    ...autoFlagged,
    ...buildFlags({
      schemaGaps: schema_gaps,
      supersedesIssues: supersedes_chain_issues,
      parseErrors: parse_errors,
      deprecatedButSurfaced: deprecated_but_surfaced,
      records,
      now,
    }),
  ]

  const summary = buildSummary({
    inventory,
    gaps: schema_gaps,
    stale: staleness,
    parseErrors: parse_errors,
    promoted,
    deprecatedAuto: deprecated_auto,
    flagged,
  })

  return {
    inventory,
    schema_gaps,
    staleness,
    deprecated_but_surfaced,
    zero_usage_candidates,
    supersedes_chain_issues,
    parse_errors,
    promoted,
    deprecated_auto,
    flagged,
    pending_captain_approval,
    usage_data_available: usageDataAvailable,
    summary,
  }
}
