/**
 * Docs drift audit — utility functions
 *
 * Constants, filesystem/git helpers, sidebar extraction,
 * link/crane_doc extraction, deprecated-skill registry,
 * and docs-dir classification.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import matter from 'gray-matter'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Venture codes recognized by the upload pipeline (mirror of
// scripts/upload-doc-to-context-worker.sh repository case).
export const VENTURE_CODES = new Set(['vc', 'sc', 'dfg', 'ke', 'smd', 'dc', 'ss'])

// Subdirs where global-scope docs may live, used by the crane_doc resolver
// when the call is basename-only with scope='global'.
export const GLOBAL_SEARCH_DIRS = [
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
  const result = new Map<string, number>()
  let stdout: string
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

  const primary = extractAstroSidebarViaImport(repoRoot, configPath)
  if (primary.autogenerate_dirs.length > 0) return primary

  const fallback = extractAstroSidebarViaSource(configPath)
  if (fallback.autogenerate_dirs.length > 0) {
    return { ...fallback, fallback: 'source-parse', error: primary.error }
  }

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
    return { autogenerate_dirs: parsed.autogenerate_dirs ?? [], raw: parsed }
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
    if (typeof url === 'string') out.push({ url, line })
  })
  visit(tree, 'definition', (node) => {
    const url = node.url
    const line = node.position?.start?.line ?? 0
    if (typeof url === 'string') out.push({ url, line })
  })
  return out
}

export function isExternalUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
}

export function isMarkdownTarget(url: string): boolean {
  const stripped = url.split('#')[0].split('?')[0]
  return stripped.endsWith('.md') || stripped.endsWith('.mdx')
}

export function resolveLocalUrl(url: string, sourceFile: string, repoRoot: string): string | null {
  let path = url.split('#')[0].split('?')[0]
  if (path === '') return null
  try {
    path = decodeURIComponent(path)
  } catch {
    // leave as-is on bad encoding
  }
  if (path.startsWith('/')) {
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
 */
export function resolveCraneDocCall(
  scope: string,
  docName: string,
  repoRoot: string
): string | null {
  const docsRoot = join(repoRoot, 'docs')
  const candidates: string[] = []

  if (scope === 'global' && docName.startsWith('design-system.') && docName.endsWith('.md')) {
    const base = docName.slice(0, -3)
    const parts = base.split('.')
    candidates.push(join(docsRoot, ...parts) + '.md')
  }

  if (docName.includes('/')) {
    if (scope === 'global') {
      candidates.push(join(docsRoot, docName))
    } else if (VENTURE_CODES.has(scope)) {
      candidates.push(join(docsRoot, 'ventures', scope, docName))
    }
  } else if (VENTURE_CODES.has(scope)) {
    candidates.push(join(docsRoot, 'ventures', scope, docName))
  } else if (scope === 'global') {
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
    sitePublishedSet.add(dir.split('/')[0])
  }
  return {
    site_published: allDirs.filter((d) => sitePublishedSet.has(d)).sort(),
    non_published: allDirs.filter((d) => !sitePublishedSet.has(d)).sort(),
  }
}
