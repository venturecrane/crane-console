/**
 * crane_skill_audit tool - Monthly skill staleness and health report
 *
 * Walks SKILL.md files, parses frontmatter, computes staleness from git log,
 * detects schema gaps, and builds a structured report. No D1, no HTTP.
 */

import { z } from 'zod'
import { execSync } from 'child_process'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

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
  include_deprecated: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include deprecated skills in staleness and inventory counts. Default: true.'),
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

export interface DeprecationEntry {
  skill: string
  path: string
  deprecation_date: string
  sunset_date: string
  days_until_sunset: number
}

export interface SkillAuditResult {
  inventory: SkillInventory
  schema_gaps: SchemaGap[]
  staleness: StalenessEntry[]
  deprecation_queue: DeprecationEntry[]
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
// Frontmatter parsing (gray-matter-compatible manual parser as fallback)
// ---------------------------------------------------------------------------

interface Frontmatter {
  name?: string
  description?: string
  version?: string
  scope?: string
  owner?: string
  status?: string
  deprecation_date?: string
  sunset_date?: string
  deprecation_notice?: string
  backend_only?: boolean
  [key: string]: unknown
}

function parseFrontmatter(content: string): Frontmatter {
  // Try gray-matter first (may not be installed yet during dev)
  try {
    // Dynamic require to avoid hard dep at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const matter = require('gray-matter')
    return matter(content).data as Frontmatter
  } catch {
    // Fallback: minimal YAML parser for simple key: value pairs
    return parseSimpleFrontmatter(content)
  }
}

function parseSimpleFrontmatter(content: string): Frontmatter {
  const result: Frontmatter = {}
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return result

  const yaml = match[1]
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const rawVal = line.slice(colonIdx + 1).trim()
    if (!key || rawVal === '') continue

    // Handle booleans
    if (rawVal === 'true') {
      result[key] = true
    } else if (rawVal === 'false') {
      result[key] = false
    } else {
      // Strip optional surrounding quotes
      result[key] = rawVal.replace(/^['"]|['"]$/g, '')
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitLastTouched(filePath: string): string | null {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return iso || null
  } catch {
    return null
  }
}

function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(isoDate)
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

function daysUntil(isoDate: string, now: Date = new Date()): number {
  const then = new Date(isoDate)
  return Math.floor((then.getTime() - now.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Skill discovery
// ---------------------------------------------------------------------------

interface DiscoveredSkill {
  name: string
  skillPath: string // path to SKILL.md
  resolvedScope: 'enterprise' | 'global'
}

function discoverSkills(
  scope: 'enterprise' | 'global' | 'all',
  consoleRoot: string
): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = []

  const collect = (baseDir: string, resolvedScope: 'enterprise' | 'global') => {
    if (!existsSync(baseDir)) return
    let entries: string[]
    try {
      entries = readdirSync(baseDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    } catch {
      return
    }
    for (const entry of entries) {
      const skillPath = join(baseDir, entry, 'SKILL.md')
      if (existsSync(skillPath)) {
        skills.push({ name: entry, skillPath, resolvedScope })
      }
    }
  }

  if (scope === 'enterprise' || scope === 'all') {
    collect(join(consoleRoot, '.agents', 'skills'), 'enterprise')
  }
  if (scope === 'global' || scope === 'all') {
    collect(join(homedir(), '.agents', 'skills'), 'global')
  }

  return skills
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeSkillAudit(input: SkillAuditInput): Promise<SkillAuditToolResult> {
  try {
    const parsed = skillAuditInputSchema.parse(input)
    const result = runSkillAudit(parsed)
    return { status: 'success', message: formatReport(result) }
  } catch (error) {
    return {
      status: 'error',
      message: `Skill audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export function runSkillAudit(input: SkillAuditInput): SkillAuditResult {
  // Locate crane-console root: walk up from __dirname until we find CLAUDE.md
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
  const deprecation_queue: DeprecationEntry[] = []

  for (const skill of discovered) {
    let content: string
    try {
      content = readFileSync(skill.skillPath, 'utf8')
    } catch {
      continue
    }

    const fm = parseFrontmatter(content)
    const status = (fm.status as string | undefined) ?? 'unknown'

    // Optionally skip deprecated skills in counts
    if (!input.include_deprecated && status === 'deprecated') continue

    // -----------------------------------------------------------------------
    // Inventory
    // -----------------------------------------------------------------------
    inventory.total++

    const scopeKey = (fm.scope as string | undefined) ?? skill.resolvedScope
    inventory.by_scope[scopeKey] = (inventory.by_scope[scopeKey] ?? 0) + 1
    inventory.by_status[status] = (inventory.by_status[status] ?? 0) + 1
    const ownerKey = (fm.owner as string | undefined) ?? 'unknown'
    inventory.by_owner[ownerKey] = (inventory.by_owner[ownerKey] ?? 0) + 1

    // -----------------------------------------------------------------------
    // Schema gaps
    // -----------------------------------------------------------------------
    const missingFields = REQUIRED_FIELDS.filter((f) => !fm[f])
    if (missingFields.length > 0) {
      schema_gaps.push({ skill: skill.name, path: skill.skillPath, missing_fields: missingFields })
    }

    // -----------------------------------------------------------------------
    // Staleness
    // -----------------------------------------------------------------------
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
      // Never committed or git unavailable — treat as infinitely stale
      staleness.push({
        skill: skill.name,
        path: skill.skillPath,
        last_touched: 'unknown',
        days_since: Infinity,
        owner: ownerKey,
      })
    }

    // -----------------------------------------------------------------------
    // Deprecation queue
    // -----------------------------------------------------------------------
    if (status === 'deprecated' && fm.deprecation_date && fm.sunset_date) {
      const daysLeft = daysUntil(fm.sunset_date as string, now)
      deprecation_queue.push({
        skill: skill.name,
        path: skill.skillPath,
        deprecation_date: fm.deprecation_date as string,
        sunset_date: fm.sunset_date as string,
        days_until_sunset: daysLeft,
      })
    }
  }

  // Sort staleness worst-first
  staleness.sort((a, b) => b.days_since - a.days_since)
  // Sort deprecation queue soonest-first
  deprecation_queue.sort((a, b) => a.days_until_sunset - b.days_until_sunset)

  const summary = buildSummary(inventory, schema_gaps, staleness, deprecation_queue)

  return { inventory, schema_gaps, staleness, deprecation_queue, summary }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findConsoleRoot(): string {
  // Walk up from current file location until CLAUDE.md found
  // Fallback: process.cwd()
  const parts = new URL(import.meta.url).pathname.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    const candidate = parts.slice(0, i).join('/')
    if (existsSync(join(candidate, 'CLAUDE.md'))) return candidate
  }
  return process.cwd()
}

function buildSummary(
  inventory: SkillInventory,
  gaps: SchemaGap[],
  stale: StalenessEntry[],
  queue: DeprecationEntry[]
): string {
  const parts: string[] = [
    `${inventory.total} skill(s) audited across ${Object.keys(inventory.by_scope).length} scope(s).`,
  ]
  if (gaps.length > 0) parts.push(`${gaps.length} skill(s) have schema gaps.`)
  if (stale.length > 0) parts.push(`${stale.length} skill(s) are stale.`)
  if (queue.length > 0) {
    const overdue = queue.filter((d) => d.days_until_sunset <= 0).length
    if (overdue > 0) parts.push(`${overdue} skill(s) are past sunset date and ready for removal.`)
    else parts.push(`${queue.length} skill(s) in deprecation queue.`)
  }
  if (gaps.length === 0 && stale.length === 0 && queue.length === 0) {
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

  // Inventory
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

  // Schema gaps
  lines.push('### Schema Gaps')
  if (result.schema_gaps.length === 0) {
    lines.push('None.')
  } else {
    for (const gap of result.schema_gaps) {
      lines.push(`- **${gap.skill}** — missing: ${gap.missing_fields.join(', ')}`)
    }
  }
  lines.push('')

  // Staleness
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

  // Deprecation queue
  lines.push('### Deprecation Queue')
  if (result.deprecation_queue.length === 0) {
    lines.push('No skills in deprecation queue.')
  } else {
    for (const d of result.deprecation_queue) {
      const label = d.days_until_sunset <= 0 ? 'OVERDUE' : `${d.days_until_sunset}d remaining`
      lines.push(
        `- **${d.skill}** — sunset ${d.sunset_date} (${label}), deprecated ${d.deprecation_date}`
      )
    }
  }
  lines.push('')

  // Reference drift note
  lines.push(
    '> Reference drift (broken MCP tools / file refs / commands): run `/skill-review --all` for details.'
  )
  lines.push('')

  // Summary
  lines.push('### Summary')
  lines.push(result.summary)

  return lines.join('\n')
}
