/**
 * Tests for drift-markdown-parse.ts
 *
 * Covers extractMarkdownLinks, extractCraneDocCalls, resolveCraneDocCall,
 * and their URL classification helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  extractMarkdownLinks,
  extractCraneDocCalls,
  resolveCraneDocCall,
} from './drift-markdown-parse.js'

function makeTmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'drift-markdown-parse-'))
}

function writeDoc(repoRoot: string, relPath: string, content: string): string {
  const full = join(repoRoot, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
  return full
}

// ---------------------------------------------------------------------------
// extractMarkdownLinks — AST-based parsing skips code blocks, fragments, etc.
// ---------------------------------------------------------------------------

describe('extractMarkdownLinks', () => {
  it('extracts inline links with line numbers', () => {
    const content = ['# Heading', '', 'See [target](./foo.md) for details.', ''].join('\n')
    const links = extractMarkdownLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0].url).toBe('./foo.md')
    expect(links[0].line).toBe(3)
  })

  it('skips links inside fenced code blocks', () => {
    const content = [
      '# Doc',
      '',
      '```markdown',
      '[do not](./this-link-is-inside-a-code-block.md)',
      '```',
      '',
      '[real](./real.md)',
    ].join('\n')
    const links = extractMarkdownLinks(content)
    const urls = links.map((l) => l.url)
    expect(urls).toContain('./real.md')
    expect(urls).not.toContain('./this-link-is-inside-a-code-block.md')
  })

  it('skips links inside inline code spans', () => {
    const content = '`[code](./fake.md)` then [real](./real.md).'
    const links = extractMarkdownLinks(content)
    const urls = links.map((l) => l.url)
    expect(urls).toContain('./real.md')
    expect(urls).not.toContain('./fake.md')
  })

  it('extracts reference-style link definitions', () => {
    const content = ['See [the doc][ref] for details.', '', '[ref]: ./reference-target.md'].join(
      '\n'
    )
    const links = extractMarkdownLinks(content)
    const urls = links.map((l) => l.url)
    expect(urls).toContain('./reference-target.md')
  })

  it('returns empty list on malformed content', () => {
    expect(extractMarkdownLinks('')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// extractCraneDocCalls
// ---------------------------------------------------------------------------

describe('extractCraneDocCalls', () => {
  it('extracts single-quoted calls', () => {
    const content = "Reference: `crane_doc('global', 'team-workflow.md')` for details."
    const calls = extractCraneDocCalls(content)
    expect(calls).toEqual([{ scope: 'global', doc_name: 'team-workflow.md', line: 1 }])
  })

  it('extracts double-quoted calls', () => {
    const content = 'See `crane_doc("vc", "design-spec.md")` for tokens.'
    const calls = extractCraneDocCalls(content)
    expect(calls).toEqual([{ scope: 'vc', doc_name: 'design-spec.md', line: 1 }])
  })

  it('extracts multiple calls with correct line numbers', () => {
    const content = [
      "First: `crane_doc('global', 'a.md')`",
      '',
      "Second: `crane_doc('global', 'b.md')`",
    ].join('\n')
    const calls = extractCraneDocCalls(content)
    expect(calls).toHaveLength(2)
    expect(calls[0].line).toBe(1)
    expect(calls[1].line).toBe(3)
  })

  it('returns empty list when no calls present', () => {
    expect(extractCraneDocCalls('plain markdown content')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// resolveCraneDocCall
// ---------------------------------------------------------------------------

describe('resolveCraneDocCall', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('resolves global basename calls by searching common dirs', () => {
    writeDoc(repoRoot, 'docs/process/team-workflow.md', '# team-workflow')
    const resolved = resolveCraneDocCall('global', 'team-workflow.md', repoRoot)
    expect(resolved).toContain('docs/process/team-workflow.md')
  })

  it('resolves global slash-form calls to docs/<rel>', () => {
    writeDoc(repoRoot, 'docs/memory/governance.md', '# governance')
    const resolved = resolveCraneDocCall('global', 'memory/governance.md', repoRoot)
    expect(resolved).toContain('docs/memory/governance.md')
  })

  it('resolves venture-scoped calls to docs/ventures/<code>/', () => {
    writeDoc(repoRoot, 'docs/ventures/vc/design-spec.md', '# design-spec')
    const resolved = resolveCraneDocCall('vc', 'design-spec.md', repoRoot)
    expect(resolved).toContain('docs/ventures/vc/design-spec.md')
  })

  it('returns null for unresolvable references', () => {
    expect(resolveCraneDocCall('global', 'never-existed.md', repoRoot)).toBeNull()
    expect(resolveCraneDocCall('vc', 'gone.md', repoRoot)).toBeNull()
  })

  it('returns null for unknown venture code', () => {
    expect(resolveCraneDocCall('xx', 'anything.md', repoRoot)).toBeNull()
  })
})
