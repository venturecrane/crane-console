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

import { parseFrontmatter } from './skill-review-yaml.js'
import { checkReferenceValidity } from './skill-review-refs.js'

import type { Frontmatter } from './skill-review-yaml.js'
import type { Severity, Violation, ReviewResult } from './skill-review-types.js'

// Re-export types and sub-module functions for consumers and tests
export type { Severity, Violation, ReviewResult }
export { parseFrontmatter, checkReferenceValidity }

// ---------------------------------------------------------------------------
// Repo root resolution (same pattern as launch-lib.ts)
// Compiled path: packages/crane-mcp/dist/cli/skill-review.js -> 4 levels up
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
export const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..')

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
// Individual checks
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['name', 'description', 'version', 'scope', 'owner', 'status'] as const
const VALID_STATUSES = ['draft', 'stable'] as const
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const SCOPE_RE = /^(enterprise|global|venture:[a-z]+)$/

function checkRequiredFields(skillPath: string, fm: Frontmatter): Violation[] {
  const violations: Violation[] = []
  for (const field of REQUIRED_FIELDS) {
    if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
      violations.push({
        rule: 'frontmatter.missing-field',
        severity: 'error',
        path: skillPath,
        message: `Missing required field: ${field}`,
        fix: `Add \`${field}: <value>\` to frontmatter. See docs/skills/governance.md.`,
      })
    }
  }
  return violations
}

function checkNameAndVersion(skillPath: string, fm: Frontmatter, dirName: string): Violation[] {
  const violations: Violation[] = []

  if (fm.name && fm.name !== dirName) {
    violations.push({
      rule: 'frontmatter.name-mismatch',
      severity: 'error',
      path: skillPath,
      message: `name "${String(fm.name)}" does not match directory name "${dirName}"`,
      fix: `Set \`name: ${dirName}\` in frontmatter to match the skill directory.`,
    })
  }

  if (fm.version !== undefined && fm.version !== null) {
    if (!SEMVER_RE.test(String(fm.version))) {
      violations.push({
        rule: 'frontmatter.invalid-semver',
        severity: 'error',
        path: skillPath,
        message: `version "${String(fm.version)}" is not valid semver (expected MAJOR.MINOR.PATCH)`,
        fix: 'Set version to a semver string, e.g. `version: 1.0.0`.',
      })
    }
  }

  return violations
}

function checkScopeStatusOwner(
  skillPath: string,
  fm: Frontmatter,
  knownOwners: string[]
): Violation[] {
  const violations: Violation[] = []

  if (fm.scope !== undefined && fm.scope !== null) {
    if (!SCOPE_RE.test(String(fm.scope))) {
      violations.push({
        rule: 'frontmatter.invalid-scope',
        severity: 'error',
        path: skillPath,
        message: `scope "${String(fm.scope)}" is invalid. Must be enterprise, global, or venture:<code>`,
        fix: 'Set scope to one of: `enterprise`, `global`, or `venture:<lowercase-code>` (e.g. `venture:ss`).',
      })
    }
  }

  if (fm.status !== undefined && fm.status !== null) {
    if (!(VALID_STATUSES as readonly unknown[]).includes(fm.status)) {
      violations.push({
        rule: 'frontmatter.invalid-status',
        severity: 'error',
        path: skillPath,
        message: `status "${String(fm.status)}" is invalid. Must be one of: draft, stable`,
        fix: 'Set status to `draft` or `stable`.',
      })
    }
  }

  if (fm.owner !== undefined && fm.owner !== null && fm.owner !== '') {
    if (knownOwners.length > 0 && !knownOwners.includes(String(fm.owner))) {
      violations.push({
        rule: 'frontmatter.unknown-owner',
        severity: 'error',
        path: skillPath,
        message: `owner "${String(fm.owner)}" is not a known key in config/skill-owners.json`,
        fix: `Add the skill under an existing owner key (${knownOwners.join(', ')}) in config/skill-owners.json, or add a new owner key.`,
      })
    }
  }

  return violations
}

export function checkFrontmatterConformance(
  skillPath: string,
  relPath: string,
  fm: Frontmatter,
  dirName: string,
  knownOwners: string[]
): Violation[] {
  return [
    ...checkRequiredFields(skillPath, fm),
    ...checkNameAndVersion(skillPath, fm, dirName),
    ...checkScopeStatusOwner(skillPath, fm, knownOwners),
  ]
}

