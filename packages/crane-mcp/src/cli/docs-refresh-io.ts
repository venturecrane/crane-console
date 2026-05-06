/**
 * docs-refresh-io - filesystem I/O, data fetching, rendering, and orchestration.
 *
 * Extracted from docs-refresh.ts to stay within the 500-line file ceiling.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type {
  PageType,
  RendererName,
  VentureRefreshConfig,
  RefreshConfig,
  AuditEntry,
  PrItem,
  IssueItem,
  RefreshOneResult,
  PageTarget,
  CliArgs,
  DataFetcher,
} from './docs-refresh-types.js'
import { MARKED_PAGES, ALL_PAGE_TYPES, BODY_LEAD, PARAGRAPH_TAIL } from './docs-refresh-types.js'
import { parseMarkers, replaceBlockBody } from './docs-refresh-markers.js'

// Path constants are passed in from docs-refresh.ts to avoid circular imports.
let _docsVenturesDir: string
let _refreshConfigPath: string
let _craneConsoleRoot: string

export function initPaths(craneConsoleRoot: string): void {
  _craneConsoleRoot = craneConsoleRoot
  _docsVenturesDir = join(craneConsoleRoot, 'docs', 'ventures')
  _refreshConfigPath = join(craneConsoleRoot, 'config', 'docs-refresh.json')
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

export function pagePath(venture: string, page: PageType): string {
  return join(_docsVenturesDir, venture, `${page}.md`)
}

export function listVentures(): string[] {
  if (!existsSync(_docsVenturesDir)) return []
  return readdirSync(_docsVenturesDir).filter((entry) => {
    const stat = readdirSync(join(_docsVenturesDir, entry), { withFileTypes: false })
    return Array.isArray(stat)
  })
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function stripFeatPrefix(title: string): string {
  return title.replace(/^feat(\([^)]*\))?:\s*/, '')
}

// Escape markdown special chars that prettier auto-escapes in inline text.
export function mdEscape(s: string): string {
  return s.replace(/\*/g, '\\*').replace(/_/g, '\\_')
}

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

// ---------------------------------------------------------------------------
// Data fetchers (gh CLI subprocess)
// ---------------------------------------------------------------------------

// Subprocess invocation uses execFileSync with an argv array — never a shell
// string. Shell-metacharacter injection is structurally impossible regardless of input.
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
    const rows: { number: number; title: string; mergedAt: string }[] = JSON.parse(
      out
    ) as typeof rows
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
    const rows: { number: number; title: string }[] = JSON.parse(out) as typeof rows
    return rows
  },
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

export function loadRefreshConfig(): RefreshConfig {
  if (!existsSync(_refreshConfigPath)) {
    throw new Error(`config/docs-refresh.json not found at ${_refreshConfigPath}`)
  }
  const raw: unknown = JSON.parse(readFileSync(_refreshConfigPath, 'utf-8'))
  const r = raw as Record<string, unknown>
  const limits = (r.limits ?? {}) as Record<string, unknown>
  return {
    ventures: (r.ventures as RefreshConfig['ventures']) || {},
    limits: {
      shippedRecent: (limits.shippedRecent as number) ?? 5,
      completedHistory: (limits.completedHistory as number) ?? 10,
      currentFocus: (limits.currentFocus as number) ?? 10,
      nearTerm: (limits.nearTerm as number) ?? 10,
    },
  }
}

// ---------------------------------------------------------------------------
// Audit mode
// ---------------------------------------------------------------------------

export function auditAllVenturePages(): AuditEntry[] {
  const entries: AuditEntry[] = []
  if (!existsSync(_docsVenturesDir)) return entries
  for (const venture of readdirSync(_docsVenturesDir)) {
    for (const page of ALL_PAGE_TYPES) {
      const path = pagePath(venture, page)
      if (!existsSync(path)) continue
      const content = readFileSync(path, 'utf-8')
      const lines = content.split('\n').length
      let blocks = [] as ReturnType<typeof parseMarkers>
      try {
        blocks = parseMarkers(content)
      } catch {
        // malformed — treat as no markers
      }
      const expected = MARKED_PAGES[page]
      const have = blocks.map((b) => b.name)
      const missing = expected.filter((e) => !have.includes(e))
      entries.push({
        venture,
        page,
        path: path.replace(_craneConsoleRoot + '/', ''),
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
      for (const venture of Object.keys(config.ventures)) {
        targets.push({ venture, page: scope as PageType })
      }
    } else {
      for (const page of ALL_PAGE_TYPES) {
        if (MARKED_PAGES[page].length === 0) continue
        targets.push({ venture: scope, page })
      }
    }
  }
  return targets
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

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
// Render orchestration for one page
// ---------------------------------------------------------------------------

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
  const blocks = parseMarkers(before)
  const presentNames = new Set(blocks.map((b) => b.name))
  const missing = expectedMarkers.filter((m) => !presentNames.has(m))
  const presentExpected = expectedMarkers.filter((m) => presentNames.has(m))

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

// ---------------------------------------------------------------------------
// Refresh mode: per-target write logic
// ---------------------------------------------------------------------------

export function writeRefreshedPage(
  result: RefreshOneResult,
  dryRun: boolean,
  craneConsoleRoot: string
): void {
  if (!dryRun) writeFileSync(result.path, result.after)
  const relPath = result.path.replace(craneConsoleRoot + '/', '')
  console.log(
    `  ${dryRun ? '[dry-run] ' : ''}refreshed ${relPath} — blocks: [${result.changedBlocks.join(', ')}]`
  )
}

export function warnMissingMarkers(
  result: RefreshOneResult,
  venture: string,
  craneConsoleRoot: string
): void {
  if (result.missingMarkers.length === 0) return
  const relPath = result.path.replace(craneConsoleRoot + '/', '')
  console.warn(
    `    note (${relPath}): missing markers ${JSON.stringify(result.missingMarkers)} (run --init-markers ${venture} after normalizing page structure)`
  )
}
