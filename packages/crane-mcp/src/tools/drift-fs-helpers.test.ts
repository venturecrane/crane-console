/**
 * Tests for drift-fs-helpers.ts
 *
 * Covers walkMarkdownFiles and classifyDocsDirs.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { walkMarkdownFiles, classifyDocsDirs } from './drift-fs-helpers.js'

function makeTmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'drift-fs-helpers-'))
}

function writeDoc(repoRoot: string, relPath: string, content: string): string {
  const full = join(repoRoot, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
  return full
}

// ---------------------------------------------------------------------------
// walkMarkdownFiles
// ---------------------------------------------------------------------------

describe('walkMarkdownFiles', () => {
  it('walks directory recursively and returns only .md', () => {
    const root = makeTmpRepo()
    try {
      writeDoc(root, 'docs/a.md', '# a')
      writeDoc(root, 'docs/sub/b.md', '# b')
      writeDoc(root, 'docs/sub/c.txt', 'not md')
      const files = walkMarkdownFiles(join(root, 'docs'))
      expect(files).toHaveLength(2)
      expect(files.some((f) => f.endsWith('a.md'))).toBe(true)
      expect(files.some((f) => f.endsWith('b.md'))).toBe(true)
      expect(files.some((f) => f.endsWith('c.txt'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// classifyDocsDirs
// ---------------------------------------------------------------------------

describe('classifyDocsDirs', () => {
  it('separates site-published from non-published top-level dirs', () => {
    const root = makeTmpRepo()
    try {
      mkdirSync(join(root, 'docs', 'company'), { recursive: true })
      mkdirSync(join(root, 'docs', 'handoffs'), { recursive: true })
      const dirs = classifyDocsDirs(root, ['company', 'ventures/vc'])
      expect(dirs.site_published).toContain('company')
      expect(dirs.non_published).toContain('handoffs')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
