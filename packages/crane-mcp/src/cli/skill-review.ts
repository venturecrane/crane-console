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

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Repo root resolution (same pattern as launch-lib.ts)
// Compiled path: packages/crane-mcp/dist/cli/skill-review.js -> 4 levels up
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
export const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info'

export interface Violation {
  rule: string
  severity: Severity
  path: string
  line?: number
  message: string
  fix: string
}

export interface ReviewResult {
  skills_reviewed: number
  total_violations: number
  by_severity: Record<Severity, number>
  violations: Violation[]
}

interface Frontmatter {
  name?: unknown
  description?: unknown
  version?: unknown
  scope?: unknown
  owner?: unknown
  status?: unknown
  backend_only?: unknown
  depends_on?: {
    mcp_tools?: unknown
    files?: unknown
    commands?: unknown
  }
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Frontmatter parser (hand-rolled to avoid gray-matter until npm install)
// Actually: we're adding gray-matter to package.json. But the typecheck step
// runs before npm install in the task instructions, so we implement a minimal
// YAML frontmatter parser here to keep things self-contained and avoid the
// import-before-install problem at typecheck time.
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { data, content } where data is the parsed frontmatter object and
 * content is the body after the closing `---`.
 *
 * Supports: strings, booleans, null, simple lists (- item), and nested maps
 * (key:\n  subkey: val). This is sufficient for the SKILL.md schema.
 */
export function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  const lines = raw.split('\n')

  // Must start with ---
  if (lines[0]?.trim() !== '---') {
    return { data: {}, content: raw }
  }

  // Find closing ---
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      closeIdx = i
      break
    }
  }

  if (closeIdx === -1) {
    return { data: {}, content: raw }
  }

  const yamlLines = lines.slice(1, closeIdx)
  const content = lines.slice(closeIdx + 1).join('\n')
  const data = parseYamlBlock(yamlLines)
  return { data, content }
}

function parseYamlBlock(lines: string[]): Frontmatter {
  const result: Frontmatter = {}
  if (lines.length === 0) return result

  // Detect the indent depth of the first non-blank, non-comment line. All
  // siblings at this block share this depth. Child lines have strictly greater
  // indent and are collected, then recursed with their common indent stripped.
  let baseIndent = -1
  for (const line of lines) {
    if (!line || line.trim() === '' || line.trim().startsWith('#')) continue
    baseIndent = line.length - line.trimStart().length
    break
  }
  if (baseIndent === -1) return result

  const siblingRe = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line || line.trim() === '' || line.trim().startsWith('#')) {
      i++
      continue
    }

    const indent = line.length - line.trimStart().length
    if (indent < baseIndent) break // dedent — done with this block
    if (indent > baseIndent) {
      // stray child line without a parent sibling; skip
      i++
      continue
    }

    const trimmed = line.trimStart()
    const keyMatch = siblingRe.exec(trimmed)
    if (!keyMatch) {
      i++
      continue
    }

    const key = keyMatch[1]
    const rest = keyMatch[2].trim()

    if (rest === '' || rest === null) {
      // Collect children — lines with strictly greater indent than our siblings
      const children: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const childLine = lines[j]
        if (!childLine) {
          children.push(childLine)
          j++
          continue
        }
        if (childLine.trim() === '') {
          children.push(childLine)
          j++
          continue
        }
        const childIndent = childLine.length - childLine.trimStart().length
        if (childIndent <= baseIndent) break
        children.push(childLine)
        j++
      }

      // Trim trailing blanks in children
      while (
        children.length > 0 &&
        (!children[children.length - 1] || children[children.length - 1].trim() === '')
      ) {
        children.pop()
      }

      const firstNonBlank = children.find((c) => c && c.trim() !== '')
      if (firstNonBlank && firstNonBlank.trimStart().startsWith('- ')) {
        // Simple string list
        result[key] = children
          .filter((c) => c && c.trim().startsWith('-'))
          .map((c) => c.replace(/^\s*-\s*/, '').trim())
          .filter((c) => c.length > 0)
        i = j
      } else if (children.length > 0) {
        // Nested map (e.g. depends_on)
        const nested = parseYamlBlock(children)
        result[key] = nested
        i = j
      } else {
        result[key] = null
        i++
      }
    } else {
      result[key] = coerceScalar(rest)
      i++
    }
  }

  return result
}

function coerceScalar(val: string): unknown {
  if (val === 'true') return true
  if (val === 'false') return false
  if (val === 'null' || val === '~') return null
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1)
  }
  return val
}

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
const FILE_SCOPE_PREFIXES = ['crane-console:', 'venture:', 'global:']

