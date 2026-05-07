/**
 * crane_skill_audit tool - Monthly skill staleness and health report
 *
 * Walks SKILL.md files, parses frontmatter, computes staleness from git log,
 * detects schema gaps, and builds a structured report. No D1, no HTTP.
 *
 * Pure helpers (frontmatter, git, discovery): skill-audit-helpers.ts
 */

export {
  parseFrontmatter,
  gitLastTouched,
  daysSince,
  discoverSkills,
  findConsoleRoot,
  readSkillContent,
} from './skill-audit-helpers.js'
export type { Frontmatter, DiscoveredSkill } from './skill-audit-helpers.js'

import { z } from 'zod'
import { CraneApi, type SkillUsageStat } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import {
  parseFrontmatter,
  gitLastTouched,
  daysSince,
  discoverSkills,
  findConsoleRoot,
  readSkillContent,
} from './skill-audit-helpers.js'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const skillAuditInputSchema = z.object({
  scope: z
    .enum(['enterprise', 'global', 'all'])
    .optional()
    .default('all')
    .describe('Which skills to audit. Default: all.'),
  stale_threshold_days: z
    .number()
    .optional()
    .default(180)
    .describe('Days without a git touch before a skill is considered stale. Default: 180.'),
  include_usage: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Fetch skill invocation counts from the last 90 days and surface zero-usage candidates. Default: true.'
    ),
})

export type SkillAuditInput = z.infer<typeof skillAuditInputSchema>

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface SkillInventory {
  total: number
  by_scope: Record<string, number>
  by_status: Record<string, number>
  by_owner: Record<string, number>
}

export interface SchemaGap {
  skill: string
  path: string
  missing_fields: string[]
}

export interface StalenessEntry {
  skill: string
  path: string
  last_touched: string
  days_since: number
  owner: string
}

export interface ZeroUsageEntry {
  skill: string
  owner: string
}

export interface SkillAuditResult {
  inventory: SkillInventory
  schema_gaps: SchemaGap[]
  staleness: StalenessEntry[]
  zero_usage_candidates: ZeroUsageEntry[]
  usage_data_available: boolean
  summary: string
}

export interface SkillAuditToolResult {
  status: 'success' | 'error'
  message: string
}

