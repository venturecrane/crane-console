/**
 * The seven audit check functions for crane_memory_audit.
 */

import { existsSync } from 'node:fs'
import type { MemoryUsageStat } from '../../lib/crane-api.js'
import { parseFrontmatter } from '../memory.js'
import type { MemoryRecord } from '../memory.js'
import type {
  InventoryStats,
  SchemaGap,
  StalenessEntry,
  DeprecatedButSurfaced,
  ZeroUsageEntry,
  SupersedesChainIssue,
  ParseErrorEntry,
  PendingApproval,
} from './types.js'

export const REQUIRED_FIELDS = ['name', 'description', 'kind', 'scope', 'status'] as const

export function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(isoDate)
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

// Check 1: Inventory
export function checkInventory(records: MemoryRecord[]): InventoryStats {
  const inventory: InventoryStats = {
    total: records.length,
    by_kind: {},
    by_scope: {},
    by_status: {},
    by_owner: {},
    captain_approved: 0,
  }

  for (const r of records) {
    const fm = r.frontmatter
    const kind = fm.kind || 'unknown'
    const scope = fm.scope || 'unknown'
    const status = fm.status || 'unknown'
    const owner = fm.owner || 'unknown'

    inventory.by_kind[kind] = (inventory.by_kind[kind] ?? 0) + 1
    inventory.by_scope[scope] = (inventory.by_scope[scope] ?? 0) + 1
    inventory.by_status[status] = (inventory.by_status[status] ?? 0) + 1
    inventory.by_owner[owner] = (inventory.by_owner[owner] ?? 0) + 1
    if (fm.captain_approved) inventory.captain_approved++
  }

  return inventory
}

// Check 2: Schema gaps
export function checkSchemaGaps(records: MemoryRecord[]): SchemaGap[] {
  const gaps: SchemaGap[] = []
  for (const r of records) {
    if (r.parse_error) continue
    const fm = parseFrontmatter(r.raw_content ?? '')
    const missing = REQUIRED_FIELDS.filter((f) => !fm[f])
    if (missing.length > 0) {
      gaps.push({ id: r.id, name: r.frontmatter.name, missing_fields: [...missing] })
    }
  }
  return gaps
}

// Check 3: Staleness
export function checkStaleness(
  records: MemoryRecord[],
  staleThreshold: number,
  now: Date
): StalenessEntry[] {
  const stale: StalenessEntry[] = []
  for (const r of records) {
    if (r.parse_error) continue
    if (r.frontmatter.kind === 'incident') continue

    const daysSinceUpdate = daysSince(r.updated_at, now)
    const lastValidated = r.frontmatter.last_validated_on
    const daysSinceValidated = lastValidated ? daysSince(lastValidated, now) : null

    const updateStale = daysSinceUpdate > staleThreshold
    const validationStale = daysSinceValidated === null || daysSinceValidated > staleThreshold

    if (updateStale && validationStale) {
      stale.push({
        id: r.id,
        name: r.frontmatter.name,
        kind: r.frontmatter.kind,
        days_since_update: daysSinceUpdate,
        days_since_validated: daysSinceValidated,
      })
    }
  }
  return stale
}

// Check 4: Deprecated-but-surfaced
export function checkDeprecatedButSurfaced(
  records: MemoryRecord[],
  usageMap: Map<string, MemoryUsageStat>,
  usageDataAvailable: boolean
): DeprecatedButSurfaced[] {
  if (!usageDataAvailable) return []
  const result: DeprecatedButSurfaced[] = []
  for (const r of records) {
    if (r.frontmatter.status !== 'deprecated') continue
    const usage = usageMap.get(r.id)
    if (usage && (usage.total_surfaced > 0 || usage.total_cited > 0)) {
      result.push({
        id: r.id,
        name: r.frontmatter.name,
        reason: `Deprecated memory has usage: surfaced=${usage.total_surfaced}, cited=${usage.total_cited}. Recall code may have a bug.`,
      })
    }
  }
  return result
}

