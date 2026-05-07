/**
 * Shared types for the memory-audit tool.
 */

export interface InventoryStats {
  total: number
  by_kind: Record<string, number>
  by_scope: Record<string, number>
  by_status: Record<string, number>
  by_owner: Record<string, number>
  captain_approved: number
}

export interface SchemaGap {
  id: string
  name: string
  missing_fields: string[]
}

export interface StalenessEntry {
  id: string
  name: string
  kind: string
  days_since_update: number
  days_since_validated: number | null
}

export interface DeprecatedButSurfaced {
  id: string
  name: string
  reason: string
}

export interface ZeroUsageEntry {
  id: string
  name: string
  kind: string
  surfaced_count: number
  cited_count: number
  created_days_ago: number
}

export interface SupersedesChainIssue {
  id: string
  name: string
  issue: string
}

export interface ParseErrorEntry {
  id: string
  raw_name: string
}

export interface PendingApproval {
  id: string
  name: string
  kind: string
  scope: string
  surfaced_count: number
  cited_count: number
  created_at: string
  // Prong 3: verify-ledger evidence row IDs that motivated this draft.
  // Populated when crane_verify_audit --apply created the memory from a
  // recurring (command_hash, repo) pattern. Captain sees the ledger
  // lineage at approval time.
  evidence_verify_ids?: string[]
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
