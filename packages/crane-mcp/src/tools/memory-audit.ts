/**
 * crane_memory_audit tool - Memory health report and auto-apply governance
 *
 * Seven checks: inventory, schema gaps, staleness, deprecated-but-surfaced,
 * zero-usage (with surface floor), supersedes-chain integrity, parse-error count.
 */

import { z } from 'zod'
import { existsSync } from 'fs'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import type { MemoryUsageStat } from '../lib/crane-api.js'
import {
  validateAndBuildRecord,
  fetchAllMemories,
  parseFrontmatter,
  serializeFrontmatter,
  extractBody,
  type MemoryRecord,
  type MemoryFrontmatter,
} from './memory.js'

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
// Output types
// ---------------------------------------------------------------------------

interface InventoryStats {
  total: number
  by_kind: Record<string, number>
  by_scope: Record<string, number>
  by_status: Record<string, number>
  by_owner: Record<string, number>
  captain_approved: number
}

interface SchemaGap {
  id: string
  name: string
  missing_fields: string[]
}

interface StalenessEntry {
  id: string
  name: string
  kind: string
  days_since_update: number
  days_since_validated: number | null
}

interface DeprecatedButSurfaced {
  id: string
  name: string
  reason: string
}

interface ZeroUsageEntry {
  id: string
  name: string
  kind: string
  surfaced_count: number
  cited_count: number
  created_days_ago: number
}

interface SupersedesChainIssue {
  id: string
  name: string
  issue: string
}

interface ParseErrorEntry {
  id: string
  raw_name: string
}

interface PendingApproval {
  id: string
  name: string
  kind: string
  scope: string
  surfaced_count: number
  cited_count: number
  created_at: string
}

export interface MemoryAuditResult {
  inventory: InventoryStats
  schema_gaps: SchemaGap[]
  staleness: StalenessEntry[]
  deprecated_but_surfaced: DeprecatedButSurfaced[]
  zero_usage_candidates: ZeroUsageEntry[]
  supersedes_chain_issues: SupersedesChainIssue[]
  parse_errors: ParseErrorEntry[]
  promoted: string[]
  deprecated_auto: string[]
  flagged: string[]
  pending_captain_approval: PendingApproval[]
  usage_data_available: boolean
  summary: string
}

export interface MemoryAuditToolResult {
  status: 'success' | 'error'
  message: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(isoDate)
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

const REQUIRED_FIELDS = ['name', 'description', 'kind', 'scope', 'status'] as const

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeMemoryAudit(input: MemoryAuditInput): Promise<MemoryAuditToolResult> {
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

async function runMemoryAudit(input: MemoryAuditInput): Promise<MemoryAuditResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    throw new Error('CRANE_CONTEXT_KEY not set. Cannot access memories.')
  }

  const api = new CraneApi(apiKey, getApiBase())
  const now = new Date()

  // Fetch all memory notes
  const notes = await fetchAllMemories(api, 'memory', 500)
  const records = notes.map(validateAndBuildRecord)

  // Build a lookup by ID for supersedes-chain checks
  const recordById = new Map<string, MemoryRecord>()
  for (const r of records) {
    recordById.set(r.id, r)
  }

  // Fetch usage data if requested
  const usageMap = new Map<string, MemoryUsageStat>()
  let usageDataAvailable = false

  if (input.include_usage !== false) {
    try {
      const stats = await api.getMemoryUsage({ since: '90d' })
      for (const s of stats) {
        usageMap.set(s.memory_id, s)
      }
      usageDataAvailable = true
    } catch {
      usageDataAvailable = false
    }
  }

  // ---------------------------------------------------------------------------
  // Check 1: Inventory
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Check 2: Schema gaps
  // ---------------------------------------------------------------------------
  const schema_gaps: SchemaGap[] = []

