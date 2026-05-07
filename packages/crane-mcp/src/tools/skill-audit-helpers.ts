/**
 * Pure helpers for crane_skill_audit: frontmatter parsing, git staleness,
 * and filesystem skill discovery. No API calls, no side effects.
 */

import matter from 'gray-matter'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export interface Frontmatter {
  name?: string
  description?: string
  version?: string
  scope?: string
  owner?: string
  status?: string
  backend_only?: boolean
  [key: string]: unknown
}

export function parseFrontmatter(content: string): Frontmatter {
  try {
    return matter(content).data as Frontmatter
  } catch {
    return parseSimpleFrontmatter(content)
  }
}

function parseSimpleFrontmatter(content: string): Frontmatter {
  const result: Frontmatter = {}
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return result

  const yaml = match[1]
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const rawVal = line.slice(colonIdx + 1).trim()
    if (!key || rawVal === '') continue

    if (rawVal === 'true') {
      result[key] = true
    } else if (rawVal === 'false') {
      result[key] = false
    } else {
      result[key] = rawVal.replace(/^['"]|['"]$/g, '')
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

export function gitLastTouched(filePath: string): string | null {
  try {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `filePath` comes from readdirSync traversal of .agents/skills/, never HTTP input; double-quoting protects against filenames with spaces
    const iso = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return iso || null
  } catch {
    return null
  }
}

export function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(isoDate)
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Skill discovery
// ---------------------------------------------------------------------------

export interface DiscoveredSkill {
  name: string
  skillPath: string
  resolvedScope: 'enterprise' | 'global'
}

export function discoverSkills(
  scope: 'enterprise' | 'global' | 'all',
  consoleRoot: string
): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = []

  const collect = (baseDir: string, resolvedScope: 'enterprise' | 'global') => {
    if (!existsSync(baseDir)) return
    let entries: string[]
    try {
      entries = readdirSync(baseDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    } catch {
      return
    }
    for (const entry of entries) {
      const skillPath = join(baseDir, entry, 'SKILL.md')
      if (existsSync(skillPath)) {
        skills.push({ name: entry, skillPath, resolvedScope })
      }
    }
  }

  if (scope === 'enterprise' || scope === 'all') {
    collect(join(consoleRoot, '.agents', 'skills'), 'enterprise')
  }
  if (scope === 'global' || scope === 'all') {
    collect(join(homedir(), '.agents', 'skills'), 'global')
  }

  return skills
}

// ---------------------------------------------------------------------------
// Console root resolution
// ---------------------------------------------------------------------------

export function findConsoleRoot(): string {
  const parts = new URL(import.meta.url).pathname.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    const candidate = parts.slice(0, i).join('/')
    if (existsSync(join(candidate, 'CLAUDE.md'))) return candidate
  }
  return process.cwd()
}

// ---------------------------------------------------------------------------
// Skill file content reader (convenience for callers)
// ---------------------------------------------------------------------------

export function readSkillContent(skillPath: string): string {
  try {
    return readFileSync(skillPath, 'utf8')
  } catch {
    return ''
  }
}
