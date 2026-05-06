/**
 * Tests for docs-drift-audit.ts
 *
 * Focus: verify each of the six checks produces findings on synthetic
 * inputs that mimic real drift scenarios. Pure helper functions
 * (extractMarkdownLinks, extractCraneDocCalls, resolveCraneDocCall) are
 * tested without filesystem mocks where possible. Filesystem-touching
 * checks use a tmp directory for fixtures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  extractMarkdownLinks,
  extractCraneDocCalls,
  resolveCraneDocCall,
  checkDeadInternalLinks,
  checkBrokenCraneDocReferences,
  checkDeprecatedSkillMentions,
  checkStaleByGit,
  checkSidebarDrift,
  checkCaptainReviewCandidates,
  walkMarkdownFiles,
  classifyDocsDirs,
  type SidebarExtraction,
  type DeprecatedSkill,
} from './docs-drift-audit.js'

// ---------------------------------------------------------------------------
// Tmp directory helpers
// ---------------------------------------------------------------------------

function makeTmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'docs-drift-audit-'))
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
    // Only the real one should be picked up; the fenced one is text content
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

// ---------------------------------------------------------------------------
// checkDeadInternalLinks
// ---------------------------------------------------------------------------

describe('checkDeadInternalLinks', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('flags links to non-existent files as ERROR', () => {
    const file = writeDoc(
      repoRoot,
      'docs/runbooks/deploy.md',
      ['# deploy', '', 'See [DNS](../infra/dns.md).'].join('\n')
    )
    const findings = checkDeadInternalLinks([file], repoRoot)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].type).toBe('dead-internal-link')
    expect(findings[0].detail).toContain('../infra/dns.md')
  })

  it('does not flag links to existing files', () => {
    writeDoc(repoRoot, 'docs/infra/dns.md', '# dns')
    const file = writeDoc(
      repoRoot,
      'docs/runbooks/deploy.md',
      ['# deploy', '', 'See [DNS](../infra/dns.md).'].join('\n')
    )
    const findings = checkDeadInternalLinks([file], repoRoot)
    expect(findings).toHaveLength(0)
  })

  it('skips external URLs', () => {
    const file = writeDoc(
      repoRoot,
      'docs/page.md',
      'See [Anthropic](https://anthropic.com) and [docs](mailto:noreply@example.com).'
    )
    const findings = checkDeadInternalLinks([file], repoRoot)
    expect(findings).toHaveLength(0)
  })

  it('skips non-markdown link targets like images', () => {
    const file = writeDoc(repoRoot, 'docs/page.md', '![diagram](./diagram.png)')
    const findings = checkDeadInternalLinks([file], repoRoot)
    expect(findings).toHaveLength(0)
  })

  it('strips fragments before resolving', () => {
    writeDoc(repoRoot, 'docs/foo.md', '# foo')
    const file = writeDoc(repoRoot, 'docs/page.md', 'See [foo](./foo.md#section).')
    const findings = checkDeadInternalLinks([file], repoRoot)
    expect(findings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkBrokenCraneDocReferences
// ---------------------------------------------------------------------------

describe('checkBrokenCraneDocReferences', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('flags unresolvable crane_doc references as ERROR', () => {
    const file = writeDoc(repoRoot, 'docs/page.md', "Reference: `crane_doc('global', 'gone.md')`.")
    const findings = checkBrokenCraneDocReferences([file], repoRoot)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
    expect(findings[0].type).toBe('broken-crane-doc-reference')
  })

  it('does not flag resolvable references', () => {
    writeDoc(repoRoot, 'docs/process/team-workflow.md', '# team-workflow')
    const file = writeDoc(
      repoRoot,
      'docs/page.md',
      "Reference: `crane_doc('global', 'team-workflow.md')`."
    )
    const findings = checkBrokenCraneDocReferences([file], repoRoot)
    expect(findings).toHaveLength(0)
  })

  it('skips placeholder scopes/names like {code}', () => {
    const file = writeDoc(
      repoRoot,
      'docs/page.md',
      "Template: `crane_doc('{code}', 'design-spec.md')`."
    )
    const findings = checkBrokenCraneDocReferences([file], repoRoot)
    expect(findings).toHaveLength(0)
  })

  it('skips calls with unknown literal scopes (documentation examples)', () => {
    const file = writeDoc(
      repoRoot,
      'docs/page.md',
      "Example: `crane_doc('scope', 'name')` — this is a syntax illustration."
    )
    const findings = checkBrokenCraneDocReferences([file], repoRoot)
    expect(findings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkDeprecatedSkillMentions
// ---------------------------------------------------------------------------

describe('checkDeprecatedSkillMentions', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('flags slash-form mentions of deprecated skills', () => {
    const deprecated: DeprecatedSkill[] = [
      { name: 'stitch-export', path: '/fake/.agents/skills/stitch-export/SKILL.md' },
    ]
    const file = writeDoc(
      repoRoot,
      'docs/process/design-pipeline.md',
      ['# design-pipeline', '', 'Use /stitch-export for exports.', ''].join('\n')
    )
    const findings = checkDeprecatedSkillMentions([file], repoRoot, deprecated)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warn')
    expect(findings[0].type).toBe('deprecated-skill-mention')
    expect(findings[0].detail).toContain('stitch-export')
  })

  it('does not flag substring matches', () => {
    const deprecated: DeprecatedSkill[] = [
      { name: 'stitch', path: '/fake/.agents/skills/stitch/SKILL.md' },
    ]
    const file = writeDoc(
      repoRoot,
      'docs/page.md',
      'The word stitching appears in this sentence but no slash-form.'
    )
    const findings = checkDeprecatedSkillMentions([file], repoRoot, deprecated)
    expect(findings).toHaveLength(0)
  })

  it('returns empty when no deprecated skills', () => {
    const file = writeDoc(repoRoot, 'docs/page.md', 'Plenty of /skill mentions here.')
    const findings = checkDeprecatedSkillMentions([file], repoRoot, [])
    expect(findings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkStaleByGit
// ---------------------------------------------------------------------------

describe('checkStaleByGit', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('flags files older than threshold as INFO', () => {
    const file = writeDoc(repoRoot, 'docs/standards/old.md', '# old')
    const now = new Date('2026-05-01T00:00:00Z')
    const oldTs = Math.floor(new Date('2025-09-01T00:00:00Z').getTime() / 1000) // ~242 days
    const mtimeMap = new Map<string, number>([['docs/standards/old.md', oldTs]])
    const findings = checkStaleByGit([file], repoRoot, mtimeMap, 180, now)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('info')
    expect(findings[0].type).toBe('stale-by-git')
  })

  it('does not flag files within threshold', () => {
    const file = writeDoc(repoRoot, 'docs/recent.md', '# recent')
    const now = new Date('2026-05-01T00:00:00Z')
    const recentTs = Math.floor(new Date('2026-04-01T00:00:00Z').getTime() / 1000)
    const mtimeMap = new Map<string, number>([['docs/recent.md', recentTs]])
    const findings = checkStaleByGit([file], repoRoot, mtimeMap, 180, now)
    expect(findings).toHaveLength(0)
  })

  it('skips files with no mtime entry (never committed)', () => {
    const file = writeDoc(repoRoot, 'docs/uncommitted.md', '# uncommitted')
    const findings = checkStaleByGit([file], repoRoot, new Map(), 180)
    expect(findings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkSidebarDrift — self-diagnostic and existence checks
// ---------------------------------------------------------------------------

describe('checkSidebarDrift', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('emits audit-tool-broken ERROR on extraction error with zero dirs', () => {
    const sidebar: SidebarExtraction = {
      autogenerate_dirs: [],
      raw: null,
      error: 'subprocess failed',
    }
    const findings = checkSidebarDrift(repoRoot, sidebar)
    expect(findings.some((f) => f.type === 'audit-tool-broken')).toBe(true)
  })

  it('does not emit audit-tool-broken when source-parse fallback succeeds', () => {
    const sidebar: SidebarExtraction = {
      autogenerate_dirs: ['company', 'operations'],
      raw: null,
      fallback: 'source-parse',
      error: 'astro not installed',
    }
    mkdirSync(join(repoRoot, 'docs/company'), { recursive: true })
    writeDoc(repoRoot, 'docs/company/page.md', '# page')
    mkdirSync(join(repoRoot, 'docs/operations'), { recursive: true })
    writeDoc(repoRoot, 'docs/operations/page.md', '# page')
    const findings = checkSidebarDrift(repoRoot, sidebar)
    expect(findings.some((f) => f.type === 'audit-tool-broken')).toBe(false)
    // INFO note signaling the fallback was used
    expect(findings.some((f) => f.type === 'sidebar-import-fallback')).toBe(true)
  })

  it('emits audit-tool-broken ERROR on zero-extraction', () => {
    const sidebar: SidebarExtraction = {
      autogenerate_dirs: [],
      raw: { autogenerate_dirs: [] },
    }
    const findings = checkSidebarDrift(repoRoot, sidebar)
    expect(findings).toHaveLength(1)
    expect(findings[0].type).toBe('audit-tool-broken')
  })

  it('flags sidebar dirs that do not exist on disk', () => {
    // sidebar references "ghosts/" but no such directory exists
    writeDoc(repoRoot, 'docs/real/page.md', '# real')
    const sidebar: SidebarExtraction = {
      autogenerate_dirs: ['real', 'ghosts'],
      raw: null,
    }
    const findings = checkSidebarDrift(repoRoot, sidebar)
    expect(findings.some((f) => f.type === 'sidebar-drift' && f.file === 'docs/ghosts')).toBe(true)
  })

  it('flags sidebar dirs that are empty', () => {
    mkdirSync(join(repoRoot, 'docs/empty'), { recursive: true })
    const sidebar: SidebarExtraction = {
      autogenerate_dirs: ['empty'],
      raw: null,
    }
    const findings = checkSidebarDrift(repoRoot, sidebar)
    expect(findings.some((f) => f.type === 'sidebar-drift' && f.file === 'docs/empty')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// checkCaptainReviewCandidates — filters TBDs and auto-gen frontmatter out
// ---------------------------------------------------------------------------

describe('checkCaptainReviewCandidates', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  const oldTs = Math.floor(new Date('2025-09-01T00:00:00Z').getTime() / 1000)
  const now = new Date('2026-05-01T00:00:00Z')

  it('flags stable narrative docs untouched > threshold', () => {
    const file = writeDoc(
      repoRoot,
      'docs/standards/typescript-guidelines.md',
      '# guidelines\n\nThis is settled narrative prose, no draft markers.'
    )
    const mtimeMap = new Map<string, number>([['docs/standards/typescript-guidelines.md', oldTs]])
    const findings = checkCaptainReviewCandidates([file], repoRoot, mtimeMap, 180, now)
    expect(findings).toHaveLength(1)
    expect(findings[0].type).toBe('captain-review-candidate')
  })

  it('skips files with TBD markers', () => {
    const file = writeDoc(repoRoot, 'docs/draft.md', '# draft\n\nTBD: fill in.')
    const mtimeMap = new Map<string, number>([['docs/draft.md', oldTs]])
    const findings = checkCaptainReviewCandidates([file], repoRoot, mtimeMap, 180, now)
    expect(findings).toHaveLength(0)
  })

  it('skips files with auto-generated frontmatter', () => {
    const file = writeDoc(repoRoot, 'docs/auto.md', '---\nauto_generated: true\n---\n\n# auto')
    const mtimeMap = new Map<string, number>([['docs/auto.md', oldTs]])
    const findings = checkCaptainReviewCandidates([file], repoRoot, mtimeMap, 180, now)
    expect(findings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Filesystem walking + classifying
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
