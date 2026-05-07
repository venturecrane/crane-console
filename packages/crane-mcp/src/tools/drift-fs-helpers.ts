/**
 * Docs drift audit — filesystem and git helpers
 *
 * Console-root discovery, markdown file walking, git mtime map,
 * deprecated-skill registry, and docs-dir classification.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'

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
