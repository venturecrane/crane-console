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
 * Drift counts go in the summary; conflating "audit ran" with "drift exists"
 * trains operators to ignore the cadence engine. Existing audits may have the
 * same bug; not fixed here, flagged for separate decision.
 */

import { z } from 'zod'
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import matter from 'gray-matter'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'

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
// Constants
// ---------------------------------------------------------------------------

// Venture codes recognized by the upload pipeline (mirror of
// scripts/upload-doc-to-context-worker.sh repository case).
const VENTURE_CODES = new Set(['vc', 'sc', 'dfg', 'ke', 'smd', 'dc', 'ss'])

// Subdirs where global-scope docs may live, used by the crane_doc resolver
// when the call is basename-only with scope='global'. This list is descriptive
// of the current docs/ layout — if the layout changes substantially, the
// sidebar-drift check will catch it independently.
const GLOBAL_SEARCH_DIRS = [
  'company',
  'operations',
  'instructions',
  'process',
  'runbooks',
  'standards',
  'design-system',
  'adr',
  'infra',
  'memory',
  'skills',
]

// ---------------------------------------------------------------------------
// Console-root discovery
// ---------------------------------------------------------------------------

export function findConsoleRoot(startFrom?: string): string {
  const start = startFrom ?? new URL(import.meta.url).pathname
  const parts = start.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    const candidate = parts.slice(0, i).join('/')
    if (existsSync(join(candidate, 'CLAUDE.md')) && existsSync(join(candidate, 'docs'))) {
      return candidate
    }
  }
  return process.cwd()
}

// ---------------------------------------------------------------------------
// Filesystem walking
// ---------------------------------------------------------------------------

export function walkMarkdownFiles(rootDir: string): string[] {
  const out: string[] = []
  const stack = [rootDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (!dir || !existsSync(dir)) continue
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full)
      }
    }
  }
  return out.sort()
}

// ---------------------------------------------------------------------------
// Git mtime: single subprocess pass for the entire docs/ tree
// ---------------------------------------------------------------------------

