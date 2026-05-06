/**
 * docs-refresh-types - shared type and constant definitions for docs-refresh.
 *
 * Extracted from docs-refresh.ts to stay within the 500-line file ceiling.
 */

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

export interface DiffGateResult {
  ok: boolean
  reason?: string
}

export interface RefreshOneResult {
  path: string
  before: string
  after: string
  changedBlocks: string[]
  missingMarkers: string[]
  skipped: boolean
  skipReason?: string
}

export interface InitMarkersResult {
  content: string
  warnings: string[]
}

export interface InitAnchor {
  heading: string
  mode: 'wrap-after-heading' | 'append-as-new-section'
}

export interface PageTarget {
  venture: string
  page: PageType
}

export interface CliArgs {
  mode: 'audit' | 'refresh' | 'init-markers' | 'help'
  scopes: string[] // e.g. ['vc'] or ['vc/roadmap'] or ['vc', 'dfg']
  json: boolean
  dryRun: boolean
}

export interface DataFetcher {
  fetchMergedFeats(repo: string, search: string, limit: number): PrItem[]
  fetchIssuesByLabel(repo: string, label: string, limit: number): IssueItem[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Page-type → renderer registry
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
export const INIT_ANCHORS: Record<RendererName, InitAnchor> = {
  'activity-shipped': { heading: '## Recent Activity', mode: 'append-as-new-section' },
  'activity-current-focus': { heading: '## Current Focus', mode: 'wrap-after-heading' },
  'activity-near-term': { heading: '## Near-term', mode: 'wrap-after-heading' },
  'activity-completed': { heading: '## Completed', mode: 'wrap-after-heading' },
}

// Marker body formatting conventions (prettier-compatible round-trip)
export const BODY_LEAD = '\n'
export const PARAGRAPH_TAIL = '\n'

// Marker regex patterns
export const OPEN_RX = /^<!-- docs-refresh:([a-z][a-z0-9-]*) -->\s*$/
export const CLOSE_RX = /^<!-- \/docs-refresh:([a-z][a-z0-9-]*) -->\s*$/
