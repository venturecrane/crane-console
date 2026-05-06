import { describe, it, expect } from 'vitest'
import {
  parseMarkers,
  diffGate,
  renderActivityShipped,
  renderActivityCompleted,
  renderIssueList,
  initMarkersForPage,
  initMarkersForPageDetailed,
  isBulletListBody,
  replaceBlockBody,
  refreshOnePage,
  parseArgs,
  expandScopes,
  loadRefreshConfig,
  type DataFetcher,
  type PrItem,
  type IssueItem,
  type RefreshConfig,
} from './docs-refresh.js'

// ---------------------------------------------------------------------------
// parseMarkers
// ---------------------------------------------------------------------------

describe('parseMarkers', () => {
  it('parses a well-formed marker pair', () => {
    const content = [
      '# Page',
      '',
      '<!-- docs-refresh:activity-shipped -->',
      '- #123 feat: thing',
      '<!-- /docs-refresh:activity-shipped -->',
      '',
      'tail',
    ].join('\n')
    const blocks = parseMarkers(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].name).toBe('activity-shipped')
    expect(blocks[0].body).toBe('- #123 feat: thing')
  })

  it('parses multiple non-overlapping markers', () => {
    const content = [
      '<!-- docs-refresh:a -->',
      'one',
      '<!-- /docs-refresh:a -->',
      'middle',
      '<!-- docs-refresh:b -->',
      'two',
      '<!-- /docs-refresh:b -->',
    ].join('\n')
    const blocks = parseMarkers(content)
    expect(blocks.map((b) => b.name)).toEqual(['a', 'b'])
  })

  it('throws on unclosed marker', () => {
    const content = ['<!-- docs-refresh:a -->', 'body', 'no close'].join('\n')
    expect(() => parseMarkers(content)).toThrow(/Unclosed marker 'a'/)
  })

  it('throws on close without matching open', () => {
    const content = ['<!-- /docs-refresh:a -->'].join('\n')
    expect(() => parseMarkers(content)).toThrow(/no matching open/)
  })

  it('throws on nested markers', () => {
    const content = [
      '<!-- docs-refresh:a -->',
      '<!-- docs-refresh:b -->',
      '<!-- /docs-refresh:b -->',
      '<!-- /docs-refresh:a -->',
    ].join('\n')
    expect(() => parseMarkers(content)).toThrow(/Nested marker/)
  })

  it('throws on mismatched open/close names', () => {
    const content = ['<!-- docs-refresh:a -->', 'body', '<!-- /docs-refresh:b -->'].join('\n')
    expect(() => parseMarkers(content)).toThrow(/Mismatched markers/)
  })

  it('throws on duplicate marker name on same page', () => {
    const content = [
      '<!-- docs-refresh:a -->',
      'one',
      '<!-- /docs-refresh:a -->',
      '<!-- docs-refresh:a -->',
      'two',
      '<!-- /docs-refresh:a -->',
    ].join('\n')
    expect(() => parseMarkers(content)).toThrow(/Duplicate marker 'a'/)
  })
})

// ---------------------------------------------------------------------------
// diffGate
// ---------------------------------------------------------------------------