export function gitMtimeMap(repoRoot: string, scopePath: string): Map<string, number> {
  // One subprocess: list every file under scopePath with its most recent
  // commit time. We use --name-only with --format=%ct, then parse the
  // alternating "timestamp / filenames" stream and keep the first (most
  // recent) timestamp per file.
  const result = new Map<string, number>()
  let stdout = ''
  try {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — scopePath is internally constructed from console-root + a fixed subdir, never from network input
    stdout = execSync(`git log --format=%ct --name-only --all -- "${scopePath}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    })
  } catch {
    return result
  }

  let currentTs = 0
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    if (/^\d+$/.test(line)) {
      currentTs = parseInt(line, 10)
      continue
    }
    // It's a filename relative to repoRoot. Keep the first (most-recent)
    // timestamp we see for each file.
    if (!result.has(line) && currentTs > 0) {
      result.set(line, currentTs)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Astro sidebar extraction via subprocess `import()`
// ---------------------------------------------------------------------------

export interface SidebarExtraction {
  autogenerate_dirs: string[]
  raw: unknown
  error?: string
  /** Set when the primary `import()` failed and we fell back to source parsing. */
  fallback?: 'source-parse'
}

export function extractAstroSidebar(repoRoot: string): SidebarExtraction {
  const configPath = join(repoRoot, 'site', 'astro.config.mjs')
  if (!existsSync(configPath)) {
    return { autogenerate_dirs: [], raw: null, error: 'site/astro.config.mjs not found' }
  }

  // Primary path: import() the config and walk the resolved sidebar tree.
  // Robust against config refactors. Requires site/ deps installed.
  const primary = extractAstroSidebarViaImport(repoRoot, configPath)
  if (primary.autogenerate_dirs.length > 0) return primary

  // Fallback: parse the source file for `directory: '<value>'` literals
  // inside `autogenerate: { ... }` blocks. Brittle to refactors but does not
  // require site/node_modules. Emits a non-fatal note so the operator knows
  // they're getting best-effort extraction.
  const fallback = extractAstroSidebarViaSource(configPath)
  if (fallback.autogenerate_dirs.length > 0) {
    return {
      ...fallback,
      fallback: 'source-parse',
      // Preserve the primary error message so the cadence/PR review can
      // see what would need fixing for full robustness.
      error: primary.error,
    }
  }

  // Both failed or both found zero entries.
  return {
    autogenerate_dirs: [],
    raw: null,
    error: primary.error ?? 'sidebar extraction returned zero entries via both paths',
  }
}

function extractAstroSidebarViaImport(repoRoot: string, configPath: string): SidebarExtraction {
  const script = `
    import('${configPath}').then((mod) => {
      const cfg = mod.default
      const dirs = []
      function walk(node) {
        if (!node) return
        if (Array.isArray(node)) { node.forEach(walk); return }
        if (typeof node !== 'object') return
        if (node.autogenerate && typeof node.autogenerate.directory === 'string') {
          dirs.push(node.autogenerate.directory)
        }
        for (const k of Object.keys(node)) {
          if (k === 'autogenerate') continue
          walk(node[k])
        }
      }
      walk(cfg)
      console.log(JSON.stringify({ autogenerate_dirs: dirs }))
    }).catch((e) => {
      console.log(JSON.stringify({ error: e.message }))
    })
  `

  // cwd=site/ so node's resolver finds astro + starlight in site/node_modules.
  const proc = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: join(repoRoot, 'site'),
    encoding: 'utf8',
    timeout: 30_000,
  })

  if (proc.error) {
    return { autogenerate_dirs: [], raw: null, error: proc.error.message }
  }
  if (proc.status !== 0 && !proc.stdout) {
    return {
      autogenerate_dirs: [],
      raw: null,
      error: `subprocess exit ${proc.status}: ${proc.stderr || 'no output'}`,
    }
  }

  try {
    const parsed = JSON.parse(proc.stdout.trim()) as {
      autogenerate_dirs?: string[]
      error?: string
    }
    if (parsed.error) {
      return { autogenerate_dirs: [], raw: null, error: parsed.error }
    }
    return {
      autogenerate_dirs: parsed.autogenerate_dirs ?? [],
      raw: parsed,
    }
  } catch (e) {
    return {
      autogenerate_dirs: [],
      raw: null,
      error: `failed to parse subprocess output: ${e instanceof Error ? e.message : 'unknown'}`,
    }
  }
}

function extractAstroSidebarViaSource(configPath: string): SidebarExtraction {
  let source: string
  try {
    source = readFileSync(configPath, 'utf8')
  } catch (e) {
    return {
      autogenerate_dirs: [],
      raw: null,
      error: `cannot read ${configPath}: ${e instanceof Error ? e.message : 'unknown'}`,
    }
  }
  // Match `directory:` followed by a single- or double-quoted string. Allow
  // any whitespace between `directory`, `:`, and the value.
  const re = /directory\s*:\s*['"]([^'"]+)['"]/g
  const dirs: string[] = []
  let match
  while ((match = re.exec(source)) !== null) {
    dirs.push(match[1])
  }
  return { autogenerate_dirs: dirs, raw: { source: 'fallback-regex' } }
}

// ---------------------------------------------------------------------------
// Markdown link extraction via remark AST
// ---------------------------------------------------------------------------

export interface ExtractedLink {
  url: string
  line: number
}

export function extractMarkdownLinks(content: string): ExtractedLink[] {
  const out: ExtractedLink[] = []
  let tree
  try {
    tree = unified().use(remarkParse).parse(content)
  } catch {
    return out
  }
  visit(tree, 'link', (node) => {
    const url = node.url
    const line = node.position?.start?.line ?? 0
    if (typeof url === 'string') {
      out.push({ url, line })
    }
  })
  visit(tree, 'definition', (node) => {
    const url = node.url
    const line = node.position?.start?.line ?? 0
    if (typeof url === 'string') {
      out.push({ url, line })
    }
  })
  return out
}

function isExternalUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
}

function isMarkdownTarget(url: string): boolean {
  const stripped = url.split('#')[0].split('?')[0]
  return stripped.endsWith('.md') || stripped.endsWith('.mdx')
}

function resolveLocalUrl(url: string, sourceFile: string, repoRoot: string): string | null {
  // Strip fragment + query
  let path = url.split('#')[0].split('?')[0]
  if (path === '') return null
  try {
    path = decodeURIComponent(path)
  } catch {
    // leave as-is on bad encoding
  }

  if (path.startsWith('/')) {
    // Treat root-anchored as repo-root anchored
    return join(repoRoot, path.replace(/^\/+/, ''))
  }
  return resolve(dirname(sourceFile), path)
}

// ---------------------------------------------------------------------------
// crane_doc() call extraction & resolution
// ---------------------------------------------------------------------------

export interface CraneDocCall {
  scope: string
  doc_name: string
  line: number
}

const CRANE_DOC_REGEX = /crane_doc\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g

export function extractCraneDocCalls(content: string): CraneDocCall[] {
  const out: CraneDocCall[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    CRANE_DOC_REGEX.lastIndex = 0
    let match
    while ((match = CRANE_DOC_REGEX.exec(line)) !== null) {
      out.push({ scope: match[1], doc_name: match[2], line: i + 1 })
    }
  }
  return out
}

/**
 * Resolve a `crane_doc(scope, doc_name)` call to a candidate on-disk path.
 * Returns the first match found, or null if none plausibly exist.
 *
 * This is a permissive existence check, not a mirror of the upload-time
 * scope/name transformation. The audit's purpose is to catch references to
 * deleted/renamed/typo'd files; matching the upload script's GLOBAL_DOCS
 * whitelist exactly would over-flag legitimate slash-form references in
 * CLAUDE.md and similar.
 */
export function resolveCraneDocCall(
  scope: string,
  docName: string,
  repoRoot: string
): string | null {
  const docsRoot = join(repoRoot, 'docs')
  const candidates: string[] = []

  // Dot-flattened design-system form: 'design-system.patterns.index.md'
  // resolves to 'docs/design-system/patterns/index.md' per the upload-time
  // transformation in scripts/upload-doc-to-context-worker.sh. Only valid
  // when scope='global'.
  if (scope === 'global' && docName.startsWith('design-system.') && docName.endsWith('.md')) {
    const base = docName.slice(0, -3) // strip '.md'
    const parts = base.split('.')
    candidates.push(join(docsRoot, ...parts) + '.md')
  }

  // Subdir-form: scope='global' and doc_name contains a slash, e.g.
  // 'design-system/patterns/index.md' or 'memory/governance.md'.
  if (docName.includes('/')) {
    if (scope === 'global') {
      candidates.push(join(docsRoot, docName))
    } else if (VENTURE_CODES.has(scope)) {
      candidates.push(join(docsRoot, 'ventures', scope, docName))
    }
  } else if (VENTURE_CODES.has(scope)) {
    // Venture-scoped basename
    candidates.push(join(docsRoot, 'ventures', scope, docName))
  } else if (scope === 'global') {
    // Global basename: search common dirs
    for (const dir of GLOBAL_SEARCH_DIRS) {
      candidates.push(join(docsRoot, dir, docName))
    }
  }

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

// ---------------------------------------------------------------------------
// Deprecated-skill registry
// ---------------------------------------------------------------------------

export interface DeprecatedSkill {
  name: string
  path: string
}

export function discoverDeprecatedSkills(repoRoot: string): DeprecatedSkill[] {
  const out: DeprecatedSkill[] = []
  const skillsDir = join(repoRoot, '.agents', 'skills')
  if (!existsSync(skillsDir)) return out
  let entries
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillFile = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    let parsed
    try {
      const raw = readFileSync(skillFile, 'utf8')
      parsed = matter(raw).data as Record<string, unknown>
    } catch {
      continue
    }
    if (parsed.status === 'deprecated') {
      const skillName =
        typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : entry.name
      out.push({ name: skillName, path: skillFile })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Site-published vs non-published dirs
// ---------------------------------------------------------------------------

export function classifyDocsDirs(
  repoRoot: string,
  sidebarDirs: string[]
): { site_published: string[]; non_published: string[] } {
  const docsRoot = join(repoRoot, 'docs')
  const allDirs: string[] = []
  if (existsSync(docsRoot)) {
    for (const entry of readdirSync(docsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) allDirs.push(entry.name)
    }
  }
  const sitePublishedSet = new Set<string>()
  for (const dir of sidebarDirs) {
    // sidebar entries can be like 'ventures/vc'; the top-level dir is the
    // first segment.
    sitePublishedSet.add(dir.split('/')[0])
  }
  return {
    site_published: allDirs.filter((d) => sitePublishedSet.has(d)).sort(),
    non_published: allDirs.filter((d) => !sitePublishedSet.has(d)).sort(),
  }
}

// ---------------------------------------------------------------------------
// Six drift checks
// ---------------------------------------------------------------------------

export function checkDeadInternalLinks(files: string[], repoRoot: string): Finding[] {
  const findings: Finding[] = []
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const links = extractMarkdownLinks(content)
    for (const link of links) {
      if (isExternalUrl(link.url)) continue
      if (link.url.startsWith('#')) continue // pure fragment
      if (!isMarkdownTarget(link.url)) continue // skip non-md targets (images, etc.)
      const resolved = resolveLocalUrl(link.url, file, repoRoot)
      if (!resolved) continue
      if (!existsSync(resolved)) {
        findings.push({
          severity: 'error',
          type: 'dead-internal-link',
          file: relative(repoRoot, file),
          line: link.line,
          detail: `link target not found: ${link.url}`,
        })
      }
    }
  }
  return findings
}

export function checkBrokenCraneDocReferences(files: string[], repoRoot: string): Finding[] {
  const findings: Finding[] = []
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const calls = extractCraneDocCalls(content)
    for (const call of calls) {
      // Skip placeholder scopes/names: '{code}', '{venture}', etc.
      if (/[{<]/.test(call.scope) || /[{<]/.test(call.doc_name)) continue
      // Skip calls whose scope is not 'global' or a known venture code —
      // these are documentation examples (literal 'scope'/'name'), not
      // typos of real calls.
      if (call.scope !== 'global' && !VENTURE_CODES.has(call.scope)) continue
      const resolved = resolveCraneDocCall(call.scope, call.doc_name, repoRoot)
      if (!resolved) {
        findings.push({
          severity: 'error',
          type: 'broken-crane-doc-reference',
          file: relative(repoRoot, file),
          line: call.line,
          detail: `crane_doc('${call.scope}', '${call.doc_name}') has no matching file under docs/`,
        })
      }
    }
  }
  return findings
}

export function checkDeprecatedSkillMentions(
  files: string[],
  repoRoot: string,
  deprecated: DeprecatedSkill[]
): Finding[] {
  const findings: Finding[] = []
  if (deprecated.length === 0) return findings
  // Build a regex that matches any deprecated skill name as a slash-prefixed
  // command or as a bareword token. We avoid false positives on substrings.
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = content.split('\n')
    for (const skill of deprecated) {
      const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // /name or `name` or "name" tokens — prefer slash-form to avoid false positives
      const re = new RegExp(`(^|[^\\w])(/${escaped}|\`${escaped}\`)(?=$|[^\\w])`, 'g')
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0
        if (re.test(lines[i])) {
          findings.push({
            severity: 'warn',
            type: 'deprecated-skill-mention',
            file: relative(repoRoot, file),
            line: i + 1,
            detail: `references deprecated skill: ${skill.name}`,
          })
        }
      }
    }
  }
  return findings
}

