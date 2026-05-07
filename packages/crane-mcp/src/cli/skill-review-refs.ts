/**
 * skill-review-refs - reference validity checks for SKILL.md depends_on entries.
 *
 * Extracted from skill-review.ts to keep individual modules under the
 * max-lines and complexity ceilings.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

import type { Frontmatter } from './skill-review-yaml.js'
import type { Violation } from './skill-review-types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILE_SCOPE_PREFIXES = ['crane-console:', 'venture:', 'global:']

// ---------------------------------------------------------------------------
// Per-prefix file checkers
// ---------------------------------------------------------------------------

function checkCraneConsoleFile(skillPath: string, fileRef: string, repoRoot: string): Violation[] {
  const relFile = fileRef.slice('crane-console:'.length)
  const absFile = join(repoRoot, relFile)
  if (existsSync(absFile)) return []
  return [
    {
      rule: 'references.broken-crane-console-file',
      severity: 'error',
      path: skillPath,
      message: `crane-console file not found: "${relFile}"`,
      fix: `Create the file at ${relFile} relative to the repo root, or remove the reference.`,
    },
  ]
}

function checkVentureFile(skillPath: string, fileRef: string): Violation[] {
  const relFile = fileRef.slice('venture:'.length)
  const sampleRepo = process.env.CRANE_VENTURE_SAMPLE_REPO
  if (!sampleRepo) {
    return [
      {
        rule: 'references.venture-file-unverified',
        severity: 'warning',
        path: skillPath,
        message: `venture file reference "${relFile}" not verified — CRANE_VENTURE_SAMPLE_REPO is not set`,
        fix: 'Set CRANE_VENTURE_SAMPLE_REPO to a local venture repo path to enable validation, or verify the path manually.',
      },
    ]
  }
  const absFile = join(sampleRepo, relFile)
  if (existsSync(absFile)) return []
  return [
    {
      rule: 'references.broken-venture-file',
      severity: 'warning',
      path: skillPath,
      message: `venture file not found in CRANE_VENTURE_SAMPLE_REPO: "${relFile}"`,
      fix: `Create the file at ${relFile} inside the venture repo, or remove the reference.`,
    },
  ]
}

function checkGlobalFile(skillPath: string, fileRef: string): Violation[] {
  const relFile = fileRef.slice('global:'.length)
  const expandedPath = relFile.startsWith('~/')
    ? join(homedir(), relFile.slice(2))
    : join(homedir(), relFile)

  if (process.env.CI) {
    return [
      {
        rule: 'references.global-file-unverified',
        severity: 'warning',
        path: skillPath,
        message: `global file reference "${relFile}" not verified in CI environment`,
        fix: 'Verify the file exists locally at the expanded path. CI skips global file checks.',
      },
    ]
  }
  if (existsSync(expandedPath)) return []
  return [
    {
      rule: 'references.broken-global-file',
      severity: 'error',
      path: skillPath,
      message: `global file not found at: "${expandedPath}"`,
      fix: `Create the file at the expanded path, or remove the reference from depends_on.files.`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Aggregated file reference checker
// ---------------------------------------------------------------------------

function checkFileRef(skillPath: string, fileRef: string, repoRoot: string): Violation[] {
  if (!FILE_SCOPE_PREFIXES.some((prefix) => fileRef.startsWith(prefix))) {
    return [
      {
        rule: 'references.file-missing-scope-prefix',
        severity: 'error',
        path: skillPath,
        message: `File path missing scope prefix (expected \`crane-console:\`, \`venture:\`, or \`global:\`): "${fileRef}"`,
        fix: 'Prefix the file path with `crane-console:`, `venture:`, or `global:` to indicate where the file lives.',
      },
    ]
  }

  if (fileRef.startsWith('crane-console:'))
    return checkCraneConsoleFile(skillPath, fileRef, repoRoot)
  if (fileRef.startsWith('venture:')) return checkVentureFile(skillPath, fileRef)
  return checkGlobalFile(skillPath, fileRef)
}

// ---------------------------------------------------------------------------
// MCP tools and commands checkers
// ---------------------------------------------------------------------------

function checkMcpTools(skillPath: string, mcpTools: unknown, manifestTools: string[]): Violation[] {
  if (!Array.isArray(mcpTools) || manifestTools.length === 0) return []
  const violations: Violation[] = []
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
  return violations
}

function checkCommands(skillPath: string, commands: unknown): Violation[] {
  if (!Array.isArray(commands)) return []
  const violations: Violation[] = []
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
  return violations
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function checkReferenceValidity(
  skillPath: string,
  fm: Frontmatter,
  repoRoot: string,
  manifestTools: string[]
): Violation[] {
  const dependsOn = fm.depends_on
  if (!dependsOn || typeof dependsOn !== 'object') return []

  const dep = dependsOn as Frontmatter
  const violations: Violation[] = []

  violations.push(...checkMcpTools(skillPath, dep.mcp_tools, manifestTools))

  if (Array.isArray(dep.files)) {
    for (const fileRef of dep.files as string[]) {
      violations.push(...checkFileRef(skillPath, fileRef, repoRoot))
    }
  }

  violations.push(...checkCommands(skillPath, dep.commands))

  return violations
}
