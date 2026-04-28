#!/usr/bin/env node
// Generate .agents/skills/<name>/SKILL.md from .claude/commands/<name>.md.
//
// The Claude Code dispatcher is the canonical body source. Governance
// frontmatter (version, scope, owner, status, depends_on) lives in the
// existing SKILL.md or — for new skills — defaults from config/skill-owners.json.
//
// This replaces the bash convert_to_skill in sync-commands.sh, which stripped
// every governance field and broke the `review` CI gate.
//
// Behavior:
//   - If the dispatcher has its own frontmatter, that wins for name/description
//     and (if present) for version/scope/owner/status/depends_on too.
//   - Otherwise, name + description come from the dispatcher's `# /<name> - desc`
//     heading, and governance fields are preserved from the existing SKILL.md.
//   - For brand-new skills (no existing SKILL.md and no dispatcher frontmatter):
//     version 0.1.0, scope enterprise, status draft, owner from skill-owners.json
//     (or the literal string "unowned" with a warning).
//   - The body always carries the `> **Invocation:** ...` directive immediately
//     after the `# /<name>` heading; injected if the dispatcher omits it.
//
// Usage: node scripts/sync-skill-md.mjs <dispatcher.md> <out-dir>

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// Split a markdown file into its YAML frontmatter (between the first two `---`
// fences) and the rest of the body. No regex — frontmatter shape is fixed.
function splitFrontmatter(text) {
  const lines = text.split('\n')
  if (lines[0] !== '---') return { frontmatter: '', body: text }
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i
      break
    }
  }
  if (end === -1) return { frontmatter: '', body: text }
  const fm = lines.slice(1, end).join('\n')
  // Body starts after the closing fence; preserve a single leading newline.
  let bodyStart = end + 1
  if (lines[bodyStart] === '') bodyStart++
  return { frontmatter: fm, body: lines.slice(bodyStart).join('\n') }
}

// Read a top-level scalar (`key: value`) from the YAML block. Returns undefined
// if absent. Multi-line scalars are not supported — none of our governance
// fields use them.
function readScalar(yaml, key) {
  if (!yaml) return undefined
  const prefix = `${key}:`
  for (const raw of yaml.split('\n')) {
    if (raw.startsWith(prefix)) {
      return raw.slice(prefix.length).trim() || undefined
    }
  }
  return undefined
}

// Set a top-level scalar in a YAML block. If absent, append. Preserves order
// for existing keys.
function setScalar(yaml, key, value) {
  const prefix = `${key}:`
  const newLine = `${key}: ${value}`
  if (!yaml) return newLine
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(prefix)) {
      lines[i] = newLine
      return lines.join('\n')
    }
  }
  return `${yaml}\n${newLine}`
}

// Extract a multi-line block starting with `<key>:` and continuing through
// indented or blank lines (covers nested mappings like `depends_on:`).
function extractBlock(yaml, key) {
  if (!yaml) return ''
  const lines = yaml.split('\n')
  const startLine = `${key}:`
  let i = 0
  while (i < lines.length && lines[i] !== startLine) i++
  if (i === lines.length) return ''
  const out = [lines[i]]
  i++
  while (
    i < lines.length &&
    (lines[i].startsWith(' ') || lines[i].startsWith('\t') || lines[i] === '')
  ) {
    out.push(lines[i])
    i++
  }
  while (out.length > 1 && out[out.length - 1].trim() === '') out.pop()
  return out.join('\n')
}

// Filter out the placeholder owner so the catalog can fill in.
function pickOwner(value) {
  if (!value) return undefined
  if (value === 'unowned') return undefined
  return value
}

function loadOwnerCatalog() {
  const path = resolve(REPO_ROOT, 'config/skill-owners.json')
  if (!existsSync(path)) return {}
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const map = {}
  for (const [team, skills] of Object.entries(data)) {
    if (team.startsWith('_')) continue
    if (!Array.isArray(skills)) continue
    for (const s of skills) map[s] = team
  }
  return map
}