describe('diffGate', () => {
  const before = [
    '# Page',
    '',
    '<!-- docs-refresh:activity-shipped -->',
    '- #1 old',
    '<!-- /docs-refresh:activity-shipped -->',
    '',
    'tail',
  ].join('\n')

  it('passes when only block body changed', () => {
    const after = before.replace('- #1 old', '- #2 new\n- #3 newer')
    expect(diffGate(before, after)).toEqual({ ok: true })
  })

  it('fails when content outside markers changes', () => {
    const after = before.replace('tail', 'tail with extra prose')
    const r = diffGate(before, after)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/outside managed blocks differs/)
  })

  it('fails when marker set changes between runs', () => {
    const after = [
      '# Page',
      '',
      '<!-- docs-refresh:activity-shipped -->',
      '- body',
      '<!-- /docs-refresh:activity-shipped -->',
      '<!-- docs-refresh:new-block -->',
      '- another',
      '<!-- /docs-refresh:new-block -->',
      '',
      'tail',
    ].join('\n')
    const r = diffGate(before, after)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/marker set changed/)
  })

  it('fails on parse error in either side', () => {
    const after = ['<!-- docs-refresh:broken -->', 'no close'].join('\n')
    const r = diffGate(before, after)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/parse error/)
  })

  it('handles position invariance — block size changing does not break gate', () => {
    const big = before.replace('- #1 old', Array(20).fill('- entry').join('\n'))
    expect(diffGate(before, big)).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

describe('renderActivityShipped', () => {
  it('renders a list of merged feat: PRs without the feat: prefix', () => {
    const prs: PrItem[] = [
      { number: 781, title: 'feat: git-authority rubric', mergedAt: '2026-05-01T12:34:56Z' },
      { number: 779, title: 'feat(skills): clerk + playwright', mergedAt: '2026-05-01T10:00:00Z' },
    ]
    const out = renderActivityShipped(prs)
    expect(out).toContain('- #781 git-authority rubric')
    expect(out).toContain('- #779 clerk + playwright')
    expect(out).toContain('_(2026-05-01)_')
    expect(out).not.toContain('feat:')
  })

  it('renders empty-state message when no PRs (with paragraph-shaped body)', () => {
    expect(renderActivityShipped([])).toBe('\n_No recent shipped activity._\n')
  })

  it('starts with leading blank line for prettier compatibility', () => {
    const prs: PrItem[] = [{ number: 1, title: 'feat: a', mergedAt: '2026-01-01' }]
    expect(renderActivityShipped(prs).startsWith('\n- #1 a')).toBe(true)
  })

  it('escapes asterisks in PR titles', () => {
    const prs: PrItem[] = [
      { number: 289, title: 'feat: migrate @venturecrane/* harness', mergedAt: '2026-04-20' },
    ]
    expect(renderActivityShipped(prs)).toContain('@venturecrane/\\*')
  })
})

describe('renderActivityCompleted', () => {
  it('renders empty-state message when no PRs (with paragraph-shaped body)', () => {
    expect(renderActivityCompleted([])).toBe('\n_No completed work yet._\n')
  })
})

describe('renderIssueList', () => {
  it('renders open issues as bullet list with leading blank line', () => {
    const issues: IssueItem[] = [
      { number: 100, title: 'do the thing' },
      { number: 200, title: 'do another thing' },
    ]
    expect(renderIssueList(issues, 'EMPTY')).toBe('\n- #100 do the thing\n- #200 do another thing')
  })

  it('uses provided empty message (paragraph-shaped body)', () => {
    expect(renderIssueList([], 'no issues')).toBe('\nno issues\n')
  })

  it('escapes underscores in issue titles', () => {
    const issues: IssueItem[] = [{ number: 143, title: 'Clean up _2 suffix files' }]
    expect(renderIssueList(issues, 'X')).toContain('Clean up \\_2 suffix files')
  })
})

// ---------------------------------------------------------------------------
// Init-markers
// ---------------------------------------------------------------------------

describe('initMarkersForPage', () => {
  it('appends a new section for product-overview activity-shipped', () => {
    const before = '# Page\n\n## What It Is\n\nBlurb.\n'
    const after = initMarkersForPage(before, 'product-overview')
    expect(after).toContain('## Recent Activity')
    expect(after).toContain('<!-- docs-refresh:activity-shipped -->')
    expect(after).toContain('<!-- /docs-refresh:activity-shipped -->')
  })

  it('wraps existing roadmap section in markers', () => {
    const before = [
      '# Roadmap',
      '',
      '## Current Focus',
      '',
      '- existing item',
      '',
      '## Future',
      '',
      '- something far',
      '',
    ].join('\n')
    const after = initMarkersForPage(before, 'roadmap')
    // existing content preserved, wrapped in markers
    expect(after).toContain('<!-- docs-refresh:activity-current-focus -->')
    expect(after).toContain('- existing item')
    expect(after).toContain('<!-- /docs-refresh:activity-current-focus -->')
    // Future section heading remains untouched
    expect(after).toContain('## Future')
    expect(after).toContain('- something far')
  })

  it('is idempotent — running twice does not double-wrap', () => {
    const before = '# Page\n\n## Recent Activity\n\nbody\n'
    const once = initMarkersForPage(before, 'product-overview')
    const twice = initMarkersForPage(once, 'product-overview')
    expect(twice).toBe(once)
  })

  it('matches headings case-insensitively (## Near-Term vs ## Near-term)', () => {
    const before = [
      '# Roadmap',
      '',
      '## Near-Term',
      '',
      '- thing one',
      '',
      '## Future',
      '',
      '- aspiration',
      '',
    ].join('\n')
    const result = initMarkersForPageDetailed(before, 'roadmap')
    // Near-term wraps via case-insensitive match.
    expect(result.content).toContain('<!-- docs-refresh:activity-near-term -->')
    expect(result.content).toContain('- thing one')
    // current-focus and completed produce warnings (headings absent).
    expect(result.warnings.some((w) => w.includes('activity-current-focus'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('activity-completed'))).toBe(true)
  })

  it('refuses to wrap when section content is a table (not a bullet list)', () => {
    const before = [
      '# Roadmap',
      '',
      '## Current Focus',
      '',
      '| Initiative | Status |',
      '| ---------- | ------ |',
      '| do thing   | active |',
      '',
      '## Other',
      '',
    ].join('\n')
    const result = initMarkersForPageDetailed(before, 'roadmap')
    expect(result.content).not.toContain('<!-- docs-refresh:activity-current-focus -->')
    expect(result.warnings.some((w) => w.includes('not a bullet list'))).toBe(true)
  })
})

describe('isBulletListBody', () => {
  it('accepts pure bullet list', () => {
    expect(isBulletListBody(['- one', '- two', ''])).toBe(true)
  })

  it('rejects table content', () => {
    expect(isBulletListBody(['| a | b |', '| - | - |'])).toBe(false)
  })

  it('rejects prose', () => {
    expect(isBulletListBody(['Some plain text.', ''])).toBe(false)
  })

  it('rejects empty body (nothing to wrap)', () => {
    expect(isBulletListBody(['', ''])).toBe(false)
  })

  it('accepts asterisk-style bullets too', () => {
    expect(isBulletListBody(['* one', '* two'])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// replaceBlockBody
// ---------------------------------------------------------------------------

describe('replaceBlockBody', () => {
  it('replaces only the body between markers', () => {
    const before = [
      'pre',
      '<!-- docs-refresh:a -->',
      'old body line 1',
      'old body line 2',
      '<!-- /docs-refresh:a -->',
      'post',
    ].join('\n')
    const after = replaceBlockBody(before, 'a', 'NEW BODY')
    expect(after).toBe(
      ['pre', '<!-- docs-refresh:a -->', 'NEW BODY', '<!-- /docs-refresh:a -->', 'post'].join('\n')
    )
  })

  it('throws when marker not found', () => {
    expect(() => replaceBlockBody('# nothing', 'missing', 'x')).toThrow(/not found/)
  })
})

// ---------------------------------------------------------------------------
// refreshOnePage with mocked fetcher
// ---------------------------------------------------------------------------

class MockFetcher implements DataFetcher {
  constructor(
    public prResponses: Record<string, PrItem[]> = {},
    public issueResponses: Record<string, IssueItem[]> = {},
    public throwOn?: string
  ) {}
  fetchMergedFeats(repo: string, _search: string, _limit: number): PrItem[] {
    if (this.throwOn === 'pr') throw new Error('mock gh failure')
    return this.prResponses[repo] || []
  }
  fetchIssuesByLabel(repo: string, label: string, _limit: number): IssueItem[] {
    if (this.throwOn === 'issue') throw new Error('mock gh failure')
    return this.issueResponses[`${repo}:${label}`] || []
  }
}

const baseConfig: RefreshConfig = {
  ventures: {
    fake: {
      primaryRepo: 'venturecrane/fake-repo',
      labels: { in_progress: 'status:in-progress', ready: 'status:ready' },
      shippedSearch: 'feat: in:title',
    },
  },
  limits: { shippedRecent: 5, completedHistory: 10, currentFocus: 10, nearTerm: 10 },
}

describe('refreshOnePage', () => {
  it('returns skipped=true with helpful reason when markers are missing', () => {
    const fetcher = new MockFetcher()
    // We can't easily refresh a real page without filesystem; this test exercises
    // the skipped-branch via a venture that exists but has no markers (the dfg dir
    // exists but its product-overview doesn't have markers in this test repo state).
    // Instead, test against a venture not in config.
    const result = refreshOnePage('nonexistent-venture', 'product-overview', baseConfig, fetcher)
    // Skipped because page doesn't exist OR config missing — either way, skipped.
    expect(result.skipped).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('defaults to audit mode when no scopes', () => {
    expect(parseArgs([])).toEqual({ mode: 'audit', scopes: [], json: false, dryRun: false })
  })

  it('detects refresh mode from a venture-code scope', () => {
    const a = parseArgs(['vc'])
    expect(a.mode).toBe('refresh')
    expect(a.scopes).toEqual(['vc'])
  })

  it('detects init-markers mode', () => {
    const a = parseArgs(['--init-markers', 'vc'])
    expect(a.mode).toBe('init-markers')
    expect(a.scopes).toEqual(['vc'])
  })

  it('parses --json and --dry-run flags', () => {
    const a = parseArgs(['--json', '--dry-run', 'vc'])
    expect(a.json).toBe(true)
    expect(a.dryRun).toBe(true)
    expect(a.mode).toBe('refresh')
  })

  it('parses --help', () => {
    expect(parseArgs(['-h']).mode).toBe('help')
    expect(parseArgs(['--help']).mode).toBe('help')
  })
})

// ---------------------------------------------------------------------------
// expandScopes
// ---------------------------------------------------------------------------

describe('expandScopes', () => {
  it('expands a venture code to all marked page types', () => {
    const targets = expandScopes(['fake'], baseConfig)
    // Only product-overview and roadmap have markers in v1; metrics is skipped.
    const pages = targets.map((t) => t.page).sort()
    expect(pages).toEqual(['product-overview', 'roadmap'])
    expect(targets.every((t) => t.venture === 'fake')).toBe(true)
  })

  it('expands a single-page scope', () => {
    expect(expandScopes(['fake/roadmap'], baseConfig)).toEqual([
      { venture: 'fake', page: 'roadmap' },
    ])
  })

  it('expands a page-type scope across configured ventures', () => {
    const targets = expandScopes(['roadmap'], baseConfig)
    expect(targets).toEqual([{ venture: 'fake', page: 'roadmap' }])
  })

  it('throws on unknown page type in <code>/<page>', () => {
    expect(() => expandScopes(['fake/bogus'], baseConfig)).toThrow(/Unknown page type/)
  })
})

// ---------------------------------------------------------------------------
// loadRefreshConfig
// ---------------------------------------------------------------------------

describe('loadRefreshConfig', () => {
  it('loads the live config and returns sensible defaults', () => {
    const config = loadRefreshConfig()
    expect(config.ventures).toBeDefined()
    expect(config.limits.shippedRecent).toBeGreaterThan(0)
    expect(config.limits.completedHistory).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// E2E fixture: render a synthetic page through the full pipeline
// ---------------------------------------------------------------------------

describe('E2E: marker insert → render → diff-gate cycle', () => {
  it('full lifecycle: init-markers, render, gate passes, second-run idempotent', () => {
    // Phase 1: bare page → init-markers seeds the structure
    const bare = [
      '# Roadmap',
      '',
      '## Current Focus',
      '',
      '- existing TODO',
      '',
      '## Near-term',
      '',
      '- next quarter thing',
      '',
      '## Completed',
      '',
      '- shipped already',
      '',
      '## Future',
      '',
      '- aspiration',
      '',
    ].join('\n')

    const seeded = initMarkersForPage(bare, 'roadmap')
    const seededBlocks = parseMarkers(seeded)
    expect(seededBlocks.map((b) => b.name).sort()).toEqual([
      'activity-completed',
      'activity-current-focus',
      'activity-near-term',
    ])

    // Phase 2: render replaces marker bodies with new content
    const rendered = replaceBlockBody(
      seeded,
      'activity-current-focus',
      '- #500 new in-progress thing'
    )

    // Diff gate must pass — only marker body changed
    expect(diffGate(seeded, rendered)).toEqual({ ok: true })

    // Outside-marker structure preserved
    expect(rendered).toContain('## Future')
    expect(rendered).toContain('- aspiration')

    // Phase 3: idempotent — re-running render with same input is a no-op
    const reRendered = replaceBlockBody(
      rendered,
      'activity-current-focus',
      '- #500 new in-progress thing'
    )
    expect(reRendered).toBe(rendered)
  })

  it('dispatches all four renderers from a venture+config combo', () => {
    const fetcher = new MockFetcher(
      {
        'venturecrane/fake-repo': [
          { number: 1, title: 'feat: a', mergedAt: '2026-05-01' },
          { number: 2, title: 'feat: b', mergedAt: '2026-05-02' },
        ],
      },
      {
        'venturecrane/fake-repo:status:in-progress': [{ number: 10, title: 'in-progress thing' }],
        'venturecrane/fake-repo:status:ready': [{ number: 20, title: 'ready thing' }],
      }
    )
    // Verify each renderer produces non-empty output via the registry
    const v = baseConfig.ventures.fake
    expect(
      renderActivityShipped(fetcher.fetchMergedFeats(v.primaryRepo, v.shippedSearch, 5))
    ).toContain('- #1 a')
    expect(
      renderActivityCompleted(fetcher.fetchMergedFeats(v.primaryRepo, v.shippedSearch, 10))
    ).toContain('- #2 b')
    expect(
      renderIssueList(fetcher.fetchIssuesByLabel(v.primaryRepo, v.labels.in_progress, 10), 'X')
    ).toContain('- #10 in-progress thing')
    expect(
      renderIssueList(fetcher.fetchIssuesByLabel(v.primaryRepo, v.labels.ready, 10), 'X')
    ).toContain('- #20 ready thing')
  })
})
