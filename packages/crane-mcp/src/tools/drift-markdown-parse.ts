/**
 * Docs drift audit — markdown parsing helpers
 *
 * Link/crane_doc extraction, URL classification helpers, and regex constants.
 */

import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
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
