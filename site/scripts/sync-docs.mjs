/**
 * sync-docs.mjs
 *
 * Copies markdown files from ../docs/{company,operations,ventures}/ into
 * site/src/content/docs/ and injects Starlight-compatible frontmatter
 * (title extracted from the first # heading in each file).
 *
 * This runs as a prebuild step before `astro build`.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs'
import { join, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const siteRoot = join(__dirname, '..')
const docsRoot = join(siteRoot, '..', 'docs')
const contentDocsDir = join(siteRoot, 'src', 'content', 'docs')

// Fail fast if docs directory is missing (catches Vercel Root Directory misconfiguration)
if (!existsSync(docsRoot)) {
  console.error(`ERROR: docs directory not found at ${docsRoot}`)
  console.error('Ensure the Vercel Root Directory is set to "site/" in project settings.')
  process.exit(1)
}

// Load ventures.json for template variable replacement
const venturesPath = join(siteRoot, '..', 'config', 'ventures.json')
const venturesData = JSON.parse(readFileSync(venturesPath, 'utf-8'))
const ventures = venturesData.ventures

// Directories to sync from ../docs/ into src/content/docs/
const SYNC_DIRS = [
  'company',
  'operations',
  'ventures',
  'infra',
  'process',
  'instructions',
  'design-system',
  'adr',
  'runbooks',
  'standards',
]

// Files to exclude from site sync (agent directives that overlap with human-facing docs)
const EXCLUDE_FILES = [
  'instructions/design-system.md', // Covered by design-system/overview.md and token-taxonomy.md
]

// Venture design specs live in docs/design/ventures/{code}/ but should appear
// under each venture's section on the site, not under Design System.
const DESIGN_SPEC_DIR = join(docsRoot, 'design', 'ventures')

// Skills directory for {{skills:table}} token generation
const SKILLS_DIR = join(siteRoot, '..', '.agents', 'skills')

/**
 * Recursively find all .md files in a directory.
 */
function findMarkdownFiles(dir, files = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      findMarkdownFiles(fullPath, files)
    } else if (entry.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Extract the title from the first # heading in a markdown file.
 * Falls back to a title derived from the filename.
 */
function extractTitle(content, filePath) {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) {
    // Escape double quotes to prevent YAML frontmatter breakage
    return match[1].trim().replace(/"/g, '\\"')
  }
  // Fallback: derive from filename
  const name = basename(filePath, '.md')
  return name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Remove the first # heading from markdown content.
 * Starlight renders the frontmatter title as the page heading,
 * so the duplicate h1 in the body is redundant.
 */
function stripFirstHeading(content) {
  return content.replace(/^\s*#\s+.+\n+/, '')
}

/**
 * Check if a markdown file already has frontmatter (starts with ---).
 */
function hasFrontmatter(content) {
  return content.trimStart().startsWith('---')
}

/**
 * Inject frontmatter into markdown content.
 * If frontmatter already exists, ensure it has a title field.
 */
function injectFrontmatter(content, filePath) {
  if (hasFrontmatter(content)) {
    // Check if it already has a title
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (fmMatch && /^title\s*:/m.test(fmMatch[1])) {
      // Strip h1 from body - Starlight renders the frontmatter title
      const fmEnd = content.indexOf('---', 3) + 3
      const body = content.slice(fmEnd)
      return content.slice(0, fmEnd) + stripFirstHeading(body)
    }
    // Has frontmatter but no title - inject title and strip h1
    const title = extractTitle(content, filePath)
    const updated = content.replace(/^---\n/, `---\ntitle: "${title}"\n`)
    const fmEnd = updated.indexOf('---', 3) + 3
    const body = updated.slice(fmEnd)
    return updated.slice(0, fmEnd) + stripFirstHeading(body)
  }

  const title = extractTitle(content, filePath)
  return `---\ntitle: "${title}"\n---\n\n${stripFirstHeading(content)}`
}

/**
 * Replace template tokens with data from ventures.json.
 * Tokens: {{venture:CODE:FIELD}}, {{portfolio:table}}
 * Must run BEFORE frontmatter injection.
 */
function replaceTemplateVars(content) {
  let warnings = []

  // Replace {{venture:CODE:FIELD}} tokens
  content = content.replace(/\{\{venture:(\w+):(\w+)\}\}/g, (match, code, field) => {
    const venture = ventures.find((v) => v.code === code)
    if (!venture) {
      warnings.push(`Unknown venture code: ${code}`)
      return `[UNKNOWN: ${code}]`
    }
    // Check top-level fields first, then portfolio fields
    let value = venture[field] ?? venture.portfolio?.[field] ?? null
    if (value === null || value === undefined) return '\u2014'
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '\u2014'
    return String(value)
  })

  // Replace {{portfolio:table}} with generated markdown table
  content = content.replace(/\{\{portfolio:table\}\}/g, () => {
    // Internal site: show all ventures except SMD (parent entity, covered by Company section)
    const rows = ventures
      .filter((v) => v.code !== 'smd')
      .map((v) => {
        const stage = v.portfolio?.bvmStage ?? '\u2014'
        const status = v.portfolio?.status ?? '\u2014'
        const stack = v.portfolio?.techStack?.join(', ') || '\u2014'
        return `| ${v.name} | ${stage} | ${status} | ${stack} |`
      })
    return (
      '| Venture | Stage | Status | Tech Stack |\n| ------- | ----- | ------ | ---------- |\n' +
      rows.join('\n')
    )
  })

  // Replace {{skills:table}} with auto-generated skills reference from .agents/skills/
  content = content.replace(/\{\{skills:table\}\}/g, () => {
    if (!existsSync(SKILLS_DIR)) return '[Skills directory not found]'
    const skills = []
    for (const dir of readdirSync(SKILLS_DIR)) {
      const skillFile = join(SKILLS_DIR, dir, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      const raw = readFileSync(skillFile, 'utf-8')
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
      if (!fmMatch) continue
      const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m)
      const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m)
      if (nameMatch && descMatch) {
        skills.push({ name: nameMatch[1].trim(), description: descMatch[1].trim() })
      }
    }
    skills.sort((a, b) => a.name.localeCompare(b.name))
    const rows = skills.map((s) => `| \`/${s.name}\` | ${s.description} |`)
    return '| Command | Description |\n| ------- | ----------- |\n' + rows.join('\n')
  })

  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`  TEMPLATE WARNING: ${w}`)
  }

  return content
}

