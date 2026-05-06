/**
 * Docs drift audit — six drift check functions
 *
 * Each function receives the pre-built data (file list, mtime map,
 * deprecated-skill list, sidebar extraction) and returns Finding[].
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import matter from 'gray-matter'
import type { Finding, Severity } from './docs-drift-audit.js'
import {
  extractMarkdownLinks,
  isExternalUrl,
  isMarkdownTarget,
  resolveLocalUrl,
  extractCraneDocCalls,
  resolveCraneDocCall,
  VENTURE_CODES,
} from './docs-drift-utils.js'
import type { SidebarExtraction, DeprecatedSkill } from './docs-drift-utils.js'

export type { Finding, Severity }

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
      if (link.url.startsWith('#')) continue
      if (!isMarkdownTarget(link.url)) continue
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
      if (/[{<]/.test(call.scope) || /[{<]/.test(call.doc_name)) continue
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
    if (!ts) continue
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
  findings.sort((a, b) => {
    const ad = parseInt(a.detail.match(/(\d+)d/)?.[1] ?? '0', 10)
    const bd = parseInt(b.detail.match(/(\d+)d/)?.[1] ?? '0', 10)
    return bd - ad
  })
  return findings
}

export function checkSidebarDrift(repoRoot: string, sidebar: SidebarExtraction): Finding[] {
  const findings: Finding[] = []

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