export function checkStaleByGit(
  files: string[],
  repoRoot: string,
  mtimeMap: Map<string, number>,
  thresholdDays: number,
  now: Date = new Date()
): Finding[] {
  const findings: Finding[] = []
  const thresholdSec = thresholdDays * 86_400
  const nowSec = Math.floor(now.getTime() / 1000)
  for (const file of files) {
    const rel = relative(repoRoot, file)
    const ts = mtimeMap.get(rel)
    if (!ts) continue // never committed; skip rather than flag
    const ageDays = Math.floor((nowSec - ts) / 86_400)
    if (nowSec - ts > thresholdSec) {
      findings.push({
        severity: 'info',
        type: 'stale-by-git',
        file: rel,
        detail: `untouched for ${ageDays}d (threshold ${thresholdDays}d)`,
      })
    }
  }
  // Sort worst-first
  findings.sort((a, b) => {
    const ad = parseInt(a.detail.match(/(\d+)d/)?.[1] ?? '0', 10)
    const bd = parseInt(b.detail.match(/(\d+)d/)?.[1] ?? '0', 10)
    return bd - ad
  })
  return findings
}

export function checkSidebarDrift(repoRoot: string, sidebar: SidebarExtraction): Finding[] {
  const findings: Finding[] = []

  // Self-diagnostic: zero-extraction is suspicious — this is a config we know
  // contains entries. Likely a parser failure, not a clean docs/ tree. Only
  // fire audit-tool-broken if BOTH the import() and source-parse paths
  // failed — having dirs from the fallback means the rest of the audit is
  // still trustworthy.
  if (sidebar.autogenerate_dirs.length === 0) {
    findings.push({
      severity: 'error',
      type: 'audit-tool-broken',
      file: 'site/astro.config.mjs',
      detail: sidebar.error
        ? `sidebar parser failed: ${sidebar.error}`
        : 'sidebar parser found zero autogenerate directories — config shape may have changed',
    })
    return findings
  }

  // Best-effort note: if we fell back to source-parse, surface that the
  // robust path failed. This is INFO because the audit's findings are still
  // valid — just less robust to future config refactors.
  if (sidebar.fallback === 'source-parse') {
    findings.push({
      severity: 'info',
      type: 'sidebar-import-fallback',
      file: 'site/astro.config.mjs',
      detail:
        `import() failed (likely site/node_modules missing); used regex source-parse fallback. ${
          sidebar.error ?? ''
        }`.trim(),
    })
  }

  // Autogenerate dirs that don't exist or are empty on disk
  const docsRoot = join(repoRoot, 'docs')
  for (const dir of sidebar.autogenerate_dirs) {
    const full = join(docsRoot, dir)
    if (!existsSync(full)) {
      findings.push({
        severity: 'info',
        type: 'sidebar-drift',
        file: `docs/${dir}`,
        detail: 'sidebar references this directory but it does not exist',
      })
      continue
    }
    let entries
    try {
      entries = readdirSync(full).filter((n) => n.endsWith('.md'))
    } catch {
      entries = []
    }
    if (entries.length === 0) {
      findings.push({
        severity: 'info',
        type: 'sidebar-drift',
        file: `docs/${dir}`,
        detail: 'sidebar references this directory but it has no markdown files',
      })
    }
  }

  // Top-level docs/ subdirs not in any autogenerate entry (informational —
  // some are intentionally non-published like handoffs, memory)
  const sitePublishedTops = new Set(sidebar.autogenerate_dirs.map((d) => d.split('/')[0]))
  const allTops: string[] = []
  if (existsSync(docsRoot)) {
    for (const entry of readdirSync(docsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) allTops.push(entry.name)
    }
  }
  // We don't flag missing-from-sidebar as a finding — known intentional dirs
  // (handoffs, memory, pm, research, reviews, anthropic-partnership,
  // ci-verification, skills) are non-published by policy. The inventory
  // section will surface counts.
  void allTops
  void sitePublishedTops

  return findings
}