function deriveDescriptionFromBody(body, skillName) {
  // First non-blank line that isn't the heading, blockquote, or code fence.
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) continue
    if (line.startsWith('>')) continue
    if (line.startsWith('```')) continue
    return line.replace(/[*_`]+/g, '').trim()
  }
  return `Skill ${skillName}`
}

function buildInvocationDirective(skillName) {
  return `> **Invocation:** As your first action, call \`crane_skill_invoked(skill_name: "${skillName}")\`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives \`/skill-audit\`.`
}

// Inject the invocation directive immediately after the `# /<name>` heading.
// Locates the heading by line-prefix match (no regex on user input).
function injectInvocationDirective(body, skillName) {
  const headingPrefix = `# /${skillName}`
  if (body.includes(`crane_skill_invoked(skill_name: "${skillName}")`)) return body

  const directive = buildInvocationDirective(skillName)
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === headingPrefix || line.startsWith(`${headingPrefix} `)) {
      lines.splice(i + 1, 0, '', directive)
      return lines.join('\n')
    }
  }
  // No matching heading — synthesize one and prepend.
  return `# /${skillName}\n\n${directive}\n\n${body.replace(/^\n+/, '')}`
}

function generate(dispatcherPath, outDir) {
  const skillName = basename(dispatcherPath, '.md')
  const dispatcherText = readFileSync(dispatcherPath, 'utf8')
  const { frontmatter: dispatcherFm, body: dispatcherBody } = splitFrontmatter(dispatcherText)

  const skillPath = resolve(outDir, 'SKILL.md')
  const skillExists = existsSync(skillPath)
  const ownerCatalog = loadOwnerCatalog()

  if (skillExists) {
    // Patch the existing SKILL.md in place: preserve body and unknown
    // frontmatter fields (allowed-tools, depends_on shape variants), update
    // only the governance fields whose source of truth has changed.
    const { frontmatter: existingFm, body: existingBody } = splitFrontmatter(
      readFileSync(skillPath, 'utf8')
    )

    let fm = existingFm
    fm = setScalar(fm, 'name', skillName)

    // Description: dispatcher wins if it explicitly carries one. Otherwise
    // keep what's there; if blank, fall back to a body-derived line.
    const dispatcherDescription = readScalar(dispatcherFm, 'description')
    if (dispatcherDescription) {
      fm = setScalar(fm, 'description', dispatcherDescription)
    } else if (!readScalar(fm, 'description')) {
      fm = setScalar(fm, 'description', deriveDescriptionFromBody(existingBody, skillName))
    }

    // Owner: if existing is missing or "unowned", consult the catalog.
    const currentOwner = pickOwner(readScalar(fm, 'owner'))
    if (!currentOwner) {
      const owner = ownerCatalog[skillName] || 'unowned'
      fm = setScalar(fm, 'owner', owner)
      if (owner === 'unowned') {
        process.stderr.write(
          `[sync-skill-md] WARNING: ${skillName} has no owner in config/skill-owners.json — emitting "unowned"\n`
        )
      }
    }

    // Inject the invocation directive into the body if it's missing.
    const newBody = injectInvocationDirective(existingBody.replace(/^\n+/, ''), skillName)

    let output = `---\n${fm}\n---\n\n${newBody}`
    if (!output.endsWith('\n')) output += '\n'
    writeFileSync(skillPath, output)
    return
  }

  // New skill — synthesize a fresh SKILL.md with full default frontmatter.
  const fields = {
    name: skillName,
    description:
      readScalar(dispatcherFm, 'description') ||
      deriveDescriptionFromBody(dispatcherBody, skillName),
    version: readScalar(dispatcherFm, 'version') || '0.1.0',
    scope: readScalar(dispatcherFm, 'scope') || 'enterprise',
    owner: pickOwner(readScalar(dispatcherFm, 'owner')) || ownerCatalog[skillName] || 'unowned',
    status: readScalar(dispatcherFm, 'status') || 'draft',
  }

  if (fields.owner === 'unowned') {
    process.stderr.write(
      `[sync-skill-md] WARNING: ${skillName} has no owner in config/skill-owners.json — emitting "unowned"\n`
    )
  }

  const dependsOn = extractBlock(dispatcherFm, 'depends_on')

  let fm = ''
  for (const key of ['name', 'description', 'version', 'scope', 'owner', 'status']) {
    fm = setScalar(fm, key, fields[key])
  }
  if (dependsOn) fm = `${fm}\n${dependsOn}`

  const body = injectInvocationDirective(dispatcherBody.replace(/^\n+/, ''), skillName)

  let output = `---\n${fm}\n---\n\n${body}`
  if (!output.endsWith('\n')) output += '\n'

  mkdirSync(outDir, { recursive: true })
  writeFileSync(skillPath, output)
}

const [, , dispatcher, outDir] = process.argv
if (!dispatcher || !outDir) {
  process.stderr.write('Usage: node scripts/sync-skill-md.mjs <dispatcher.md> <out-dir>\n')
  process.exit(2)
}

generate(dispatcher, outDir)