export function checkDispatcherParity(
  skillPath: string,
  fm: Frontmatter,
  repoRoot: string
): Violation[] {
  if (fm.backend_only === true) return []

  const name = String(fm.name ?? '')
  if (!name) return []

  const commandFile = join(repoRoot, '.claude', 'commands', `${name}.md`)
  if (!existsSync(commandFile)) {
    return [
      {
        rule: 'dispatcher.missing-command-file',
        severity: 'error',
        path: skillPath,
        message: `No dispatcher found at .claude/commands/${name}.md`,
        fix: `Create .claude/commands/${name}.md, or set \`backend_only: true\` in frontmatter if this skill has no slash command.`,
      },
    ]
  }
  return []
}

export function checkStructuralLint(
  skillPath: string,
  fm: Frontmatter,
  content: string
): Violation[] {
  const violations: Violation[] = []
  const name = String(fm.name ?? '')
  if (!name) return violations

  const lines = content.split('\n')
  const firstH1Idx = lines.findIndex((l) => /^#\s/.test(l))

  if (firstH1Idx === -1) {
    violations.push({
      rule: 'structure.missing-h1-heading',
      severity: 'error',
      path: skillPath,
      message: `Body has no top-level # heading`,
      fix: `Add a \`# /${name}\` heading as the first heading in the SKILL.md body.`,
    })
  } else {
    const h1 = lines[firstH1Idx].replace(/^#\s+/, '').trim()
    if (!h1.startsWith(`/${name}`)) {
      violations.push({
        rule: 'structure.heading-mismatch',
        severity: 'error',
        path: skillPath,
        message: `First # heading "${h1}" does not start with "/${name}"`,
        fix: `Change the first heading to \`# /${name}\` or \`# /${name} - Description\`.`,
      })
    }
  }

  const hasWorkflowSection = lines.some((l) =>
    /^##\s+(Phases|Workflow|Behavior|Steps|Process|Execution|Arguments|Rules)/.test(l)
  )
  if (!hasWorkflowSection) {
    violations.push({
      rule: 'structure.missing-workflow-section',
      severity: 'info',
      path: skillPath,
      message: 'Body has no named workflow section',
      fix: 'Consider adding a `## Phases`, `## Workflow`, `## Behavior`, or `## Steps` section to make the execution shape easier to scan.',
    })
  }

  return violations
}

export function checkInvocationDirective(
  skillPath: string,
  fm: Frontmatter,
  content: string
): Violation[] {
  if (fm.backend_only === true) return []

  const name = String(fm.name ?? '')
  if (!name) return []

  const lines = content.split('\n')
  const nonEmpty = lines.filter((l) => l.trim() !== '').slice(0, 20)
  const pattern = new RegExp(`crane_skill_invoked.*skill_name.*["']${name}["']`)
  const hasDirective = nonEmpty.some((l) => pattern.test(l))

  if (!hasDirective) {
    return [
      {
        rule: 'structure.missing-invocation-directive',
        severity: 'error',
        path: skillPath,
        message: `Body is missing the invocation directive for skill "${name}"`,
        fix: `Add \`> **Invocation:** As your first action, call \\\`crane_skill_invoked(skill_name: "${name}")\\\`.\` as a blockquote immediately after the \`# /${name}\` heading.`,
      },
    ]
  }

  return []
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
// Aggregate results
// ---------------------------------------------------------------------------

export function aggregateResults(allViolations: Violation[], skillCount: number): ReviewResult {
  const by_severity: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const v of allViolations) {
    by_severity[v.severity]++
  }
  return {
    skills_reviewed: skillCount,
    total_violations: allViolations.length,
    by_severity,
    violations: allViolations,
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatHuman(result: ReviewResult): string {
  const lines: string[] = []

  lines.push(
    `Reviewed ${result.skills_reviewed} skill(s) — ` +
      `${result.total_violations} violation(s) ` +
      `(${result.by_severity.error} error, ${result.by_severity.warning} warning, ${result.by_severity.info} info)`
  )

  if (result.violations.length === 0) {
    lines.push('All skills pass.')
    return lines.join('\n')
  }

  lines.push('')
  for (const v of result.violations) {
    lines.push(`${v.severity.toUpperCase()} [${v.rule}] ${v.path}: ${v.message}`)
    lines.push(`  Fix: ${v.fix}`)
  }

  return lines.join('\n')
}

export function formatJson(result: ReviewResult): string {
  return JSON.stringify(result, null, 2)
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
