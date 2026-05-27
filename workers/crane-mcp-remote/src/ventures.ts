/**
 * Venture catalog for crane-mcp-remote.
 *
 * Each claude.ai project maps to one venture. The MCP endpoint URL
 * carries the venture code (e.g., /mcp/ss), which selects a per-venture
 * McpAgent subclass in src/index.ts. That subclass passes its venture
 * code into tool registration, where crane_* and github_* tools use it
 * as the default scope.
 *
 * Explicit `venture` (crane tools) or `owner`+`repo` (github tools)
 * arguments always override the session default — cross-venture queries
 * are first-class.
 */

export const VENTURE_CODES = ['vc', 'ss', 'ke', 'dfg', 'dc'] as const
export type VentureCode = (typeof VENTURE_CODES)[number]

export interface VentureRepo {
  owner: string
  repo: string
}

export interface VentureInfo {
  code: VentureCode
  name: string
  repo: VentureRepo
}

const OWNER = 'venturecrane'

export const VENTURES: Record<VentureCode, VentureInfo> = {
  vc: { code: 'vc', name: 'Venture Crane', repo: { owner: OWNER, repo: 'crane-console' } },
  ss: { code: 'ss', name: 'SMD Services', repo: { owner: OWNER, repo: 'ss-console' } },
  ke: { code: 'ke', name: 'Kid Expenses', repo: { owner: OWNER, repo: 'ke-console' } },
  dfg: { code: 'dfg', name: 'Durgan Field Guide', repo: { owner: OWNER, repo: 'dfg-console' } },
  dc: { code: 'dc', name: 'Draft Crane', repo: { owner: OWNER, repo: 'dc-console' } },
}

export function isVentureCode(value: unknown): value is VentureCode {
  return typeof value === 'string' && (VENTURE_CODES as readonly string[]).includes(value)
}

export function getVenture(code: VentureCode | null): VentureInfo | null {
  return code ? VENTURES[code] : null
}