// Check 5: Zero-usage candidates
export function checkZeroUsage(
  records: MemoryRecord[],
  usageMap: Map<string, MemoryUsageStat>,
  usageDataAvailable: boolean,
  now: Date
): ZeroUsageEntry[] {
  if (!usageDataAvailable) return []
  const candidates: ZeroUsageEntry[] = []
  for (const r of records) {
    if (r.frontmatter.status !== 'stable') continue
    if (r.parse_error) continue

    const usage = usageMap.get(r.id)
    const surfacedCount = usage?.total_surfaced ?? 0
    const citedCount = usage?.total_cited ?? 0
    const createdDaysAgo = daysSince(r.created_at, now)

    if (citedCount === 0 && surfacedCount >= 10 && createdDaysAgo > 30) {
      candidates.push({
        id: r.id,
        name: r.frontmatter.name,
        kind: r.frontmatter.kind,
        surfaced_count: surfacedCount,
        cited_count: citedCount,
        created_days_ago: createdDaysAgo,
      })
    }
  }
  return candidates
}

function resolveSourcePath(srcPath: string): string | null {
  if (!srcPath.startsWith('~') && !srcPath.startsWith('/')) return null
  return srcPath.startsWith('~/') ? srcPath.replace('~', process.env.HOME || '') : srcPath
}

// Check 6: Supersedes-chain integrity
export function checkSupersedesChain(
  records: MemoryRecord[],
  recordById: Map<string, MemoryRecord>
): SupersedesChainIssue[] {
  const issues: SupersedesChainIssue[] = []
  for (const r of records) {
    if (r.parse_error) continue
    const fm = r.frontmatter

    for (const supersededId of fm.supersedes ?? []) {
      if (!recordById.has(supersededId)) {
        issues.push({
          id: r.id,
          name: fm.name,
          issue: `supersedes ID "${supersededId}" not found in memory corpus`,
        })
      }
    }

    for (const srcPath of fm.supersedes_source ?? []) {
      const resolved = resolveSourcePath(srcPath)
      if (resolved !== null && !existsSync(resolved)) {
        issues.push({
          id: r.id,
          name: fm.name,
          issue: `supersedes_source path not found on disk: ${srcPath}`,
        })
      }
    }
  }
  return issues
}

// Check 7: Parse errors
export function checkParseErrors(records: MemoryRecord[]): ParseErrorEntry[] {
  return records
    .filter((r) => r.parse_error)
    .map((r) => ({ id: r.id, raw_name: r.frontmatter.name }))
}

// Pending captain approval
export function checkPendingApproval(
  records: MemoryRecord[],
  usageMap: Map<string, MemoryUsageStat>
): PendingApproval[] {
  const pending: PendingApproval[] = []
  for (const r of records) {
    if (r.frontmatter.status !== 'stable') continue
    if (r.frontmatter.captain_approved) continue
    if (r.parse_error) continue

    const usage = usageMap.get(r.id)
    pending.push({
      id: r.id,
      name: r.frontmatter.name,
      kind: r.frontmatter.kind,
      scope: r.frontmatter.scope,
      surfaced_count: usage?.total_surfaced ?? 0,
      cited_count: usage?.total_cited ?? 0,
      created_at: r.created_at,
    })
  }
  return pending
}

export interface BuildFlagsInput {
  schemaGaps: SchemaGap[]
  supersedesIssues: SupersedesChainIssue[]
  parseErrors: ParseErrorEntry[]
  deprecatedButSurfaced: DeprecatedButSurfaced[]
  records: MemoryRecord[]
  now: Date
}

// Flag builder — collects captain-action items from check results
export function buildFlags({
  schemaGaps,
  supersedesIssues,
  parseErrors,
  deprecatedButSurfaced,
  records,
  now,
}: BuildFlagsInput): string[] {
  const flagged: string[] = []

  for (const gap of schemaGaps) {
    flagged.push(`SCHEMA GAP: ${gap.name} — missing: ${gap.missing_fields.join(', ')}`)
  }
  for (const issue of supersedesIssues) {
    flagged.push(`CHAIN ROT: ${issue.name} — ${issue.issue}`)
  }
  for (const err of parseErrors) {
    flagged.push(`PARSE ERROR: ${err.raw_name} (${err.id}) — fix frontmatter`)
  }
  for (const d of deprecatedButSurfaced) {
    flagged.push(`DEPRECATED-BUT-SURFACED: ${d.name} — ${d.reason}`)
  }

  // Orphaned drafts (>30d, no supersedes_source, no schema gap, still draft)
  for (const r of records) {
    if (r.frontmatter.status !== 'draft') continue
    if (r.parse_error) continue
    if ((r.frontmatter.supersedes_source ?? []).length > 0) continue
    if (schemaGaps.some((g) => g.id === r.id)) continue
    if (daysSince(r.created_at, now) > 30) {
      flagged.push(`ORPHANED DRAFT: ${r.frontmatter.name} — draft >30d with no supersedes_source`)
    }
  }

  return flagged
}
