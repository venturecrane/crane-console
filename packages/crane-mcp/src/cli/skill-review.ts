/**
 * skill-review - lint SKILL.md files against the governance schema
 *
 * Usage:
 *   npm run skill-review -- --path .agents/skills/sos
 *   npm run skill-review -- --all --strict
 *   npm run skill-review -- --all --json
 *
 * All logic is in the exported functions so the test suite can import
 * and exercise them without touching the filesystem.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Repo root resolution (same pattern as launch-lib.ts)
// Compiled path: packages/crane-mcp/dist/cli/skill-review.js -> 4 levels up
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
export const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..')

// ---------------------------------------------------------------------------
// Re-exports for test compatibility (skill-review.test.ts imports from here)
// ---------------------------------------------------------------------------
export { parseFrontmatter } from './skill-review/frontmatter-parser.js'
export type { Frontmatter } from './skill-review/frontmatter-parser.js'
export {
  checkFrontmatterConformance,
  checkDispatcherParity,
  checkReferenceValidity,
  checkStructuralLint,
  checkInvocationDirective,
} from './skill-review/checks.js'
export { aggregateResults, formatHuman, formatJson } from './skill-review/report.js'
export type { Severity, Violation, ReviewResult } from './skill-review/report.js'

import { parseFrontmatter } from './skill-review/frontmatter-parser.js'
import {
  checkFrontmatterConformance,
  checkDispatcherParity,
  checkReferenceValidity,
  checkStructuralLint,
  checkInvocationDirective,
} from './skill-review/checks.js'
import { aggregateResults, formatHuman, formatJson } from './skill-review/report.js'
import type { Violation } from './skill-review/report.js'

// ---------------------------------------------------------------------------
// Config loaders
// ---------------------------------------------------------------------------

export function loadSkillOwners(repoRoot: string): string[] {
  const p = join(repoRoot, 'config', 'skill-owners.json')
  if (!existsSync(p)) return []
  try {
    const raw = readFileSync(p, 'utf-8')
    const obj = JSON.parse(raw) as Record<string, string[]>
    return Object.keys(obj)
  } catch {
    return []
  }
}

export function loadMcpToolManifest(manifestPath: string): string[] {
  if (!existsSync(manifestPath)) return []
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed as string[]
    return []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Review a single skill directory
// ---------------------------------------------------------------------------

export function reviewSkill(
  skillDir: string,
  repoRoot: string,
  manifestTools: string[],
  knownOwners: string[]
): Violation[] {
  const skillMdPath = join(skillDir, 'SKILL.md')
  const dirName = skillDir.split('/').filter(Boolean).pop() ?? ''

  const relPath = skillMdPath.startsWith(repoRoot)
    ? skillMdPath.slice(repoRoot.length).replace(/^\//, '')
    : skillMdPath

  if (!existsSync(skillMdPath)) {
    return [
      {
        rule: 'frontmatter.missing-skill-md',
        severity: 'error',
        path: relPath,
        message: `SKILL.md not found in ${skillDir}`,
        fix: 'Create a SKILL.md file with required frontmatter. See docs/skills/governance.md.',
      },
    ]
  }

  const raw = readFileSync(skillMdPath, 'utf-8')
  const { data: fm, content } = parseFrontmatter(raw)

  return [
    ...checkFrontmatterConformance(relPath, relPath, fm, dirName, knownOwners),
    ...checkDispatcherParity(relPath, fm, repoRoot),
    ...checkReferenceValidity(relPath, fm, repoRoot, manifestTools),
    ...checkStructuralLint(relPath, fm, content),
    ...checkInvocationDirective(relPath, fm, content),
  ]
}

// ---------------------------------------------------------------------------
// Discover all skill directories
// ---------------------------------------------------------------------------

export function discoverSkillDirs(repoRoot: string): string[] {
  const skillsBase = join(repoRoot, '.agents', 'skills')
  if (!existsSync(skillsBase)) return []

  return readdirSync(skillsBase)
    .filter((entry) => {
      try {
        return statSync(join(skillsBase, entry)).isDirectory()
      } catch {
        return false
      }
    })
    .map((entry) => join(skillsBase, entry))
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  path?: string
  all: boolean
  strict: boolean
  json: boolean
  manifest: string
  help: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    all: false,
    strict: false,
    json: false,
    manifest: join(CRANE_CONSOLE_ROOT, 'config', 'mcp-tool-manifest.json'),
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--path':
        args.path = argv[++i]
        break
      case '--all':
        args.all = true
        break
      case '--strict':
        args.strict = true
        break
      case '--json':
        args.json = true
        break
      case '--manifest':
        args.manifest = argv[++i]
        break
      case '--help':
      case '-h':
        args.help = true
        break
    }
  }

  return args
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)

  if (args.help) {
    console.log(`skill-review — lint SKILL.md files against the governance schema

Usage:
  npm run skill-review -- --path .agents/skills/<name>
  npm run skill-review -- --all [--strict] [--json] [--manifest <path>]

Options:
  --path <dir>       Review a single skill directory
  --all              Review every skill in .agents/skills/
  --strict           Exit 1 if any error violations found (default: advisory, exit 0)
  --json             Emit machine-readable JSON instead of human-readable report
  --manifest <path>  Path to MCP tool manifest (default: config/mcp-tool-manifest.json)

See docs/skills/governance.md for the full schema reference.`)
    return
  }

  if (!args.path && !args.all) {
    console.error('Error: specify --path <dir> or --all')
    process.exit(1)
  }

  if (args.path && args.all) {
    console.error('Error: --path and --all are mutually exclusive')
    process.exit(1)
  }

  const repoRoot = CRANE_CONSOLE_ROOT
  const manifestTools = loadMcpToolManifest(args.manifest)
  const knownOwners = loadSkillOwners(repoRoot)

  let skillDirs: string[]
  if (args.all) {
    skillDirs = discoverSkillDirs(repoRoot)
  } else {
    const rawPath = args.path!
    skillDirs = [rawPath.startsWith('/') ? rawPath : join(process.cwd(), rawPath)]
  }

  const allViolations: Violation[] = []
  for (const dir of skillDirs) {
    allViolations.push(...reviewSkill(dir, repoRoot, manifestTools, knownOwners))
  }

  const result = aggregateResults(allViolations, skillDirs.length)

  if (args.json) {
    console.log(formatJson(result))
  } else {
    console.log(formatHuman(result))
  }

  if (args.strict && result.by_severity.error > 0) {
    process.exit(1)
  }
}

// Run when executed directly (not when imported by tests)
const isDirectInvocation = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectInvocation) {
  main().catch((err: Error) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