export function checkCaptainReviewCandidates(
  files: string[],
  repoRoot: string,
  mtimeMap: Map<string, number>,
  thresholdDays: number,
  now: Date = new Date()
): Finding[] {
  const findings: Finding[] = []
  const thresholdSec = thresholdDays * 86_400
  const nowSec = Math.floor(now.getTime() / 1000)
  for (const file of files) {
    const rel = relative(repoRoot, file)
    const ts = mtimeMap.get(rel)
    if (!ts) continue
    if (nowSec - ts <= thresholdSec) continue
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (content.includes('TBD') || content.includes('TODO')) continue
    const fm = (() => {
      try {
        return matter(content).data as Record<string, unknown>
      } catch {
        return {}
      }
    })()
    if (fm.auto_generated === true || fm.auto_generate === true) continue
    const ageDays = Math.floor((nowSec - ts) / 86_400)
    findings.push({
      severity: 'info',
      type: 'captain-review-candidate',
      file: rel,
      detail: `narrative doc untouched for ${ageDays}d — verify still accurate`,
    })
  }
  findings.sort((a, b) => {
    const ad = parseInt(a.detail.match(/(\d+)d/)?.[1] ?? '0', 10)
    const bd = parseInt(b.detail.match(/(\d+)d/)?.[1] ?? '0', 10)
    return bd - ad
  })
  return findings
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

  // 1. Sidebar extraction (early — needed for site-published classification)
  const sidebar = extractAstroSidebar(repoRoot)

  // 2. Walk markdown files
  const scopePath = input.scope ? join(docsRoot, input.scope) : docsRoot
  const allFiles = walkMarkdownFiles(scopePath)

  // 3. Build site-published set
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
    // Also accept ventures/* explicitly
    if (rel.startsWith('ventures/')) {
      const ventureDir = rel.split('/').slice(0, 2).join('/')
      return sitePublishedSet.has('ventures') || sitePublishedSet.has(ventureDir)
    }
    return false
  }

  const sitePublishedFiles = allFiles.filter(isSitePublished)
  // Reference-scan scope: site-published docs (drift in non-published like
  // handoffs/ does not affect site truth) PLUS external files that drive
  // agent behavior (CLAUDE.md, skills, commands). A broken crane_doc() call
  // in a SKILL.md still wedges the agent workflow.
  const externalRefScopes = [
    join(repoRoot, 'CLAUDE.md'),
    ...walkMarkdownFiles(join(repoRoot, '.agents', 'skills')),
    ...walkMarkdownFiles(join(repoRoot, '.claude', 'commands')),
  ].filter((p) => existsSync(p))
  const referenceScanFiles = [...sitePublishedFiles, ...externalRefScopes]

  // 4. Build mtime map (single git log pass)
  const mtimeMap = gitMtimeMap(repoRoot, 'docs')

  // 5. Deprecation registry
  const deprecated = discoverDeprecatedSkills(repoRoot)

  // 6. Run checks
  const findings: Finding[] = []
  // Dead-link check: site-published docs only. Site truth is the audit's
  // purpose; relative-path links in .claude/commands/ are mirror artifacts
  // that aren't navigated like docs.
  findings.push(...checkDeadInternalLinks(sitePublishedFiles, repoRoot))
  // crane_doc() and deprecated-skill checks: include external scopes because
  // those calls/mentions affect agent runtime behavior even when not on the
  // site.
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

  // 7. Filter by severity
  const severityRank: Record<Severity, number> = { error: 3, warn: 2, info: 1 }
  const filtered = findings.filter((f) => {
    if (input.severity_filter === 'all') return true
    if (input.severity_filter === 'error') return f.severity === 'error'
    if (input.severity_filter === 'warn') return severityRank[f.severity] >= 2
    if (input.severity_filter === 'info') return severityRank[f.severity] >= 1
    return true
  })

  // 8. Inventory
  const dirs = classifyDocsDirs(repoRoot, sidebar.autogenerate_dirs)
  const inventory: AuditInventory = {
    total_docs: allFiles.length,
    site_published_dirs: dirs.site_published,
    non_published_dirs: dirs.non_published,
  }

  const auditToolBroken = filtered.some((f) => f.type === 'audit-tool-broken')

  const summary = buildSummary(filtered, inventory, auditToolBroken)
  return {
    inventory,
    findings: filtered,
    audit_tool_broken: auditToolBroken,
    summary,
  }
}