/**
 * Check content staleness and return a report entry.
 */
function checkStaleness(content, relPath) {
  const tbdCount = (content.match(/\bTBD\b/gi) || []).length
  const lineCount = content.split('\n').length
  if (tbdCount > 2 || lineCount < 20) {
    return { path: relPath, tbdCount, lineCount, stale: true }
  }
  return { path: relPath, tbdCount, lineCount, stale: false }
}

// Clean out the content docs directory to start fresh each build
console.log('Syncing docs into src/content/docs/...')

// Remove old synced content (but keep the directory)
for (const dir of SYNC_DIRS) {
  const targetDir = join(contentDocsDir, dir)
  rmSync(targetDir, { recursive: true, force: true })
}
// Also clean venture design-spec copies (synced from docs/design/ventures/)
// These land inside the already-cleaned ventures/ dir, so no extra rmSync needed

let fileCount = 0
const stalenessReport = []

for (const syncDir of SYNC_DIRS) {
  const sourceDir = join(docsRoot, syncDir)
  const mdFiles = findMarkdownFiles(sourceDir)

  for (const srcFile of mdFiles) {
    const relPath = relative(sourceDir, srcFile)
    const destFile = join(contentDocsDir, syncDir, relPath)
    const displayPath = join(syncDir, relPath)

    // Skip excluded files
    if (EXCLUDE_FILES.includes(displayPath)) {
      console.log(`  SKIP  ${displayPath} (excluded)`)
      continue
    }

    // Ensure destination directory exists
    mkdirSync(dirname(destFile), { recursive: true })

    // Read, replace template vars, inject frontmatter, write
    let content = readFileSync(srcFile, 'utf-8')
    content = replaceTemplateVars(content)
    const processed = injectFrontmatter(content, srcFile)
    writeFileSync(destFile, processed, 'utf-8')

    stalenessReport.push(checkStaleness(content, displayPath))
    fileCount++
  }
}

// Copy venture design specs into each venture's content directory
// (docs/design/ventures/{code}/design-spec.md → site content ventures/{code}/design-spec.md)
if (existsSync(DESIGN_SPEC_DIR)) {
  for (const entry of readdirSync(DESIGN_SPEC_DIR)) {
    const specFile = join(DESIGN_SPEC_DIR, entry, 'design-spec.md')
    if (existsSync(specFile)) {
      const destFile = join(contentDocsDir, 'ventures', entry, 'design-spec.md')
      mkdirSync(dirname(destFile), { recursive: true })
      let content = readFileSync(specFile, 'utf-8')
      content = replaceTemplateVars(content)
      const processed = injectFrontmatter(content, specFile)
      writeFileSync(destFile, processed, 'utf-8')
      stalenessReport.push(checkStaleness(content, join('ventures', entry, 'design-spec.md')))
      fileCount++
    }
  }
}

console.log(`Synced ${fileCount} markdown files.`)

// Staleness report
const stalePages = stalenessReport.filter((r) => r.stale)
const okPages = stalenessReport.filter((r) => !r.stale)

if (stalePages.length > 0) {
  console.log('\nSTALENESS REPORT:')
  for (const p of stalePages) {
    console.log(`  WARN  ${p.path} - ${p.tbdCount} TBD, ${p.lineCount} lines`)
  }
  for (const p of okPages) {
    console.log(`  OK    ${p.path}`)
  }
  console.log(`  TOTAL: ${stalePages.length} pages need attention, ${okPages.length} pages OK`)
}
