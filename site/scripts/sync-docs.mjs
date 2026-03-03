/**
 * sync-docs.mjs
 *
 * Copies markdown files from ../docs/{company,operations,ventures}/ into
 * site/src/content/docs/ and injects Starlight-compatible frontmatter
 * (title extracted from the first # heading in each file).
 *
 * This runs as a prebuild step before `astro build`.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const siteRoot = join(__dirname, '..')
const docsRoot = join(siteRoot, '..', 'docs')
const contentDocsDir = join(siteRoot, 'src', 'content', 'docs')

// Directories to sync from ../docs/ into src/content/docs/
const SYNC_DIRS = ['company', 'operations', 'ventures']

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
    return match[1].trim()
  }
  // Fallback: derive from filename
  const name = basename(filePath, '.md')
  return name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
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
      return content // Already has frontmatter with title
    }
    // Has frontmatter but no title - inject title into it
    const title = extractTitle(content, filePath)
    return content.replace(/^---\n/, `---\ntitle: "${title}"\n`)
  }

  const title = extractTitle(content, filePath)
  return `---\ntitle: "${title}"\n---\n\n${content}`
}

// Clean out the content docs directory to start fresh each build
console.log('Syncing docs into src/content/docs/...')

// Remove old synced content (but keep the directory)
for (const dir of SYNC_DIRS) {
  const targetDir = join(contentDocsDir, dir)
  rmSync(targetDir, { recursive: true, force: true })
}

let fileCount = 0

for (const syncDir of SYNC_DIRS) {
  const sourceDir = join(docsRoot, syncDir)
  const mdFiles = findMarkdownFiles(sourceDir)

  for (const srcFile of mdFiles) {
    const relPath = relative(sourceDir, srcFile)
    const destFile = join(contentDocsDir, syncDir, relPath)

    // Ensure destination directory exists
    mkdirSync(dirname(destFile), { recursive: true })

    // Read, inject frontmatter, write
    const content = readFileSync(srcFile, 'utf-8')
    const processed = injectFrontmatter(content, srcFile)
    writeFileSync(destFile, processed, 'utf-8')
    fileCount++
  }
}

console.log(`Synced ${fileCount} markdown files.`)