// ---------------------------------------------------------------------------
// Required frontmatter fields (governance.md §Required fields)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['name', 'description', 'version', 'scope', 'owner', 'status'] as const

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeSkillAudit(input: SkillAuditInput): Promise<SkillAuditToolResult> {
  try {
    const parsed = skillAuditInputSchema.parse(input)
    const result = await runSkillAuditAsync(parsed)
    return { status: 'success', message: formatReport(result) }
  } catch (error) {
    return {
      status: 'error',
      message: `Skill audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Async version: fetches usage stats from the API if include_usage is true.
 * Falls back gracefully on API failure.
 */
export async function runSkillAuditAsync(input: SkillAuditInput): Promise<SkillAuditResult> {
  const base = runSkillAudit(input)

  if (input.include_usage === false) {
    return base
  }

  let usageStats: SkillUsageStat[] = []
  let usageDataAvailable = false

  try {
    const apiKey = process.env.CRANE_CONTEXT_KEY
    if (apiKey) {
      const api = new CraneApi(apiKey, getApiBase())
      usageStats = await api.getSkillUsage({ since: '90d' })
      usageDataAvailable = true
    }
  } catch {
    usageDataAvailable = false
  }

  if (!usageDataAvailable) {
    return { ...base, zero_usage_candidates: [], usage_data_available: false }
  }

  const usageMap = new Map<string, number>()
  for (const stat of usageStats) {
    usageMap.set(stat.skill_name, stat.invocation_count)
  }

  const consoleRoot = findConsoleRoot()
  const discovered = discoverSkills(input.scope ?? 'all', consoleRoot)
  const zero_usage_candidates: ZeroUsageEntry[] = []

  for (const skill of discovered) {
    const count = usageMap.get(skill.name) ?? 0
    if (count === 0) {
      const content = readSkillContent(skill.skillPath)
      const fm = parseFrontmatter(content)
      const ownerKey = (fm.owner as string | undefined) ?? 'unknown'
      zero_usage_candidates.push({ skill: skill.name, owner: ownerKey })
    }
  }

  zero_usage_candidates.sort((a, b) => a.skill.localeCompare(b.skill))

  return { ...base, zero_usage_candidates, usage_data_available: true }
}

export function runSkillAudit(input: SkillAuditInput): SkillAuditResult {
  const consoleRoot = findConsoleRoot()
  const now = new Date()

  const discovered = discoverSkills(input.scope ?? 'all', consoleRoot)

  const inventory: SkillInventory = {
    total: 0,
    by_scope: {},
    by_status: {},
    by_owner: {},
  }
  const schema_gaps: SchemaGap[] = []
  const staleness: StalenessEntry[] = []

  for (const skill of discovered) {
    const content = readSkillContent(skill.skillPath)
    if (!content) continue

    const fm = parseFrontmatter(content)
    const status = (fm.status as string | undefined) ?? 'unknown'

    inventory.total++

    const scopeKey = (fm.scope as string | undefined) ?? skill.resolvedScope
    inventory.by_scope[scopeKey] = (inventory.by_scope[scopeKey] ?? 0) + 1
    inventory.by_status[status] = (inventory.by_status[status] ?? 0) + 1
    const ownerKey = (fm.owner as string | undefined) ?? 'unknown'
    inventory.by_owner[ownerKey] = (inventory.by_owner[ownerKey] ?? 0) + 1

    const missingFields = REQUIRED_FIELDS.filter((f) => !fm[f])
    if (missingFields.length > 0) {
      schema_gaps.push({ skill: skill.name, path: skill.skillPath, missing_fields: missingFields })
    }

    const lastTouched = gitLastTouched(skill.skillPath)
    if (lastTouched) {
      const days = daysSince(lastTouched, now)
      if (days > (input.stale_threshold_days ?? 180)) {
        staleness.push({
          skill: skill.name,
          path: skill.skillPath,
          last_touched: lastTouched,
          days_since: days,
          owner: ownerKey,
        })
      }
    } else {
      staleness.push({
        skill: skill.name,
        path: skill.skillPath,
        last_touched: 'unknown',
        days_since: Infinity,
        owner: ownerKey,
      })
    }
  }

  staleness.sort((a, b) => b.days_since - a.days_since)

  const summary = buildSummary(inventory, schema_gaps, staleness)

  return {
    inventory,
    schema_gaps,
    staleness,
    zero_usage_candidates: [],
    usage_data_available: false,
    summary,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummary(
  inventory: SkillInventory,
  gaps: SchemaGap[],
  stale: StalenessEntry[]
): string {
  const parts: string[] = [
    `${inventory.total} skill(s) audited across ${Object.keys(inventory.by_scope).length} scope(s).`,
  ]
  if (gaps.length > 0) parts.push(`${gaps.length} skill(s) have schema gaps.`)
  if (stale.length > 0) parts.push(`${stale.length} skill(s) are stale.`)
  if (gaps.length === 0 && stale.length === 0) {
    parts.push('All skills are healthy.')
  } else {
    parts.push(
      'Run /skill-review --all for reference-drift details (MCP tool / file / command validity).'
    )
  }
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatReport(result: SkillAuditResult): string {
  const lines: string[] = ['## Skill Audit Report', '']

  lines.push('### Inventory')
  lines.push(`Total: ${result.inventory.total}`)
  lines.push('')
  lines.push('**By scope:**')
  for (const [k, v] of Object.entries(result.inventory.by_scope)) {
    lines.push(`- ${k}: ${v}`)
  }
  lines.push('')
  lines.push('**By status:**')
  for (const [k, v] of Object.entries(result.inventory.by_status)) {
    lines.push(`- ${k}: ${v}`)
  }
  lines.push('')
  lines.push('**By owner:**')
  for (const [k, v] of Object.entries(result.inventory.by_owner)) {
    lines.push(`- ${k}: ${v}`)
  }
  lines.push('')

  lines.push('### Schema Gaps')
  if (result.schema_gaps.length === 0) {
    lines.push('None.')
  } else {
    for (const gap of result.schema_gaps) {
      lines.push(`- **${gap.skill}** — missing: ${gap.missing_fields.join(', ')}`)
    }
  }
  lines.push('')

  lines.push('### Staleness')
  if (result.staleness.length === 0) {
    lines.push('No stale skills.')
  } else {
    for (const s of result.staleness) {
      const days = isFinite(s.days_since) ? `${s.days_since}d` : 'never committed'
      lines.push(`- **${s.skill}** — ${days} since last touch (owner: ${s.owner})`)
    }
  }
  lines.push('')

  lines.push(
    '> Reference drift (broken MCP tools / file refs / commands): run `/skill-review --all` for details.'
  )
  lines.push('')

  lines.push('### Zero-Usage Candidates (last 90 days)')
  if (!result.usage_data_available) {
    lines.push('Usage data unavailable — CRANE_CONTEXT_KEY not set or API unreachable.')
  } else if (result.zero_usage_candidates.length === 0) {
    lines.push('All skills have at least one invocation in the last 90 days.')
  } else {
    const byOwner: Record<string, string[]> = {}
    for (const entry of result.zero_usage_candidates) {
      if (!byOwner[entry.owner]) byOwner[entry.owner] = []
      byOwner[entry.owner].push(entry.skill)
    }
    lines.push(
      `${result.zero_usage_candidates.length} skill(s) with zero invocations — retirement candidates:`
    )
    lines.push('')
    for (const [owner, skills] of Object.entries(byOwner)) {
      lines.push(`**${owner}:**`)
      for (const skill of skills) {
        lines.push(`- ${skill}`)
      }
    }
  }
  lines.push('')

  lines.push('### Summary')
  lines.push(result.summary)

  return lines.join('\n')
}