function buildSummary(findings: Finding[], inventory: AuditInventory, toolBroken: boolean): string {
  if (toolBroken) {
    return `audit-tool-broken — sidebar parser or environment failed; report incomplete.`
  }
  const errors = findings.filter((f) => f.severity === 'error').length
  const warns = findings.filter((f) => f.severity === 'warn').length
  const infos = findings.filter((f) => f.severity === 'info').length
  const parts: string[] = [
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

  // Inventory
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

  // Drift summary
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
    for (const f of errors) {
      lines.push(formatFinding(f))
    }
    lines.push('')
  }

  if (warns.length > 0) {
    lines.push('### Warnings')
    for (const f of warns) {
      lines.push(formatFinding(f))
    }
    lines.push('')
  }

  if (infos.length > 0) {
    // Group INFO by type for readability
    const byType = new Map<string, Finding[]>()
    for (const f of infos) {
      const list = byType.get(f.type) ?? []
      list.push(f)
      byType.set(f.type, list)
    }
    lines.push('### Info')
    for (const [type, items] of byType) {
      lines.push(`**${type}** (${items.length})`)
      for (const f of items.slice(0, 25)) {
        lines.push(formatFinding(f))
      }
      if (items.length > 25) {
        lines.push(`- _… ${items.length - 25} more not shown_`)
      }
      lines.push('')
    }
  }

  // Cadence note
  lines.push('### Cadence')
  lines.push(
    '> Completion result: `success` if the audit ran cleanly (regardless of drift). `failure` only on tool error or audit-tool-broken self-diagnostic.'
  )
  lines.push('')

  // Summary
  lines.push('### Summary')
  lines.push(result.summary)

  return lines.join('\n')
}

function formatFinding(f: Finding): string {
  const loc = f.line ? `:${f.line}` : ''
  return `- **${f.type}** \`${f.file}${loc}\` — ${f.detail}`
}
