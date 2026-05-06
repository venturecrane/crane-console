/**
 * docs-refresh - update site/docs managed blocks from canonical sources
 *
 * Token vocabulary already handled by site/scripts/sync-docs.mjs at build time:
 *   {{company:FIELD}}                   - name | state | operatorRole
 *   {{venture:CODE:FIELD}}              - top-level (code,name,org,repos,capabilities)
 *                                          OR portfolio (status,bvmStage,tagline,
 *                                                         description,techStack,url,showInPortfolio)
 *   {{portfolio:table}}                 - auto-generated portfolio matrix
 *   {{skills:table}}                    - auto-generated skills reference
 *
 * This CLI manages a different layer: managed-block markers within markdown
 * pages. Markers look like:
 *
 *   <!-- docs-refresh:activity-shipped -->
 *   ...generated content...
 *   <!-- /docs-refresh:activity-shipped -->
 *
 * Four renderers, two marked page types:
 *   product-overview: [activity-shipped]
 *   roadmap:          [activity-current-focus, activity-near-term, activity-completed]
 *   metrics:          (no markers in v1 — placeholder-preserving renderer is a no-op)
 *
 * Usage:
 *   npm run docs-refresh                                # audit mode
 *   npm run docs-refresh -- <code>                      # refresh all marked pages for venture
 *   npm run docs-refresh -- <code>/<page>               # refresh single page
 *   npm run docs-refresh -- --init-markers <code>       # seed markers into pages
 *   npm run docs-refresh -- --json                      # machine-readable output
 *   npm run docs-refresh -- --dry-run <code>            # render but don't write files
 */

import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Repo root resolution (compiled at dist/cli/docs-refresh.js — 4 levels up)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
export const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..')

const VENTURES_PATH = join(CRANE_CONSOLE_ROOT, 'config', 'ventures.json')
const REFRESH_CONFIG_PATH = join(CRANE_CONSOLE_ROOT, 'config', 'docs-refresh.json')
const DOCS_VENTURES_DIR = join(CRANE_CONSOLE_ROOT, 'docs', 'ventures')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageType = 'product-overview' | 'metrics' | 'roadmap'

export type RendererName =
  | 'activity-shipped'
  | 'activity-current-focus'
  | 'activity-near-term'
  | 'activity-completed'

export interface VentureRefreshConfig {
  primaryRepo: string
  labels: { in_progress: string; ready: string }
  shippedSearch: string
}

export interface RefreshConfig {
  ventures: Record<string, VentureRefreshConfig>
  limits: {
    shippedRecent: number
    completedHistory: number
    currentFocus: number
    nearTerm: number
  }
}

export interface MarkerBlock {
  name: string
  startLine: number // 1-based
  endLine: number // 1-based, inclusive of close marker line
  body: string // content between (not including) markers
}

export interface AuditEntry {
  venture: string
  page: PageType
  path: string
  lines: number
  hasMarkers: boolean
  markerNames: string[]
  expectedMarkers: string[]
  missingMarkers: string[]
}

export interface PrItem {
  number: number
  title: string
  mergedAt: string
}

export interface IssueItem {
  number: number
  title: string
}

// ---------------------------------------------------------------------------
// Page-type → renderer registry
// ---------------------------------------------------------------------------

export const MARKED_PAGES: Record<PageType, RendererName[]> = {
  'product-overview': ['activity-shipped'],
  metrics: [],
  roadmap: ['activity-current-focus', 'activity-near-term', 'activity-completed'],
}

export const ALL_PAGE_TYPES: PageType[] = ['product-overview', 'metrics', 'roadmap']

// Init-mode anchor strategy per renderer.
// 'wrap-after-heading' wraps the body following an existing H2 in markers (case-insensitive heading match).
//                      Only wraps when the section content is a bullet list — bails with warning otherwise.
// 'append-as-new-section' creates a new H2 + marker block at end of file (used when no preexisting heading is expected).
export interface InitAnchor {
  heading: string
  mode: 'wrap-after-heading' | 'append-as-new-section'
}

