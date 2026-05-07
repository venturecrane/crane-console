/**
 * crane_docs_drift_audit tool - Drift detection across the docs/ tree
 *
 * Six checks (report-only, no auto-fix in v1):
 *   - Dead internal markdown links (ERROR)
 *   - Broken crane_doc('scope','name') references (ERROR)
 *   - Deprecated skill mentions (WARN)
 *   - Stale-by-git in site-published dirs (INFO)
 *   - Sidebar drift between astro.config.mjs and docs/ (INFO; self-diagnostic ERROR on zero extraction)
 *   - Captain-review candidates (INFO subset of stale-by-git)
 *
 * Cadence semantics: success whenever the audit runs cleanly and emits a valid
 * report. failure only on tool error or audit-tool-broken self-diagnostic.
 */

import { z } from 'zod'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  findConsoleRoot,
  walkMarkdownFiles,
  gitMtimeMap,
  discoverDeprecatedSkills,
  classifyDocsDirs,
} from './drift-fs-helpers.js'
import { extractAstroSidebar } from './drift-astro-sidebar.js'
import {
  checkDeadInternalLinks,
  checkBrokenCraneDocReferences,
  checkDeprecatedSkillMentions,
  checkStaleByGit,
  checkSidebarDrift,
  checkCaptainReviewCandidates,
} from './drift-checks.js'

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility (tests and external callers import from here)
// ---------------------------------------------------------------------------
export { walkMarkdownFiles, classifyDocsDirs } from './drift-fs-helpers.js'
export type { DeprecatedSkill } from './drift-fs-helpers.js'
export {
  extractMarkdownLinks,
  extractCraneDocCalls,
  resolveCraneDocCall,
} from './drift-markdown-parse.js'
export type { SidebarExtraction } from './drift-astro-sidebar.js'
export {
  checkDeadInternalLinks,
  checkBrokenCraneDocReferences,
  checkDeprecatedSkillMentions,
  checkStaleByGit,
  checkSidebarDrift,
  checkCaptainReviewCandidates,
} from './drift-checks.js'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const docsDriftAuditInputSchema = z.object({
  scope: z
    .string()
    .optional()
    .describe(
      'Limit walk to one site-published subdir under docs/ (e.g., "runbooks", "ventures/vc"). Default: all.'
    ),
  stale_threshold_days: z
    .number()
    .optional()
    .default(180)
    .describe('Days without a git touch before a doc is flagged as stale. Default: 180.'),
  severity_filter: z
    .enum(['error', 'warn', 'info', 'all'])
    .optional()
    .default('all')
    .describe('Restrict findings to this severity level or higher. Default: all.'),
})

export type DocsDriftAuditInput = z.infer<typeof docsDriftAuditInputSchema>

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warn' | 'info'

export interface Finding {
  severity: Severity
  type: string
  file: string
  line?: number
  detail: string
}

export interface AuditInventory {
  total_docs: number
  site_published_dirs: string[]
  non_published_dirs: string[]
}

export interface DocsDriftAuditResult {
  inventory: AuditInventory
  findings: Finding[]
  audit_tool_broken: boolean
  summary: string
}

