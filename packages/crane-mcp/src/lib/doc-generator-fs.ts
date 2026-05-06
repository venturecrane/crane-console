/**
 * Filesystem utilities for doc-generator.
 *
 * Low-level helpers for reading files, traversing directories, and
 * collecting code fragments. No doc-type knowledge lives here.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

export interface SourceFragment {
  label: string
  content: string
  path: string
}

// ============================================================================
// Primitive helpers
// ============================================================================

export function safeReadFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

export function truncate(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '\n\n... (truncated)'
}

export function extractFirstParagraph(markdown: string): string | null {
  const lines = markdown.split('\n')
  let foundContent = false
  const paragraph: string[] = []

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (foundContent) break
      continue
    }
    if (line.trim() === '') {
      if (foundContent) break
      continue
    }
    foundContent = true
    paragraph.push(line)
  }

  return paragraph.length > 0 ? paragraph.join('\n') : null
}

// ============================================================================
// Directory traversal
// ============================================================================

/**
 * Collect files matching `extensions` from one subdirectory level (non-recursive).
 * Extracted to keep `findFiles` depth under the max-depth threshold.
 */
function collectSubdirFiles(subdir: string, extensions: string[]): string[] {
  const results: string[] = []
  try {
    for (const subEntry of readdirSync(subdir)) {
      if (!extensions.some((ext) => subEntry.endsWith(ext))) continue
      const subPath = join(subdir, subEntry)
      try {
        if (statSync(subPath).isFile()) results.push(subPath)
      } catch {
        // ignore stat errors
      }
    }
  } catch {
    // ignore readdir errors
  }
  return results
}

/**
 * Find files matching `extensions` under `dir`, recursing one level deep.
 */
export function findFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = []

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue

      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          results.push(...collectSubdirFiles(fullPath, extensions))
        } else if (extensions.some((ext) => entry.endsWith(ext))) {
          results.push(fullPath)
        }
      } catch {
        // ignore stat errors
      }
    }
  } catch {
    // ignore readdir errors
  }

  return results.sort()
}

// ============================================================================
// Fragment builders
// ============================================================================

export function readFileFragment(filePath: string, label: string): SourceFragment | null {
  if (!existsSync(filePath)) return null
  const content = safeReadFile(filePath)
  if (!content) return null
  return { label, content: truncate(content, 10000), path: label }
}

export function readDirectoryContents(dirPath: string, label: string): SourceFragment | null {
  if (!existsSync(dirPath)) return null

  try {
    const files = findFiles(dirPath, ['.md', '.txt'])
    if (files.length === 0) return null

    const fragments: string[] = []
    for (const file of files.slice(0, 10)) {
      const content = safeReadFile(file)
      if (content) {
        fragments.push(`## ${basename(file)}\n\n${truncate(content, 3000)}`)
      }
    }

    if (fragments.length === 0) return null

    return { label, content: fragments.join('\n\n---\n\n'), path: label }
  } catch {
    return null
  }
}

export function collectCodeFiles(
  dir: string,
  repoPath: string,
  extensions: string[]
): { content: string; path: string } | null {
  if (!existsSync(dir)) return null

  try {
    const files = findFiles(dir, extensions)
    if (files.length === 0) return null

    const fragments: string[] = []
    for (const file of files.slice(0, 20)) {
      const content = safeReadFile(file)
      if (content) {
        fragments.push(`// ${relative(repoPath, file)}\n${truncate(content, 3000)}`)
      }
    }

    if (fragments.length === 0) return null

    return { content: fragments.join('\n\n'), path: relative(repoPath, dir) }
  } catch {
    return null
  }
}
