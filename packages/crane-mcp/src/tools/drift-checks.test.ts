/**
 * Tests for drift-checks.ts
 *
 * Covers all drift check functions with synthetic filesystem fixtures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  checkDeadInternalLinks,
  checkBrokenCraneDocReferences,
  checkDeprecatedSkillMentions,
  checkStaleByGit,
  checkSidebarDrift,
  checkCaptainReviewCandidates,
  checkVentureSidebarParity,
} from './drift-checks.js'
import type { SidebarExtraction } from './drift-astro-sidebar.js'
import type { DeprecatedSkill } from './drift-fs-helpers.js'

function makeTmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'drift-checks-'))
}

function writeDoc(repoRoot: string, relPath: string, content: string): string {
  const full = join(repoRoot, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
  return full
}

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
// checkVentureSidebarParity — venture registry vs astro sidebar
// ---------------------------------------------------------------------------

function makeVentureFixture(repoRoot: string, ventures: string[], sidebarEntries: string[]): void {
  // config/ventures.json
  mkdirSync(join(repoRoot, 'config'), { recursive: true })
  writeFileSync(
    join(repoRoot, 'config', 'ventures.json'),
    JSON.stringify({ ventures: ventures.map((code) => ({ code })) }),
    'utf8'
  )
  // site/astro.config.mjs with sidebar entries for each code
  mkdirSync(join(repoRoot, 'site'), { recursive: true })
  const sidebarLines = sidebarEntries
    .map((code) => `      { label: '${code}', autogenerate: { directory: 'ventures/${code}' } },`)
    .join('\n')
  const astroConfig = `export default { sidebar: [\n${sidebarLines}\n] }`
  writeFileSync(join(repoRoot, 'site', 'astro.config.mjs'), astroConfig, 'utf8')
}

describe('checkVentureSidebarParity', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTmpRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('pass case: all ventures with docs have a sidebar entry', () => {
    makeVentureFixture(repoRoot, ['vc', 'ss'], ['vc', 'ss'])
    writeDoc(repoRoot, 'docs/ventures/vc/overview.md', '# vc')
    writeDoc(repoRoot, 'docs/ventures/ss/overview.md', '# ss')
    const findings = checkVentureSidebarParity(repoRoot)
    expect(findings.filter((f) => f.type === 'venture-has-docs-no-sidebar-entry')).toHaveLength(0)
  })

  it('fail case: venture has docs but is missing from sidebar → one ERROR', () => {
    makeVentureFixture(repoRoot, ['vc', 'ss'], ['vc'])
    writeDoc(repoRoot, 'docs/ventures/vc/overview.md', '# vc')
    writeDoc(repoRoot, 'docs/ventures/ss/overview.md', '# ss')
    const findings = checkVentureSidebarParity(repoRoot)
    const errors = findings.filter((f) => f.type === 'venture-has-docs-no-sidebar-entry')
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
    expect(errors[0].file).toBe('docs/ventures/ss')
  })

  it('emits INFO for ventures in config with no docs directory', () => {
    makeVentureFixture(repoRoot, ['vc', 'future'], ['vc'])
    writeDoc(repoRoot, 'docs/ventures/vc/overview.md', '# vc')
    const findings = checkVentureSidebarParity(repoRoot)
    const infos = findings.filter((f) => f.type === 'venture-in-config-no-docs')
    expect(infos).toHaveLength(1)
    expect(infos[0].severity).toBe('info')
    expect(infos[0].file).toBe('docs/ventures/future')
  })
})