export const INIT_ANCHORS: Record<RendererName, InitAnchor> = {
  'activity-shipped': { heading: '## Recent Activity', mode: 'append-as-new-section' },
  'activity-current-focus': { heading: '## Current Focus', mode: 'wrap-after-heading' },
  'activity-near-term': { heading: '## Near-term', mode: 'wrap-after-heading' },
  'activity-completed': { heading: '## Completed', mode: 'wrap-after-heading' },
}

// ---------------------------------------------------------------------------
// Marker parsing
// ---------------------------------------------------------------------------

const OPEN_RX = /^<!-- docs-refresh:([a-z][a-z0-9-]*) -->\s*$/
const CLOSE_RX = /^<!-- \/docs-refresh:([a-z][a-z0-9-]*) -->\s*$/

export function parseMarkers(content: string): MarkerBlock[] {
  const lines = content.split('\n')
  const blocks: MarkerBlock[] = []
  const seen = new Set<string>()
  let openName: string | null = null
  let openLine = 0
  let bodyStart = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const line = lines[i]
    const openMatch = line.match(OPEN_RX)
    const closeMatch = line.match(CLOSE_RX)

    if (openMatch) {
      if (openName !== null) {
        throw new Error(
          `Nested marker: '${openMatch[1]}' opened at line ${lineNo} while '${openName}' (line ${openLine}) is still open`
        )
      }
      openName = openMatch[1]
      openLine = lineNo
      bodyStart = i + 1
    } else if (closeMatch) {
      const name = closeMatch[1]
      if (openName === null) {
        throw new Error(`Closing marker '${name}' at line ${lineNo} has no matching open`)
      }
      if (name !== openName) {
        throw new Error(
          `Mismatched markers: opened '${openName}' at line ${openLine}, but found close '${name}' at line ${lineNo}`
        )
      }
      if (seen.has(name)) {
        throw new Error(`Duplicate marker '${name}' on same page (second close at line ${lineNo})`)
      }
      seen.add(name)
      const bodyLines = lines.slice(bodyStart, i)
      blocks.push({
        name,
        startLine: openLine,
        endLine: lineNo,
        body: bodyLines.join('\n'),
      })
      openName = null
    }
  }

  if (openName !== null) {
    throw new Error(`Unclosed marker '${openName}' opened at line ${openLine}`)
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Diff gate (structural)
// ---------------------------------------------------------------------------

export interface DiffGateResult {
  ok: boolean
  reason?: string
}

export function diffGate(before: string, after: string): DiffGateResult {
  let beforeBlocks: MarkerBlock[]
  let afterBlocks: MarkerBlock[]
  try {
    beforeBlocks = parseMarkers(before)
    afterBlocks = parseMarkers(after)
  } catch (err) {
    return { ok: false, reason: `parse error: ${(err as Error).message}` }
  }

  const beforeNames = beforeBlocks.map((b) => b.name).sort()
  const afterNames = afterBlocks.map((b) => b.name).sort()
  if (
    beforeNames.length !== afterNames.length ||
    !beforeNames.every((n, i) => n === afterNames[i])
  ) {
    return {
      ok: false,
      reason: `marker set changed: before=[${beforeNames.join(',')}] after=[${afterNames.join(',')}]`,
    }
  }

  // Outside-marker substring must be byte-equal across runs.
  const stripBlocks = (text: string, blocks: MarkerBlock[]): string => {
    if (blocks.length === 0) return text
    const lines = text.split('\n')
    const out: string[] = []
    let i = 0
    const sorted = [...blocks].sort((a, b) => a.startLine - b.startLine)
    while (i < lines.length) {
      const lineNo = i + 1
      const block = sorted.find((b) => lineNo >= b.startLine && lineNo <= b.endLine)
      if (block) {
        // Replace block with sentinel (marker name only) so positional bytes outside markers stay aligned
        if (lineNo === block.startLine) {
          out.push(`<<docs-refresh-block:${block.name}>>`)
        }
        i = block.endLine // skip past close (loop will i++ to next line)
      } else {
        out.push(lines[i])
      }
      i++
    }
    return out.join('\n')
  }

  const beforeStripped = stripBlocks(before, beforeBlocks)
  const afterStripped = stripBlocks(after, afterBlocks)
  if (beforeStripped !== afterStripped) {
    return { ok: false, reason: 'content outside managed blocks differs' }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

// Marker bodies are rendered to round-trip cleanly through prettier so the
// renderer + format-check cycle converges instead of ping-ponging on every run.
//
//   Bullet list body:   "\n- one\n- two"           (leading \n; no trailing)
//   Single-paragraph:   "\n_text_\n"               (leading + trailing \n; prettier flanks paragraphs with blank lines)
//
// Always escape '*' and '_' inside titles — both can otherwise trigger
// emphasis spans that prettier would auto-escape, breaking idempotency.
const BODY_LEAD = '\n'
const PARAGRAPH_TAIL = '\n'

export function renderActivityShipped(prs: PrItem[]): string {
  if (prs.length === 0) return BODY_LEAD + '_No recent shipped activity._' + PARAGRAPH_TAIL
  return (
    BODY_LEAD +
    prs
      .map(
        (p) => `- #${p.number} ${mdEscape(stripFeatPrefix(p.title))} _(${p.mergedAt.slice(0, 10)})_`
      )
      .join('\n')
  )
}

export function renderActivityCompleted(prs: PrItem[]): string {
  if (prs.length === 0) return BODY_LEAD + '_No completed work yet._' + PARAGRAPH_TAIL
  return (
    BODY_LEAD +
    prs
      .map(
        (p) => `- #${p.number} ${mdEscape(stripFeatPrefix(p.title))} _(${p.mergedAt.slice(0, 10)})_`
      )
      .join('\n')
  )
}

export function renderIssueList(issues: IssueItem[], emptyMessage: string): string {
  if (issues.length === 0) return BODY_LEAD + emptyMessage + PARAGRAPH_TAIL
  return BODY_LEAD + issues.map((i) => `- #${i.number} ${mdEscape(i.title)}`).join('\n')
}

function stripFeatPrefix(title: string): string {
  return title.replace(/^feat(\([^)]*\))?:\s*/, '')
}

// Escape markdown special chars that prettier auto-escapes in inline text:
// '*' (italic/bold marker), '_' (underscore emphasis — prettier escapes intra-word too).
// Over-escape is harmless; under-escape breaks idempotency.
export function mdEscape(s: string): string {
  return s.replace(/\*/g, '\\*').replace(/_/g, '\\_')
}

// ---------------------------------------------------------------------------
// Data fetchers (gh CLI subprocess)
// ---------------------------------------------------------------------------

export interface DataFetcher {
  fetchMergedFeats(repo: string, search: string, limit: number): PrItem[]
  fetchIssuesByLabel(repo: string, label: string, limit: number): IssueItem[]
}

// Subprocess invocation uses execFileSync with an argv array — never a shell
// string. There is no shell parsing; arguments are passed as-is to gh, so
// shell-metacharacter injection is structurally impossible regardless of input.
export const ghFetcher: DataFetcher = {
  fetchMergedFeats(repo, search, limit) {
    const out = execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--repo',
        repo,
        '--state',
        'merged',
        '--limit',
        String(limit * 6),
        '--search',
        search,
        '--json',
        'number,title,mergedAt',
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
    const rows: { number: number; title: string; mergedAt: string }[] = JSON.parse(out)
    // Some titles may match the search but not literally start with `feat:` (e.g. body match).
    // Filter to true conventional-commit feat prefix to keep the rendered output crisp.
    return rows
      .filter((r) => /^feat(\([^)]*\))?:/.test(r.title))
      .slice(0, limit)
      .map((r) => ({ number: r.number, title: r.title, mergedAt: r.mergedAt }))
  },
  fetchIssuesByLabel(repo, label, limit) {
    const out = execFileSync(
      'gh',
      [
        'issue',
        'list',
        '--repo',
        repo,
        '--state',
        'open',
        '--label',
        label,
        '--limit',
        String(limit),
        '--json',
        'number,title',
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
    const rows: { number: number; title: string }[] = JSON.parse(out)
    return rows
  },
}

// ---------------------------------------------------------------------------
// Page discovery
// ---------------------------------------------------------------------------

export function pagePath(venture: string, page: PageType): string {
  return join(DOCS_VENTURES_DIR, venture, `${page}.md`)
}

export function listVentures(): string[] {
  if (!existsSync(DOCS_VENTURES_DIR)) return []
  return readdirSync(DOCS_VENTURES_DIR).filter((entry) => {
    const stat = readdirSync(join(DOCS_VENTURES_DIR, entry), { withFileTypes: false })
    return Array.isArray(stat) // is a directory
  })
}

// ---------------------------------------------------------------------------
// Render orchestration for one page
// ---------------------------------------------------------------------------

export interface RefreshOneResult {
  path: string
  before: string
  after: string
  changedBlocks: string[]
  missingMarkers: string[]
  skipped: boolean
  skipReason?: string
}

export function refreshOnePage(
  venture: string,
  page: PageType,
  config: RefreshConfig,
  fetcher: DataFetcher
): RefreshOneResult {
  const path = pagePath(venture, page)
  const empty = { path, before: '', after: '', changedBlocks: [], missingMarkers: [] }
  if (!existsSync(path)) {
    return { ...empty, skipped: true, skipReason: 'page not found' }
  }
  const expectedMarkers = MARKED_PAGES[page]
  if (expectedMarkers.length === 0) {
    return { ...empty, skipped: true, skipReason: 'page type has no markers in v1' }
  }
  const before = readFileSync(path, 'utf-8')
  const blocks = parseMarkers(before) // throws on malformed
  const presentNames = new Set(blocks.map((b) => b.name))
  const missing = expectedMarkers.filter((m) => !presentNames.has(m))
  const presentExpected = expectedMarkers.filter((m) => presentNames.has(m))

  // No expected markers present — skip entirely (operator should run --init-markers).
  if (presentExpected.length === 0) {
    return {
      path,
      before,
      after: before,
      changedBlocks: [],
      missingMarkers: missing,
      skipped: true,
      skipReason: `no markers present (run --init-markers ${venture})`,
    }
  }

  const ventureCfg = config.ventures[venture]
  if (!ventureCfg) {
    return {
      path,
      before,
      after: before,
      changedBlocks: [],
      missingMarkers: missing,
      skipped: true,
      skipReason: `no config entry for venture '${venture}' in config/docs-refresh.json`,
    }
  }

  // Refresh whatever markers are present; report missing ones non-fatally.
  let after = before
  const changed: string[] = []
  for (const block of blocks) {
    if (!expectedMarkers.includes(block.name as RendererName)) continue
    const newBody = renderForBlock(block.name as RendererName, ventureCfg, config, fetcher)
    if (newBody !== block.body) changed.push(block.name)
    after = replaceBlockBody(after, block.name, newBody)
  }

  return { path, before, after, changedBlocks: changed, missingMarkers: missing, skipped: false }
}

export function renderForBlock(
  name: RendererName,
  v: VentureRefreshConfig,
  config: RefreshConfig,
  fetcher: DataFetcher
): string {
  switch (name) {
    case 'activity-shipped': {
      const prs = fetcher.fetchMergedFeats(
        v.primaryRepo,
        v.shippedSearch,
        config.limits.shippedRecent
      )
      return renderActivityShipped(prs)
    }
    case 'activity-completed': {
      const prs = fetcher.fetchMergedFeats(
        v.primaryRepo,
        v.shippedSearch,
        config.limits.completedHistory
      )
      return renderActivityCompleted(prs)
    }
    case 'activity-current-focus': {
      const issues = fetcher.fetchIssuesByLabel(
        v.primaryRepo,
        v.labels.in_progress,
        config.limits.currentFocus
      )
      return renderIssueList(issues, '_No work in progress._')
    }
    case 'activity-near-term': {
      const issues = fetcher.fetchIssuesByLabel(
        v.primaryRepo,
        v.labels.ready,
        config.limits.nearTerm
      )
      return renderIssueList(issues, '_Nothing queued up next._')
    }
  }
}

export function replaceBlockBody(content: string, name: string, newBody: string): string {
  const lines = content.split('\n')
  let openIdx = -1
  let closeIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const o = lines[i].match(OPEN_RX)
    const c = lines[i].match(CLOSE_RX)
    if (o && o[1] === name) openIdx = i
    if (c && c[1] === name) {
      closeIdx = i
      break
    }
  }
  if (openIdx === -1 || closeIdx === -1) {
    throw new Error(`replaceBlockBody: marker '${name}' not found`)
  }
  const newBodyLines = newBody.split('\n')
  return [...lines.slice(0, openIdx + 1), ...newBodyLines, ...lines.slice(closeIdx)].join('\n')
}

// ---------------------------------------------------------------------------
// Init-markers mode
// ---------------------------------------------------------------------------

export interface InitMarkersResult {
  content: string
  warnings: string[]
}

export function initMarkersForPageDetailed(content: string, page: PageType): InitMarkersResult {
  const renderers = MARKED_PAGES[page]
  let result = content
  const warnings: string[] = []
  for (const r of renderers) {
    if (parseMarkers(result).some((b) => b.name === r)) continue // already there
    const anchor = INIT_ANCHORS[r]
    if (anchor.mode === 'wrap-after-heading') {
      const wrap = tryWrapAfterHeading(result, anchor.heading, r)
      if (wrap.ok) {
        result = wrap.content
      } else {
        warnings.push(`skipped ${r}: ${wrap.reason}`)
      }
    } else {
      result = appendAsNewSection(result, anchor.heading, r)
    }
  }
  return { content: result, warnings }
}

// Backwards-compatible: returns just the content (used by e2e test fixture).
export function initMarkersForPage(content: string, page: PageType): string {
  return initMarkersForPageDetailed(content, page).content
}

interface WrapResult {
  ok: boolean
  content: string
  reason?: string
}

function tryWrapAfterHeading(content: string, heading: string, blockName: string): WrapResult {
  const lines = content.split('\n')
  const wantNorm = heading.trim().toLowerCase()
  const headingIdx = lines.findIndex((l) => l.trim().toLowerCase() === wantNorm)
  if (headingIdx === -1) {
    return {
      ok: false,
      content,
      reason: `heading '${heading}' not found (case-insensitive); skipping init for this block (run a normalization PR first if you want coverage)`,
    }
  }
  // Find end of section: next H1/H2, or EOF.
  let sectionEnd = lines.length
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      sectionEnd = i
      break
    }
  }
  // Trim trailing blank lines from section body.
  let bodyEnd = sectionEnd
  while (bodyEnd > headingIdx + 1 && lines[bodyEnd - 1].trim() === '') bodyEnd--
  // Find first non-blank line after heading (where actual content starts).
  let bodyStart = headingIdx + 1
  while (bodyStart < bodyEnd && lines[bodyStart].trim() === '') bodyStart++

  const body = lines.slice(bodyStart, bodyEnd)
  if (!isBulletListBody(body)) {
    return {
      ok: false,
      content,
      reason: `section under '${heading}' is not a bullet list (likely a table or prose); refusing to wrap to avoid renderer overreach`,
    }
  }

  const before = lines.slice(0, bodyStart)
  const after = lines.slice(bodyEnd)
  const wrapped = [
    ...before,
    `<!-- docs-refresh:${blockName} -->`,
    ...body,
    `<!-- /docs-refresh:${blockName} -->`,
    ...after,
  ]
  return { ok: true, content: wrapped.join('\n') }
}