export interface DocsDriftAuditToolResult {
  status: 'success' | 'error'
  message: string
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeDocsDriftAudit(
  input: DocsDriftAuditInput
): Promise<DocsDriftAuditToolResult> {
  try {
    const parsed = docsDriftAuditInputSchema.parse(input)
    const result = runDocsDriftAudit(parsed)
    return { status: 'success', message: formatReport(result) }
  } catch (error) {
    return {
      status: 'error',
      message: `Docs drift audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export function runDocsDriftAudit(input: DocsDriftAuditInput): DocsDriftAuditResult {
  const repoRoot = findConsoleRoot()
  const docsRoot = join(repoRoot, 'docs')

  const sidebar = extractAstroSidebar(repoRoot)
  const scopePath = input.scope ? join(docsRoot, input.scope) : docsRoot
  const allFiles = walkMarkdownFiles(scopePath)

  const sitePublishedSet = new Set<string>(
    sidebar.autogenerate_dirs.flatMap((d) => {
      const parts = d.split('/')
      const out: string[] = []
      for (let i = 1; i <= parts.length; i++) {
        out.push(parts.slice(0, i).join('/'))
      }
      return out
    })
  )
  const isSitePublished = (file: string): boolean => {
    const rel = relative(docsRoot, file)
    const top = rel.split('/')[0]
    if (sitePublishedSet.has(top)) return true
    if (rel.startsWith('ventures/')) {
      const ventureDir = rel.split('/').slice(0, 2).join('/')
      return sitePublishedSet.has('ventures') || sitePublishedSet.has(ventureDir)
    }
    return false
  }

  const sitePublishedFiles = allFiles.filter(isSitePublished)
  const externalRefScopes = [
    join(repoRoot, 'CLAUDE.md'),
    ...walkMarkdownFiles(join(repoRoot, '.agents', 'skills')),
    ...walkMarkdownFiles(join(repoRoot, '.claude', 'commands')),
  ].filter((p) => existsSync(p))
  const referenceScanFiles = [...sitePublishedFiles, ...externalRefScopes]

  const mtimeMap = gitMtimeMap(repoRoot, 'docs')
  const deprecated = discoverDeprecatedSkills(repoRoot)

  const findings: Finding[] = []
  findings.push(...checkDeadInternalLinks(sitePublishedFiles, repoRoot))
  findings.push(...checkBrokenCraneDocReferences(referenceScanFiles, repoRoot))
  findings.push(...checkDeprecatedSkillMentions(referenceScanFiles, repoRoot, deprecated))
  findings.push(
    ...checkStaleByGit(sitePublishedFiles, repoRoot, mtimeMap, input.stale_threshold_days)
  )
  findings.push(...checkSidebarDrift(repoRoot, sidebar))
  findings.push(
    ...checkCaptainReviewCandidates(
      sitePublishedFiles,
      repoRoot,
      mtimeMap,
      input.stale_threshold_days
    )
  )

  const severityRank: Record<Severity, number> = { error: 3, warn: 2, info: 1 }
  const filtered = findings.filter((f) => {
    if (input.severity_filter === 'all') return true
    if (input.severity_filter === 'error') return f.severity === 'error'
    if (input.severity_filter === 'warn') return severityRank[f.severity] >= 2
    if (input.severity_filter === 'info') return severityRank[f.severity] >= 1
    return true
  })

  const dirs = classifyDocsDirs(repoRoot, sidebar.autogenerate_dirs)
  const inventory: AuditInventory = {
    total_docs: allFiles.length,
    site_published_dirs: dirs.site_published,
    non_published_dirs: dirs.non_published,
  }

  const auditToolBroken = filtered.some((f) => f.type === 'audit-tool-broken')
  const summary = buildSummary(filtered, inventory, auditToolBroken)
  return { inventory, findings: filtered, audit_tool_broken: auditToolBroken, summary }
}

function buildSummary(findings: Finding[], inventory: AuditInventory, toolBroken: boolean): string {
  if (toolBroken) {
    return `audit-tool-broken — sidebar parser or environment failed; report incomplete.`
  }
  const errors = findings.filter((f) => f.severity === 'error').length
  const warns = findings.filter((f) => f.severity === 'warn').length
  const infos = findings.filter((f) => f.severity === 'info').length
  const parts = [
    `${inventory.total_docs} doc(s) audited across ${inventory.site_published_dirs.length} site-published dir(s) and ${inventory.non_published_dirs.length} non-published dir(s).`,
    `Findings: ${errors} error / ${warns} warn / ${infos} info.`,
  ]
  if (errors === 0 && warns === 0) parts.push('No actionable drift.')
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatReport(result: DocsDriftAuditResult): string {
  const lines: string[] = ['## Docs Drift Audit Report', '']

  lines.push('### Inventory')
  lines.push(`- ${result.inventory.total_docs} markdown file(s) audited`)
  lines.push(
    `- Site-published dirs (${result.inventory.site_published_dirs.length}): ${
      result.inventory.site_published_dirs.join(', ') || '(none)'
    }`
  )
  lines.push(
    `- Non-published dirs (${result.inventory.non_published_dirs.length}): ${
      result.inventory.non_published_dirs.join(', ') || '(none)'
    }`
  )
  lines.push('')

  const errors = result.findings.filter((f) => f.severity === 'error')
  const warns = result.findings.filter((f) => f.severity === 'warn')
  const infos = result.findings.filter((f) => f.severity === 'info')

  lines.push('### Drift Summary')
  lines.push('')
  lines.push('| Severity | Count |')
  lines.push('|----------|-------|')
  lines.push(`| ERROR    | ${errors.length} |`)
  lines.push(`| WARN     | ${warns.length} |`)
  lines.push(`| INFO     | ${infos.length} |`)
  lines.push('')

  if (result.audit_tool_broken) {
    lines.push(
      '> **AUDIT-TOOL-BROKEN**: report is incomplete; fix self-diagnostic ERRORs before trusting findings below.'
    )
    lines.push('')
  }

  if (errors.length > 0) {
    lines.push('### Errors')
    for (const f of errors) lines.push(formatFinding(f))
    lines.push('')
  }

  if (warns.length > 0) {
    lines.push('### Warnings')
    for (const f of warns) lines.push(formatFinding(f))
    lines.push('')
  }

  if (infos.length > 0) {
    const byType = new Map<string, Finding[]>()
    for (const f of infos) {
      const list = byType.get(f.type) ?? []
      list.push(f)
      byType.set(f.type, list)
    }
    lines.push('### Info')
    for (const [type, items] of byType) {
      lines.push(`**${type}** (${items.length})`)
      for (const f of items.slice(0, 25)) lines.push(formatFinding(f))
      if (items.length > 25) lines.push(`- _… ${items.length - 25} more not shown_`)
      lines.push('')
    }
  }

  lines.push('### Cadence')
  lines.push(
    '> Completion result: `success` if the audit ran cleanly (regardless of drift). `failure` only on tool error or audit-tool-broken self-diagnostic.'
  )
  lines.push('')
  lines.push('### Summary')
  lines.push(result.summary)

  return lines.join('\n')
}

function formatFinding(f: Finding): string {
  const loc = f.line ? `:${f.line}` : ''
  return `- **${f.type}** \`${f.file}${loc}\` — ${f.detail}`
}
