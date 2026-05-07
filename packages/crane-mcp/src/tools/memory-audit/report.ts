/**
 * Report formatting for crane_memory_audit.
 */

import type {
  MemoryAuditResult,
  InventoryStats,
  SchemaGap,
  StalenessEntry,
  ParseErrorEntry,
} from './types.js'

export interface BuildSummaryInput {
  inventory: InventoryStats
  gaps: SchemaGap[]
  stale: StalenessEntry[]
  parseErrors: ParseErrorEntry[]
  promoted: string[]
  deprecatedAuto: string[]
  flagged: string[]
}

export function buildSummary({
  inventory,
  gaps,
  stale,
  parseErrors,
  promoted,
  deprecatedAuto,
  flagged,
}: BuildSummaryInput): string {
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

function formatInventory(result: MemoryAuditResult): string[] {
  const lines: string[] = []
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
  return lines
}

function formatAutoApply(result: MemoryAuditResult): string[] {
  const lines: string[] = []
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
  return lines
}

function formatChecks(result: MemoryAuditResult): string[] {
  const lines: string[] = []

  lines.push('### Parse Errors')
  if (result.parse_errors.length === 0) {
    lines.push('None.')
  } else {
    for (const e of result.parse_errors) {
      lines.push(`- **${e.raw_name}** (${e.id}) — frontmatter invalid, memory quarantined`)
    }
  }
  lines.push('')

  lines.push('### Schema Gaps')
  if (result.schema_gaps.length === 0) {
    lines.push('None.')
  } else {
    for (const g of result.schema_gaps) {
      lines.push(`- **${g.name}** (${g.id}) — missing: ${g.missing_fields.join(', ')}`)
    }
  }
  lines.push('')

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

  lines.push('### Deprecated-but-Surfaced')
  if (result.deprecated_but_surfaced.length === 0) {
    lines.push('None (recall filter is working correctly).')
  } else {
    for (const d of result.deprecated_but_surfaced) {
      lines.push(`- **${d.name}** (${d.id}) — ${d.reason}`)
    }
  }
  lines.push('')

  return lines
}

function formatUsageAndChain(result: MemoryAuditResult): string[] {
  const lines: string[] = []

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

  lines.push('### Supersedes-Chain Integrity')
  if (result.supersedes_chain_issues.length === 0) {
    lines.push('None.')
  } else {
    for (const i of result.supersedes_chain_issues) {
      lines.push(`- **${i.name}** (${i.id}) — ${i.issue}`)
    }
  }
  lines.push('')

  return lines
}

function formatPendingAndFlags(result: MemoryAuditResult): string[] {
  const lines: string[] = []

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
      // Prong 3: surface ledger evidence inline so the Captain sees the
      // lineage of crane_verify_audit-nominated drafts at approval time.
      if (p.evidence_verify_ids && p.evidence_verify_ids.length > 0) {
        lines.push(
          `  · evidence (verify-ledger): ${p.evidence_verify_ids.map((id) => `\`${id}\``).join(', ')}`
        )
      }
    }
  }
  lines.push('')

  lines.push('### Flagged for Captain Action')
  if (result.flagged.length === 0) {
    lines.push('None.')
  } else {
    for (const f of result.flagged) lines.push(`- ${f}`)
  }
  lines.push('')

  lines.push('### Summary')
  lines.push(result.summary)

  return lines
}

export function formatAuditReport(result: MemoryAuditResult): string {
  const lines: string[] = ['## Memory Audit Report', '']
  lines.push(...formatInventory(result))
  lines.push(...formatAutoApply(result))
  lines.push(...formatChecks(result))
  lines.push(...formatUsageAndChain(result))
  lines.push(...formatPendingAndFlags(result))
  return lines.join('\n')
}
