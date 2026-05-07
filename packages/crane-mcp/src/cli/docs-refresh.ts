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

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Repo root resolution (compiled at dist/cli/docs-refresh.js — 4 levels up)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
export const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..')

// ---------------------------------------------------------------------------
// Re-exports — all public symbols remain importable from './docs-refresh.js'
// ---------------------------------------------------------------------------

export type {
  PageType,
  RendererName,
  VentureRefreshConfig,
  RefreshConfig,
  MarkerBlock,
  AuditEntry,
  PrItem,
  IssueItem,
  DiffGateResult,
  RefreshOneResult,
  InitMarkersResult,
  InitAnchor,
  PageTarget,
  CliArgs,
  DataFetcher,
} from './docs-refresh-types.js'

export { MARKED_PAGES, ALL_PAGE_TYPES, INIT_ANCHORS } from './docs-refresh-types.js'

export {
  parseMarkers,
  diffGate,
  replaceBlockBody,
  isBulletListBody,
  initMarkersForPage,
  initMarkersForPageDetailed,
} from './docs-refresh-markers.js'

export {
  pagePath,
  listVentures,
  mdEscape,
  renderActivityShipped,
  renderActivityCompleted,
  renderIssueList,
  renderForBlock,
  ghFetcher,
  loadRefreshConfig,
  auditAllVenturePages,
  formatAuditHuman,
  expandScopes,
  parseArgs,
  refreshOnePage,
} from './docs-refresh-io.js'

// ---------------------------------------------------------------------------
// Path initialisation (must run before any io functions are called)
// ---------------------------------------------------------------------------

import { initPaths } from './docs-refresh-io.js'
initPaths(CRANE_CONSOLE_ROOT)

// ---------------------------------------------------------------------------
// Main entry point — split into one handler per mode to keep complexity ≤ 15
// ---------------------------------------------------------------------------

import type { CliArgs, RefreshConfig, PageTarget } from './docs-refresh-types.js'
import {
  parseArgs,
  loadRefreshConfig,
  expandScopes,
  auditAllVenturePages,
  formatAuditHuman,
  refreshOnePage,
  pagePath,
  writeRefreshedPage,
  warnMissingMarkers,
} from './docs-refresh-io.js'
import { initMarkersForPageDetailed } from './docs-refresh-markers.js'
import { diffGate } from './docs-refresh-markers.js'
import { ghFetcher } from './docs-refresh-io.js'
import { MARKED_PAGES } from './docs-refresh-types.js'

const HELP_TEXT = `docs-refresh — update site/docs managed blocks from canonical sources

Usage:
  docs-refresh                            # audit mode (no writes)
  docs-refresh <code>                     # refresh marked pages for one venture
  docs-refresh <code>/<page>              # refresh a single page
  docs-refresh <page-type>                # refresh page type across configured ventures
  docs-refresh --init-markers <code>      # seed markers (first-run, gate-bypassed)
  docs-refresh --dry-run <code>           # render but don't write
  docs-refresh --json                     # machine-readable output

Configuration: config/docs-refresh.json
Pages: docs/ventures/<code>/{product-overview,roadmap}.md (metrics has no markers in v1)`

function runAudit(args: CliArgs): void {
  const entries = auditAllVenturePages()
  if (args.json) {
    console.log(JSON.stringify(entries, null, 2))
  } else {
    console.log(formatAuditHuman(entries))
  }
}

function runInitMarkers(targets: PageTarget[], args: CliArgs): void {
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
}

function runRefreshTarget(
  t: PageTarget,
  config: RefreshConfig,
  args: CliArgs,
  counters: { refreshed: number; skipped: number; gateFailed: number }
): void {
  const result = refreshOnePage(t.venture, t.page, config, ghFetcher)
  if (result.skipped) {
    counters.skipped++
    console.log(`  skip: ${t.venture}/${t.page} — ${result.skipReason}`)
    return
  }
  if (result.before === result.after) {
    console.log(`  no change: ${result.path.replace(CRANE_CONSOLE_ROOT + '/', '')}`)
    return
  }
  const gate = diffGate(result.before, result.after)
  if (!gate.ok) {
    counters.gateFailed++
    console.error(
      `  GATE FAILURE on ${result.path.replace(CRANE_CONSOLE_ROOT + '/', '')}: ${gate.reason}`
    )
    return
  }
  writeRefreshedPage(result, args.dryRun, CRANE_CONSOLE_ROOT)
  warnMissingMarkers(result, t.venture, CRANE_CONSOLE_ROOT)
  counters.refreshed++
}

function runRefresh(targets: PageTarget[], config: RefreshConfig, args: CliArgs): void {
  const counters = { refreshed: 0, skipped: 0, gateFailed: 0 }
  for (const t of targets) {
    runRefreshTarget(t, config, args, counters)
  }
  console.log(
    `\nRefreshed ${counters.refreshed} page(s); skipped ${counters.skipped}; gate failures ${counters.gateFailed}.`
  )
  if (counters.gateFailed > 0) process.exit(2)
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)

  if (args.mode === 'help') {
    console.log(HELP_TEXT)
    return
  }

  if (args.mode === 'audit') {
    runAudit(args)
    return
  }

  const config = loadRefreshConfig()
  const targets = expandScopes(args.scopes, config)

  if (args.mode === 'init-markers') {
    runInitMarkers(targets, args)
    return
  }

  runRefresh(targets, config, args)
}

// Run when executed directly (not when imported by tests)
const isDirectInvocation = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectInvocation) {
  main().catch((err: Error) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
