/**
 * Docs drift audit — Astro sidebar extraction
 *
 * Extracts autogenerate directory list from site/astro.config.mjs
 * via subprocess import(), with regex source-parse fallback.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidebarExtraction {
  autogenerate_dirs: string[]
  raw: unknown
  error?: string
  /** Set when the primary `import()` failed and we fell back to source parsing. */
  fallback?: 'source-parse'
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Extraction strategies
// ---------------------------------------------------------------------------

export function extractAstroSidebarViaImport(
  repoRoot: string,
  configPath: string
): SidebarExtraction {
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

export function extractAstroSidebarViaSource(configPath: string): SidebarExtraction {
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