  for (const r of records) {
    if (r.parse_error) continue // parse errors handled separately
    const fm = parseFrontmatter(r.raw_content ?? '')
    const missing = REQUIRED_FIELDS.filter((f) => !fm[f])
    if (missing.length > 0) {
      schema_gaps.push({
        id: r.id,
        name: r.frontmatter.name,
        missing_fields: [...missing],
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Check 3: Staleness (updated_at > 180d AND last_validated_on > 180d; incidents exempt)
  // ---------------------------------------------------------------------------
  const staleThreshold = input.stale_threshold_days ?? 180
  const staleness: StalenessEntry[] = []

  for (const r of records) {
    if (r.parse_error) continue
    if (r.frontmatter.kind === 'incident') continue // incidents are historical, exempt

    const daysSinceUpdate = daysSince(r.updated_at, now)
    const lastValidated = r.frontmatter.last_validated_on
    const daysSinceValidated = lastValidated ? daysSince(lastValidated, now) : null

    const updateStale = daysSinceUpdate > staleThreshold
    const validationStale = daysSinceValidated === null || daysSinceValidated > staleThreshold

    if (updateStale && validationStale) {
      staleness.push({
        id: r.id,
        name: r.frontmatter.name,
        kind: r.frontmatter.kind,
        days_since_update: daysSinceUpdate,
        days_since_validated: daysSinceValidated,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Check 4: Deprecated-but-surfaced (any deprecated memory that would match recall)
  // ---------------------------------------------------------------------------
  const deprecated_but_surfaced: DeprecatedButSurfaced[] = []

  for (const r of records) {
    if (r.frontmatter.status !== 'deprecated') continue
    if (!usageDataAvailable) continue

    const usage = usageMap.get(r.id)
    if (usage && (usage.surfaced_count > 0 || usage.cited_count > 0)) {
      deprecated_but_surfaced.push({
        id: r.id,
        name: r.frontmatter.name,
        reason: `Deprecated memory has usage: surfaced=${usage.surfaced_count}, cited=${usage.cited_count}. Recall code may have a bug.`,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Check 5: Zero-usage (stable, cited=0 in 90d, surfaced>=10 in 90d, created >30d ago)
  // ---------------------------------------------------------------------------
  const zero_usage_candidates: ZeroUsageEntry[] = []

  if (usageDataAvailable) {
    for (const r of records) {
      if (r.frontmatter.status !== 'stable') continue
      if (r.parse_error) continue

      const usage = usageMap.get(r.id)
      const surfacedCount = usage?.surfaced_count ?? 0
      const citedCount = usage?.cited_count ?? 0
      const createdDaysAgo = daysSince(r.created_at, now)

      if (citedCount === 0 && surfacedCount >= 10 && createdDaysAgo > 30) {
        zero_usage_candidates.push({
          id: r.id,
          name: r.frontmatter.name,
          kind: r.frontmatter.kind,
          surfaced_count: surfacedCount,
          cited_count: citedCount,
          created_days_ago: createdDaysAgo,
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Check 6: Supersedes-chain integrity
  // ---------------------------------------------------------------------------
  const supersedes_chain_issues: SupersedesChainIssue[] = []

  for (const r of records) {
    if (r.parse_error) continue
    const fm = r.frontmatter

    if (fm.supersedes?.length) {
      for (const supersededId of fm.supersedes) {
        if (!recordById.has(supersededId)) {
          supersedes_chain_issues.push({
            id: r.id,
            name: fm.name,
            issue: `supersedes ID "${supersededId}" not found in memory corpus`,
          })
        }
      }
    }

    if (fm.supersedes_source?.length) {
      for (const srcPath of fm.supersedes_source) {
        if (srcPath.startsWith('~') || srcPath.startsWith('/')) {
          // Absolute or home-relative paths: check existence
          const resolved = srcPath.startsWith('~/')
            ? srcPath.replace('~', process.env.HOME || '')
            : srcPath
          if (!existsSync(resolved)) {
            supersedes_chain_issues.push({
              id: r.id,
              name: fm.name,
              issue: `supersedes_source path not found on disk: ${srcPath}`,
            })
          }
        }
        // Relative repo paths: skip check (may be in a different venture repo)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Check 7: Parse errors
  // ---------------------------------------------------------------------------
  const parse_errors: ParseErrorEntry[] = records
    .filter((r) => r.parse_error)
    .map((r) => ({ id: r.id, raw_name: r.frontmatter.name }))

  // ---------------------------------------------------------------------------
  // Auto-apply: promote eligible drafts
  // ---------------------------------------------------------------------------
  const promoted: string[] = []
  const deprecated_auto: string[] = []
  const flagged: string[] = []

  if (input.auto_apply) {
    for (const r of records) {
      if (r.frontmatter.status !== 'draft') continue
      if (r.parse_error) continue

      const hasSchemaGap = schema_gaps.some((g) => g.id === r.id)
      if (hasSchemaGap) continue

      const hasSupersedesSource = (r.frontmatter.supersedes_source ?? []).length > 0
      const createdDaysAgo = daysSince(r.created_at, now)
      const isOldEnough = createdDaysAgo >= 14

      if (hasSupersedesSource || isOldEnough) {
        // Promote: draft → stable. Never sets captain_approved.
        const fm = r.frontmatter
        const newFm: MemoryFrontmatter = { ...fm, status: 'stable' }
        const body = extractBody(r.raw_content ?? '')
        const content = `${serializeFrontmatter(newFm)}\n\n${body}`

        try {
          await api.updateNote(r.id, { content, title: fm.name })
          promoted.push(fm.name)
        } catch {
          flagged.push(`${fm.name}: failed to promote (API error)`)
        }
      }
    }

    // Auto-deprecate zero-usage memories
    for (const entry of zero_usage_candidates) {
      const r = recordById.get(entry.id)
      if (!r) continue

      const fm = r.frontmatter
      const newFm: MemoryFrontmatter = { ...fm, status: 'deprecated' }
      const body = extractBody(r.raw_content ?? '')
      const content = `${serializeFrontmatter(newFm)}\n\n${body}\n\n_Auto-deprecated: zero citations in 90 days with ${entry.surfaced_count} surfaces._`

      try {
        await api.updateNote(r.id, { content, title: fm.name })
        deprecated_auto.push(fm.name)
      } catch {
        flagged.push(`${fm.name}: failed to auto-deprecate (API error)`)
      }
    }
  }

  // Flag items that need Captain attention
  for (const gap of schema_gaps) {
    flagged.push(`SCHEMA GAP: ${gap.name} — missing: ${gap.missing_fields.join(', ')}`)
  }
  for (const issue of supersedes_chain_issues) {
    flagged.push(`CHAIN ROT: ${issue.name} — ${issue.issue}`)
  }
  for (const err of parse_errors) {
    flagged.push(`PARSE ERROR: ${err.raw_name} (${err.id}) — fix frontmatter`)
  }
  if (deprecated_but_surfaced.length > 0) {
    for (const d of deprecated_but_surfaced) {
      flagged.push(`DEPRECATED-BUT-SURFACED: ${d.name} — ${d.reason}`)
    }
  }
  // Flag orphaned drafts (>30d, no supersedes_source, no schema gap, still draft)
  for (const r of records) {
    if (r.frontmatter.status !== 'draft') continue
    if (r.parse_error) continue
    if ((r.frontmatter.supersedes_source ?? []).length > 0) continue
    if (schema_gaps.some((g) => g.id === r.id)) continue
    if (daysSince(r.created_at, now) > 30) {
      flagged.push(`ORPHANED DRAFT: ${r.frontmatter.name} — draft >30d with no supersedes_source`)
    }
  }

  // ---------------------------------------------------------------------------
  // Pending captain approval (stable + captain_approved=false)
  // ---------------------------------------------------------------------------
  const pending_captain_approval: PendingApproval[] = []

  for (const r of records) {
    if (r.frontmatter.status !== 'stable') continue
    if (r.frontmatter.captain_approved) continue
    if (r.parse_error) continue

    const usage = usageMap.get(r.id)
    pending_captain_approval.push({
      id: r.id,
      name: r.frontmatter.name,
      kind: r.frontmatter.kind,
      scope: r.frontmatter.scope,
      surfaced_count: usage?.surfaced_count ?? 0,
      cited_count: usage?.cited_count ?? 0,
      created_at: r.created_at,
    })
  }

  const summary = buildSummary(
    inventory,
    schema_gaps,
    staleness,
    parse_errors,
    promoted,
    deprecated_auto,
    flagged
  )

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

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(
  inventory: InventoryStats,
  gaps: SchemaGap[],
  stale: StalenessEntry[],
  parseErrors: ParseErrorEntry[],
  promoted: string[],
  deprecatedAuto: string[],
  flagged: string[]
): string {
  const parts: string[] = [
    `${inventory.total} memory(ies) audited. ${inventory.captain_approved} captain-approved.`,
  ]
  if (promoted.length > 0) parts.push(`${promoted.length} promoted draft(s) → stable.`)
  if (deprecatedAuto.length > 0) parts.push(`${deprecatedAuto.length} auto-deprecated.`)
  if (parseErrors.length > 0) parts.push(`${parseErrors.length} parse error(s) — quarantined.`)
  if (gaps.length > 0) parts.push(`${gaps.length} schema gap(s).`)
  if (stale.length > 0) parts.push(`${stale.length} stale memory(ies).`)
  if (flagged.length > 0) parts.push(`${flagged.length} item(s) flagged for Captain action.`)
  if (parseErrors.length === 0 && gaps.length === 0 && stale.length === 0 && flagged.length === 0) {
    parts.push('Memory system is healthy.')
  }
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Report formatter
// ---------------------------------------------------------------------------

function formatAuditReport(result: MemoryAuditResult): string {
  const lines: string[] = ['## Memory Audit Report', '']

  // Inventory
  lines.push('### Inventory')
  lines.push(
    `Total: ${result.inventory.total} | Captain approved: ${result.inventory.captain_approved}`
  )
  lines.push('')
  lines.push('**By kind:**')
  for (const [k, v] of Object.entries(result.inventory.by_kind)) lines.push(`- ${k}: ${v}`)
  lines.push('')
  lines.push('**By scope:**')
  for (const [k, v] of Object.entries(result.inventory.by_scope)) lines.push(`- ${k}: ${v}`)
  lines.push('')
  lines.push('**By status:**')
  for (const [k, v] of Object.entries(result.inventory.by_status)) lines.push(`- ${k}: ${v}`)
  lines.push('')
  lines.push('**By owner:**')
  for (const [k, v] of Object.entries(result.inventory.by_owner)) lines.push(`- ${k}: ${v}`)
  lines.push('')

  // Auto-apply results
  if (result.promoted.length > 0) {
    lines.push('### Promoted (draft → stable)')
    for (const name of result.promoted) lines.push(`- ${name}`)
    lines.push('')
  }

  if (result.deprecated_auto.length > 0) {
    lines.push('### Auto-Deprecated (zero-usage)')
    for (const name of result.deprecated_auto) lines.push(`- ${name}`)
    lines.push('')
  }

  // Parse errors — must be first blocker
  lines.push('### Parse Errors')
  if (result.parse_errors.length === 0) {
    lines.push('None.')
  } else {
    for (const e of result.parse_errors) {
      lines.push(`- **${e.raw_name}** (${e.id}) — frontmatter invalid, memory quarantined`)
    }
  }
  lines.push('')

  // Schema gaps
  lines.push('### Schema Gaps')
  if (result.schema_gaps.length === 0) {
    lines.push('None.')
  } else {
    for (const g of result.schema_gaps) {
      lines.push(`- **${g.name}** (${g.id}) — missing: ${g.missing_fields.join(', ')}`)
    }
  }
  lines.push('')

  // Staleness
  lines.push('### Staleness (>180 days)')
  if (result.staleness.length === 0) {
    lines.push('None.')
  } else {
    for (const s of result.staleness) {
      const validated = s.days_since_validated !== null ? `${s.days_since_validated}d` : 'never'
      lines.push(
        `- **${s.name}** — updated ${s.days_since_update}d ago, validated ${validated} ago (${s.kind})`
      )
    }
  }
  lines.push('')

  // Deprecated-but-surfaced
  lines.push('### Deprecated-but-Surfaced')
  if (result.deprecated_but_surfaced.length === 0) {
    lines.push('None (recall filter is working correctly).')
  } else {
    for (const d of result.deprecated_but_surfaced) {
      lines.push(`- **${d.name}** (${d.id}) — ${d.reason}`)
    }
  }
  lines.push('')

  // Zero-usage candidates
  lines.push('### Zero-Usage Candidates (last 90 days)')
  if (!result.usage_data_available) {
    lines.push('Usage data unavailable — CRANE_CONTEXT_KEY not set or API unreachable.')
  } else if (result.zero_usage_candidates.length === 0) {
    lines.push('All stable memories have either citations or fewer than 10 surfaces.')
  } else {
    for (const z of result.zero_usage_candidates) {
      lines.push(
        `- **${z.name}** — surfaced=${z.surfaced_count}, cited=${z.cited_count}, ${z.created_days_ago}d old (${z.kind})`
      )
    }
  }
  lines.push('')

  // Supersedes-chain issues
  lines.push('### Supersedes-Chain Integrity')
  if (result.supersedes_chain_issues.length === 0) {
    lines.push('None.')
  } else {
    for (const i of result.supersedes_chain_issues) {
      lines.push(`- **${i.name}** (${i.id}) — ${i.issue}`)
    }
  }
  lines.push('')

  // Pending captain approval
  lines.push('### Pending Captain Approval')
  lines.push(
    '_Stable memories not yet approved for SOS injection. Use `crane_memory(update, id, captain_approved: true)` to approve._'
  )
  lines.push('')
  if (result.pending_captain_approval.length === 0) {
    lines.push('None.')
  } else {
    for (const p of result.pending_captain_approval) {
      lines.push(
        `- **${p.name}** (${p.id}) — ${p.kind} | ${p.scope} | surfaced=${p.surfaced_count}, cited=${p.cited_count}`
      )
    }
  }
  lines.push('')

  // All flags
  lines.push('### Flagged for Captain Action')
  if (result.flagged.length === 0) {
    lines.push('None.')
  } else {
    for (const f of result.flagged) lines.push(`- ${f}`)
  }
  lines.push('')

  // Summary
  lines.push('### Summary')
  lines.push(result.summary)

  return lines.join('\n')
}