export function checkFrontmatterConformance(
  skillPath: string,
  relPath: string,
  fm: Frontmatter,
  dirName: string,
  knownOwners: string[]
): Violation[] {
  const violations: Violation[] = []

  // Required fields present
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

  // name matches directory name
  if (fm.name && fm.name !== dirName) {
    violations.push({
      rule: 'frontmatter.name-mismatch',
      severity: 'error',
      path: skillPath,
      message: `name "${String(fm.name)}" does not match directory name "${dirName}"`,
      fix: `Set \`name: ${dirName}\` in frontmatter to match the skill directory.`,
    })
  }

  // version is semver
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

  // scope enum
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

  // status enum
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

  // owner is a known key
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

export function checkReferenceValidity(
  skillPath: string,
  fm: Frontmatter,
  repoRoot: string,
  manifestTools: string[]
): Violation[] {
  const violations: Violation[] = []
  const dependsOn = fm.depends_on

  if (!dependsOn || typeof dependsOn !== 'object') return []

  // mcp_tools
  const mcpTools = (dependsOn as Frontmatter).mcp_tools
  if (Array.isArray(mcpTools) && manifestTools.length > 0) {
    for (const tool of mcpTools as string[]) {
      if (!manifestTools.includes(tool)) {
        violations.push({
          rule: 'references.unknown-mcp-tool',
          severity: 'error',
          path: skillPath,
          message: `MCP tool "${tool}" not found in config/mcp-tool-manifest.json`,
          fix: `Remove the tool reference, add it to the manifest, or check for a typo in the tool name.`,
        })
      }
    }
  }

  // files
  const files = (dependsOn as Frontmatter).files
  if (Array.isArray(files)) {
    for (const fileRef of files as string[]) {
      if (!FILE_SCOPE_PREFIXES.some((prefix) => fileRef.startsWith(prefix))) {
        violations.push({
          rule: 'references.file-missing-scope-prefix',
          severity: 'error',
          path: skillPath,
          message: `File path missing scope prefix (expected \`crane-console:\`, \`venture:\`, or \`global:\`): "${fileRef}"`,
          fix: 'Prefix the file path with `crane-console:`, `venture:`, or `global:` to indicate where the file lives.',
        })
        continue
      }

      if (fileRef.startsWith('crane-console:')) {
        const relFile = fileRef.slice('crane-console:'.length)
        const absFile = join(repoRoot, relFile)
        if (!existsSync(absFile)) {
          violations.push({
            rule: 'references.broken-crane-console-file',
            severity: 'error',
            path: skillPath,
            message: `crane-console file not found: "${relFile}"`,
            fix: `Create the file at ${relFile} relative to the repo root, or remove the reference.`,
          })
        }
      } else if (fileRef.startsWith('venture:')) {
        const relFile = fileRef.slice('venture:'.length)
        const sampleRepo = process.env.CRANE_VENTURE_SAMPLE_REPO
        if (sampleRepo) {
          const absFile = join(sampleRepo, relFile)
          if (!existsSync(absFile)) {
            violations.push({
              rule: 'references.broken-venture-file',
              severity: 'warning',
              path: skillPath,
              message: `venture file not found in CRANE_VENTURE_SAMPLE_REPO: "${relFile}"`,
              fix: `Create the file at ${relFile} inside the venture repo, or remove the reference.`,
            })
          }
        } else {
          violations.push({
            rule: 'references.venture-file-unverified',
            severity: 'warning',
            path: skillPath,
            message: `venture file reference "${relFile}" not verified — CRANE_VENTURE_SAMPLE_REPO is not set`,
            fix: 'Set CRANE_VENTURE_SAMPLE_REPO to a local venture repo path to enable validation, or verify the path manually.',
          })
        }
      } else if (fileRef.startsWith('global:')) {
        const relFile = fileRef.slice('global:'.length)
        const expandedPath = relFile.startsWith('~/')
          ? join(homedir(), relFile.slice(2))
          : join(homedir(), relFile)

        if (process.env.CI) {
          violations.push({
            rule: 'references.global-file-unverified',
            severity: 'warning',
            path: skillPath,
            message: `global file reference "${relFile}" not verified in CI environment`,
            fix: 'Verify the file exists locally at the expanded path. CI skips global file checks.',
          })
        } else if (!existsSync(expandedPath)) {
          violations.push({
            rule: 'references.broken-global-file',
            severity: 'error',
            path: skillPath,
            message: `global file not found at: "${expandedPath}"`,
            fix: `Create the file at the expanded path, or remove the reference from depends_on.files.`,
          })
        }
      }
    }
  }

  // commands
  const commands = (dependsOn as Frontmatter).commands
  if (Array.isArray(commands)) {
    for (const cmd of commands as string[]) {
      const result = spawnSync('which', [cmd], { encoding: 'utf-8' })
      if (result.status !== 0) {
        violations.push({
          rule: 'references.missing-command',
          severity: 'warning',
          path: skillPath,
          message: `Command "${cmd}" not found on PATH`,
          fix: `Install "${cmd}" or remove it from depends_on.commands if it is optional.`,
        })
      }
    }
  }

  return violations
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

  // Find first top-level # heading
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
    // Accept "/<name>" anywhere at the start of the heading or "/<name> - ..."
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

  // Soft convention: skills benefit from a clearly-named workflow section.
  // Accept the common variants seen across the repo; surface as INFO rather
  // than ERROR because many legitimate skills use numbered steps directly
  // under the heading without a separate section header.
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
  // backend_only skills are called programmatically — no directive needed
  if (fm.backend_only === true) return []

  const name = String(fm.name ?? '')
  if (!name) return []

  const lines = content.split('\n')

  // Scan first 20 non-empty lines of the body for the directive pattern
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

  // Relative path for display
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

  const violations: Violation[] = [
    ...checkFrontmatterConformance(relPath, relPath, fm, dirName, knownOwners),
    ...checkDispatcherParity(relPath, fm, repoRoot),
    ...checkReferenceValidity(relPath, fm, repoRoot, manifestTools),
    ...checkStructuralLint(relPath, fm, content),
    ...checkInvocationDirective(relPath, fm, content),
  ]

  return violations
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
    // Resolve --path relative to cwd if not absolute
    const rawPath = args.path!
    skillDirs = [rawPath.startsWith('/') ? rawPath : join(process.cwd(), rawPath)]
  }

  const allViolations: Violation[] = []
  for (const dir of skillDirs) {
    const violations = reviewSkill(dir, repoRoot, manifestTools, knownOwners)
    allViolations.push(...violations)
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
