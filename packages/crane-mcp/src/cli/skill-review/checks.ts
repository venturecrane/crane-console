import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { type Frontmatter } from './frontmatter-parser.js'
import { type Violation } from './report.js'

const REQUIRED_FIELDS = ['name', 'description', 'version', 'scope', 'owner', 'status'] as const
const VALID_STATUSES = ['draft', 'stable'] as const
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const SCOPE_RE = /^(enterprise|global|venture:[a-z]+)$/
const FILE_SCOPE_PREFIXES = ['crane-console:', 'venture:', 'global:']

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

/**
 * Normalize a markdown body for parity comparison: drop the telemetry
 * directive line (injected independently on each side), blank lines, and
 * trailing whitespace. The remaining lines must match exactly — the
 * dispatcher is what Claude Code executes, so silent body drift means the
 * SKILL.md and the running skill are different programs.
 */
function normalizeBody(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l !== '' && !l.includes('crane_skill_invoked'))
}

export function checkDispatcherParity(
  skillPath: string,
  fm: Frontmatter,
  repoRoot: string,
  skillBody: string
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

  const violations: Violation[] = []
  const dispatcherRaw = readFileSync(commandFile, 'utf-8')

  const skillLines = normalizeBody(skillBody)
  const dispatcherLines = normalizeBody(dispatcherRaw)

  if (skillLines.join('\n') !== dispatcherLines.join('\n')) {
    let firstDiff = 0
    const max = Math.max(skillLines.length, dispatcherLines.length)
    while (firstDiff < max && skillLines[firstDiff] === dispatcherLines[firstDiff]) firstDiff++
    violations.push({
      rule: 'dispatcher.body-drift',
      severity: 'warning',
      path: skillPath,
      message:
        `Dispatcher body differs from SKILL.md body ` +
        `(${skillLines.length} vs ${dispatcherLines.length} normalized lines; ` +
        `first divergence at normalized line ${firstDiff + 1})`,
      fix: `Sync the bodies: the dispatcher at .claude/commands/${name}.md is what Claude Code executes. Regenerate it from the SKILL.md body (strip frontmatter), or port dispatcher-only edits back into SKILL.md.`,
    })
  }

  const dispatcherHead = dispatcherRaw
    .split('\n')
    .filter((l) => l.trim() !== '')
    .slice(0, 20)
  const hasDirective = dispatcherHead.some((l) => {
    const invokedIdx = l.indexOf('crane_skill_invoked')
    if (invokedIdx === -1) return false
    const rest = l.slice(invokedIdx)
    return rest.includes('skill_name') && (rest.includes(`"${name}"`) || rest.includes(`'${name}'`))
  })
  if (!hasDirective) {
    violations.push({
      rule: 'dispatcher.missing-invocation-directive',
      severity: 'warning',
      path: skillPath,
      message: `Dispatcher .claude/commands/${name}.md is missing the invocation directive — Claude Code invocations of /${name} will not be recorded in skill telemetry`,
      fix: `Add \`> **Invocation:** As your first action, call \\\`crane_skill_invoked(skill_name: "${name}")\\\`.\` as a blockquote immediately after the \`# /${name}\` heading in the dispatcher.`,
    })
  }

  return violations
}

function checkFileRef(skillPath: string, fileRef: string, repoRoot: string): Violation | null {
  if (fileRef.startsWith('crane-console:')) {
    const relFile = fileRef.slice('crane-console:'.length)
    if (!existsSync(join(repoRoot, relFile))) {
      return {
        rule: 'references.broken-crane-console-file',
        severity: 'error',
        path: skillPath,
        message: `crane-console file not found: "${relFile}"`,
        fix: `Create the file at ${relFile} relative to the repo root, or remove the reference.`,
      }
    }
    return null
  }

  if (fileRef.startsWith('venture:')) {
    const relFile = fileRef.slice('venture:'.length)
    const sampleRepo = process.env.CRANE_VENTURE_SAMPLE_REPO
    if (!sampleRepo) {
      return {
        rule: 'references.venture-file-unverified',
        severity: 'warning',
        path: skillPath,
        message: `venture file reference "${relFile}" not verified — CRANE_VENTURE_SAMPLE_REPO is not set`,
        fix: 'Set CRANE_VENTURE_SAMPLE_REPO to a local venture repo path to enable validation, or verify the path manually.',
      }
    }
    if (!existsSync(join(sampleRepo, relFile))) {
      return {
        rule: 'references.broken-venture-file',
        severity: 'warning',
        path: skillPath,
        message: `venture file not found in CRANE_VENTURE_SAMPLE_REPO: "${relFile}"`,
        fix: `Create the file at ${relFile} inside the venture repo, or remove the reference.`,
      }
    }
    return null
  }

  if (fileRef.startsWith('global:')) {
    const relFile = fileRef.slice('global:'.length)
    const expandedPath = relFile.startsWith('~/')
      ? join(homedir(), relFile.slice(2))
      : join(homedir(), relFile)
    if (process.env.CI) {
      return {
        rule: 'references.global-file-unverified',
        severity: 'warning',
        path: skillPath,
        message: `global file reference "${relFile}" not verified in CI environment`,
        fix: 'Verify the file exists locally at the expanded path. CI skips global file checks.',
      }
    }
    if (!existsSync(expandedPath)) {
      return {
        rule: 'references.broken-global-file',
        severity: 'error',
        path: skillPath,
        message: `global file not found at: "${expandedPath}"`,
        fix: `Create the file at the expanded path, or remove the reference from depends_on.files.`,
      }
    }
  }

  return null
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
      const v = checkFileRef(skillPath, fileRef, repoRoot)
      if (v) violations.push(v)
    }
  }

  const commands = (dependsOn as Frontmatter).commands
  if (Array.isArray(commands)) {
    for (const cmd of commands as string[]) {
      if (spawnSync('which', [cmd], { encoding: 'utf-8' }).status !== 0) {
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
  if (nonEmpty.some((l) => pattern.test(l))) return []

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