// A "bullet list body" is a sequence of lines where every non-blank line
// starts with '- ' (or '* '). Trailing blank lines tolerated.
export function isBulletListBody(lines: string[]): boolean {
  let sawBullet = false
  for (const line of lines) {
    const t = line.trim()
    if (t === '') continue
    if (!/^[-*]\s/.test(t)) return false
    sawBullet = true
  }
  return sawBullet
}

function appendAsNewSection(content: string, heading: string, blockName: string): string {
  const trimmed = content.replace(/\s+$/, '')
  return (
    trimmed +
    '\n\n' +
    heading +
    '\n\n' +
    `<!-- docs-refresh:${blockName} -->\n` +
    `_(populated on next docs-refresh run)_\n` +
    `<!-- /docs-refresh:${blockName} -->\n`
  )
}

// ---------------------------------------------------------------------------
// Audit mode
// ---------------------------------------------------------------------------

export function auditAllVenturePages(): AuditEntry[] {
  const entries: AuditEntry[] = []
  if (!existsSync(DOCS_VENTURES_DIR)) return entries
  for (const venture of readdirSync(DOCS_VENTURES_DIR)) {
    for (const page of ALL_PAGE_TYPES) {
      const path = pagePath(venture, page)
      if (!existsSync(path)) continue
      const content = readFileSync(path, 'utf-8')
      const lines = content.split('\n').length
      let blocks: MarkerBlock[] = []
      try {
        blocks = parseMarkers(content)
      } catch {
        // Mark malformed; treat as no markers for audit purposes.
      }
      const expected = MARKED_PAGES[page]
      const have = blocks.map((b) => b.name)
      const missing = expected.filter((e) => !have.includes(e))
      entries.push({
        venture,
        page,
        path: path.replace(CRANE_CONSOLE_ROOT + '/', ''),
        lines,
        hasMarkers: blocks.length > 0,
        markerNames: have,
        expectedMarkers: expected,
        missingMarkers: missing,
      })
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

export function loadRefreshConfig(): RefreshConfig {
  if (!existsSync(REFRESH_CONFIG_PATH)) {
    throw new Error(`config/docs-refresh.json not found at ${REFRESH_CONFIG_PATH}`)
  }
  const raw = JSON.parse(readFileSync(REFRESH_CONFIG_PATH, 'utf-8'))
  return {
    ventures: raw.ventures || {},
    limits: {
      shippedRecent: raw.limits?.shippedRecent ?? 5,
      completedHistory: raw.limits?.completedHistory ?? 10,
      currentFocus: raw.limits?.currentFocus ?? 10,
      nearTerm: raw.limits?.nearTerm ?? 10,
    },
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export interface CliArgs {
  mode: 'audit' | 'refresh' | 'init-markers' | 'help'
  scopes: string[] // e.g. ['vc'] or ['vc/roadmap'] or ['vc', 'dfg']
  json: boolean
  dryRun: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'audit', scopes: [], json: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--init-markers') {
      args.mode = 'init-markers'
    } else if (a === '--json') {
      args.json = true
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else if (a === '-h' || a === '--help') {
      args.mode = 'help'
    } else if (!a.startsWith('-')) {
      args.scopes.push(a)
    }
  }
  if (args.mode !== 'init-markers' && args.mode !== 'help' && args.scopes.length > 0) {
    args.mode = 'refresh'
  }
  return args
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

export function formatAuditHuman(entries: AuditEntry[]): string {
  const lines: string[] = []
  lines.push(`Audited ${entries.length} venture page(s).`)
  lines.push('')
  for (const e of entries) {
    const status =
      e.expectedMarkers.length === 0
        ? '(no markers expected in v1)'
        : e.missingMarkers.length === 0
          ? `markers OK [${e.markerNames.join(', ')}]`
          : `MISSING markers: [${e.missingMarkers.join(', ')}]`
    lines.push(`  ${e.path} (${e.lines} lines) — ${status}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Scope expansion
// ---------------------------------------------------------------------------

export interface PageTarget {
  venture: string
  page: PageType
}

export function expandScopes(scopes: string[], config: RefreshConfig): PageTarget[] {
  const targets: PageTarget[] = []
  for (const scope of scopes) {
    if (scope.includes('/')) {
      const [venture, page] = scope.split('/') as [string, PageType]
      if (!ALL_PAGE_TYPES.includes(page)) {
        throw new Error(`Unknown page type '${page}'. Valid: ${ALL_PAGE_TYPES.join(', ')}`)
      }
      targets.push({ venture, page })
    } else if (ALL_PAGE_TYPES.includes(scope as PageType)) {
      // Page-type scope: apply to every configured venture.
      for (const venture of Object.keys(config.ventures)) {
        targets.push({ venture, page: scope as PageType })
      }
    } else {
      // Treat as venture code: apply to all marked page types for that venture.
      for (const page of ALL_PAGE_TYPES) {
        if (MARKED_PAGES[page].length === 0) continue
        targets.push({ venture: scope, page })
      }
    }
  }
  return targets
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)

  if (args.mode === 'help') {
    console.log(`docs-refresh — update site/docs managed blocks from canonical sources

Usage:
  docs-refresh                            # audit mode (no writes)
  docs-refresh <code>                     # refresh marked pages for one venture
  docs-refresh <code>/<page>              # refresh a single page
  docs-refresh <page-type>                # refresh page type across configured ventures
  docs-refresh --init-markers <code>      # seed markers (first-run, gate-bypassed)
  docs-refresh --dry-run <code>           # render but don't write
  docs-refresh --json                     # machine-readable output

Configuration: config/docs-refresh.json
Pages: docs/ventures/<code>/{product-overview,roadmap}.md (metrics has no markers in v1)`)
    return
  }

  if (args.mode === 'audit') {
    const entries = auditAllVenturePages()
    if (args.json) {
      console.log(JSON.stringify(entries, null, 2))
    } else {
      console.log(formatAuditHuman(entries))
    }
    return
  }

  const config = loadRefreshConfig()
  const targets = expandScopes(args.scopes, config)

  if (args.mode === 'init-markers') {
    let seeded = 0
    for (const t of targets) {
      const path = pagePath(t.venture, t.page)
      if (!existsSync(path)) continue
      if (MARKED_PAGES[t.page].length === 0) continue
      const before = readFileSync(path, 'utf-8')
      const result = initMarkersForPageDetailed(before, t.page)
      const relPath = path.replace(CRANE_CONSOLE_ROOT + '/', '')
      for (const w of result.warnings) {
        console.warn(`  warn (${relPath}): ${w}`)
      }
      if (result.content !== before) {
        if (!args.dryRun) writeFileSync(path, result.content)
        seeded++
        console.log(`  ${args.dryRun ? '[dry-run] ' : ''}seeded markers in ${relPath}`)
      } else if (result.warnings.length === 0) {
        console.log(`  no change: ${relPath}`)
      }
    }
    console.log(`\nSeeded ${seeded} page(s).`)
    return
  }

  // refresh mode
  let refreshed = 0
  let skipped = 0
  let gateFailed = 0
  for (const t of targets) {
    const result = refreshOnePage(t.venture, t.page, config, ghFetcher)
    if (result.skipped) {
      skipped++
      console.log(`  skip: ${t.venture}/${t.page} — ${result.skipReason}`)
      continue
    }
    if (result.before === result.after) {
      console.log(`  no change: ${result.path.replace(CRANE_CONSOLE_ROOT + '/', '')}`)
      continue
    }
    const gate = diffGate(result.before, result.after)
    if (!gate.ok) {
      gateFailed++
      console.error(
        `  GATE FAILURE on ${result.path.replace(CRANE_CONSOLE_ROOT + '/', '')}: ${gate.reason}`
      )
      continue
    }
    if (!args.dryRun) writeFileSync(result.path, result.after)
    refreshed++
    const relPath = result.path.replace(CRANE_CONSOLE_ROOT + '/', '')
    console.log(
      `  ${args.dryRun ? '[dry-run] ' : ''}refreshed ${relPath} — blocks: [${result.changedBlocks.join(', ')}]`
    )
    if (result.missingMarkers.length > 0) {
      console.warn(
        `    note (${relPath}): missing markers ${JSON.stringify(result.missingMarkers)} (run --init-markers ${t.venture} after normalizing page structure)`
      )
    }
  }
  console.log(`\nRefreshed ${refreshed} page(s); skipped ${skipped}; gate failures ${gateFailed}.`)
  if (gateFailed > 0) process.exit(2)
}

// Run when executed directly (not when imported by tests)
const isDirectInvocation = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectInvocation) {
  main().catch((err: Error) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
