/**
 * Tests for skill-review CLI logic.
 *
 * All filesystem access is mocked via vi.mock('fs') so these tests run in
 * isolation without requiring the actual skill tree or config files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'

// ---------------------------------------------------------------------------
// Mock child_process (for `which` checks in checkReferenceValidity)
// ---------------------------------------------------------------------------
vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}))

// ---------------------------------------------------------------------------
// Mock fs — must be set up before the module under test is imported
// ---------------------------------------------------------------------------
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}))

import { spawnSync } from 'child_process'

import {
  parseFrontmatter,
  checkFrontmatterConformance,
  checkDispatcherParity,
  checkReferenceValidity,
  checkStructuralLint,
  checkInvocationDirective,
  checkDeprecationSanity,
  loadSkillOwners,
  loadMcpToolManifest,
  aggregateResults,
  formatHuman,
  formatJson,
  parseArgs,
} from './skill-review.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKILL_PATH = '.agents/skills/foo/SKILL.md'
const REPO_ROOT = '/repo'
const KNOWN_OWNERS = ['captain', 'agent-team']

function goodFrontmatter() {
  return {
    name: 'foo',
    description: 'Does something useful.',
    version: '1.0.0',
    scope: 'enterprise',
    owner: 'captain',
    status: 'stable',
  }
}

function makeSkillMd(fm: Record<string, unknown>, body: string): string {
  const fmLines = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')
  return `---\n${fmLines}\n---\n${body}`
}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('returns empty data when no frontmatter delimiter', () => {
    const { data, content } = parseFrontmatter('# No frontmatter here')
    expect(data).toEqual({})
    expect(content).toContain('# No frontmatter')
  })

  it('parses basic scalar fields', () => {
    const raw = `---\nname: my-skill\nversion: 1.2.3\nstatus: stable\n---\n# body`
    const { data } = parseFrontmatter(raw)
    expect(data.name).toBe('my-skill')
    expect(data.version).toBe('1.2.3')
    expect(data.status).toBe('stable')
  })

  it('parses boolean backend_only', () => {
    const raw = `---\nname: x\nbackend_only: true\n---\n`
    const { data } = parseFrontmatter(raw)
    expect(data.backend_only).toBe(true)
  })

  it('separates content from frontmatter', () => {
    const raw = `---\nname: x\n---\n# /x\n\n## Behavior\nDoes stuff.`
    const { content } = parseFrontmatter(raw)
    expect(content).toContain('# /x')
    expect(content).toContain('## Behavior')
  })

  it('parses nested depends_on with list items', () => {
    const raw = `---\nname: x\ndepends_on:\n  mcp_tools:\n    - crane_sos\n    - crane_schedule\n---\n`
    const { data } = parseFrontmatter(raw)
    const dep = data.depends_on as Record<string, unknown>
    expect(dep).toBeDefined()
    expect(dep.mcp_tools).toContain('crane_sos')
    expect(dep.mcp_tools).toContain('crane_schedule')
  })
})

// ---------------------------------------------------------------------------
// checkFrontmatterConformance
// ---------------------------------------------------------------------------

describe('checkFrontmatterConformance', () => {
  it('returns no violations for a well-formed skill', () => {
    const violations = checkFrontmatterConformance(
      SKILL_PATH,
      SKILL_PATH,
      goodFrontmatter(),
      'foo',
      KNOWN_OWNERS
    )
    expect(violations).toHaveLength(0)
  })

  it('errors on missing required field', () => {
    const fm = { ...goodFrontmatter(), owner: undefined }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', KNOWN_OWNERS)
    const v = violations.find((x) => x.rule === 'frontmatter.missing-field')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
    expect(v!.message).toContain('owner')
  })

  it('errors on bad semver', () => {
    const fm = { ...goodFrontmatter(), version: '1.0' }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', KNOWN_OWNERS)
    const v = violations.find((x) => x.rule === 'frontmatter.invalid-semver')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('errors on invalid scope enum', () => {
    const fm = { ...goodFrontmatter(), scope: 'vc' }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', KNOWN_OWNERS)
    const v = violations.find((x) => x.rule === 'frontmatter.invalid-scope')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('accepts valid venture scope', () => {
    const fm = { ...goodFrontmatter(), scope: 'venture:ss' }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', KNOWN_OWNERS)
    expect(violations.filter((v) => v.rule === 'frontmatter.invalid-scope')).toHaveLength(0)
  })

  it('errors on invalid status enum', () => {
    const fm = { ...goodFrontmatter(), status: 'beta' }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', KNOWN_OWNERS)
    const v = violations.find((x) => x.rule === 'frontmatter.invalid-status')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('errors on unknown owner', () => {
    const fm = { ...goodFrontmatter(), owner: 'unknown-team' }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', KNOWN_OWNERS)
    const v = violations.find((x) => x.rule === 'frontmatter.unknown-owner')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('errors on name-directory mismatch', () => {
    const fm = { ...goodFrontmatter(), name: 'bar' }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', KNOWN_OWNERS)
    const v = violations.find((x) => x.rule === 'frontmatter.name-mismatch')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('skips owner check when knownOwners is empty (manifest missing)', () => {
    const fm = { ...goodFrontmatter(), owner: 'anything' }
    const violations = checkFrontmatterConformance(SKILL_PATH, SKILL_PATH, fm, 'foo', [])
    expect(violations.filter((v) => v.rule === 'frontmatter.unknown-owner')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkDispatcherParity
// ---------------------------------------------------------------------------

describe('checkDispatcherParity', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset()
  })

  it('passes when command file exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const violations = checkDispatcherParity(SKILL_PATH, goodFrontmatter(), REPO_ROOT)
    expect(violations).toHaveLength(0)
  })

  it('errors when command file is missing', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const violations = checkDispatcherParity(SKILL_PATH, goodFrontmatter(), REPO_ROOT)
    const v = violations.find((x) => x.rule === 'dispatcher.missing-command-file')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
    expect(v!.message).toContain('.claude/commands/foo.md')
  })

  it('skips check when backend_only is true', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const fm = { ...goodFrontmatter(), backend_only: true }
    const violations = checkDispatcherParity(SKILL_PATH, fm, REPO_ROOT)
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkReferenceValidity
// ---------------------------------------------------------------------------

describe('checkReferenceValidity', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    vi.mocked(existsSync).mockReset()
    vi.mocked(spawnSync).mockReset()
    process.env = { ...OLD_ENV }
    delete process.env.CI
    delete process.env.CRANE_VENTURE_SAMPLE_REPO
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('returns no violations when no depends_on', () => {
    const violations = checkReferenceValidity(SKILL_PATH, goodFrontmatter(), REPO_ROOT, [])
    expect(violations).toHaveLength(0)
  })

  it('errors when mcp_tool not in manifest', () => {
    const fm = {
      ...goodFrontmatter(),
      depends_on: { mcp_tools: ['crane_missing'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, ['crane_sos'])
    const v = violations.find((x) => x.rule === 'references.unknown-mcp-tool')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
    expect(v!.message).toContain('crane_missing')
  })

  it('skips mcp_tools check when manifest is empty (file missing)', () => {
    const fm = {
      ...goodFrontmatter(),
      depends_on: { mcp_tools: ['crane_missing'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, [])
    expect(violations.filter((v) => v.rule === 'references.unknown-mcp-tool')).toHaveLength(0)
  })

  it('passes when mcp_tool is in manifest', () => {
    const fm = {
      ...goodFrontmatter(),
      depends_on: { mcp_tools: ['crane_sos'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, ['crane_sos'])
    expect(violations.filter((v) => v.rule === 'references.unknown-mcp-tool')).toHaveLength(0)
  })

  it('errors on file path without scope prefix', () => {
    const fm = {
      ...goodFrontmatter(),
      depends_on: { files: ['docs/some-doc.md'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, [])
    const v = violations.find((x) => x.rule === 'references.file-missing-scope-prefix')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
    expect(v!.message).toContain('docs/some-doc.md')
  })

  it('errors when crane-console file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const fm = {
      ...goodFrontmatter(),
      depends_on: { files: ['crane-console:docs/missing.md'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, [])
    const v = violations.find((x) => x.rule === 'references.broken-crane-console-file')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('passes when crane-console file exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const fm = {
      ...goodFrontmatter(),
      depends_on: { files: ['crane-console:docs/existing.md'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, [])
    expect(
      violations.filter((v) => v.rule === 'references.broken-crane-console-file')
    ).toHaveLength(0)
  })

  it('warns (not errors) for venture file when CRANE_VENTURE_SAMPLE_REPO is not set', () => {
    const fm = {
      ...goodFrontmatter(),
      depends_on: { files: ['venture:.design/DESIGN.md'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, [])
    const v = violations.find((x) => x.rule === 'references.venture-file-unverified')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
  })

  it('warns (not errors) for missing commands', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>)
    const fm = {
      ...goodFrontmatter(),
      depends_on: { commands: ['missing-cli'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, [])
    const v = violations.find((x) => x.rule === 'references.missing-command')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
  })

  it('skips global file check in CI', () => {
    process.env.CI = 'true'
    const fm = {
      ...goodFrontmatter(),
      depends_on: { files: ['global:~/.agents/skills/x/validate.py'] },
    }
    const violations = checkReferenceValidity(SKILL_PATH, fm, REPO_ROOT, [])
    const v = violations.find((x) => x.rule === 'references.global-file-unverified')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
    // Must NOT also produce a broken-global-file error
    expect(violations.filter((x) => x.rule === 'references.broken-global-file')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkStructuralLint
// ---------------------------------------------------------------------------

describe('checkStructuralLint', () => {
  it('passes for well-formed body', () => {
    const content = '# /foo - Does something\n\n## Behavior\nDoes stuff.\n'
    const violations = checkStructuralLint(SKILL_PATH, goodFrontmatter(), content)
    expect(violations).toHaveLength(0)
  })

  it('passes when heading is exactly # /name', () => {
    const content = '# /foo\n\n## Workflow\nDoes stuff.\n'
    const violations = checkStructuralLint(SKILL_PATH, goodFrontmatter(), content)
    expect(violations).toHaveLength(0)
  })

  it('errors when no # heading exists', () => {
    const content = 'Some prose without a heading.\n\n## Behavior\nDoes stuff.\n'
    const violations = checkStructuralLint(SKILL_PATH, goodFrontmatter(), content)
    const v = violations.find((x) => x.rule === 'structure.missing-h1-heading')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('errors when # heading does not start with skill name', () => {
    const content = '# Foo Tool\n\n## Phases\nDoes stuff.\n'
    const violations = checkStructuralLint(SKILL_PATH, goodFrontmatter(), content)
    const v = violations.find((x) => x.rule === 'structure.heading-mismatch')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
    expect(v!.message).toContain('/foo')
  })

  it('flags missing workflow section as info (advisory)', () => {
    // Use a section heading that is NOT in the accepted list so the check fires
    const content = '# /foo\n\n## Notes\nDoes stuff.\n'
    const violations = checkStructuralLint(SKILL_PATH, goodFrontmatter(), content)
    const v = violations.find((x) => x.rule === 'structure.missing-workflow-section')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('info')
  })

  it('accepts ## Phases as workflow section', () => {
    const content = '# /foo\n\n## Phases\nDoes stuff.\n'
    expect(checkStructuralLint(SKILL_PATH, goodFrontmatter(), content)).toHaveLength(0)
  })

  it('accepts ## Workflow as workflow section', () => {
    const content = '# /foo\n\n## Workflow\nDoes stuff.\n'
    expect(checkStructuralLint(SKILL_PATH, goodFrontmatter(), content)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// checkInvocationDirective
// ---------------------------------------------------------------------------

describe('checkInvocationDirective', () => {
  it('passes when invocation directive is present with correct skill_name', () => {
    const content =
      '# /foo\n\n> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "foo")`. This is non-blocking.\n\n## Behavior\nDoes stuff.\n'
    const violations = checkInvocationDirective(SKILL_PATH, goodFrontmatter(), content)
    expect(violations).toHaveLength(0)
  })

  it('errors when invocation directive is missing', () => {
    const content = '# /foo\n\n## Behavior\nDoes stuff.\n'
    const violations = checkInvocationDirective(SKILL_PATH, goodFrontmatter(), content)
    const v = violations.find((x) => x.rule === 'structure.missing-invocation-directive')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
    expect(v!.message).toContain('"foo"')
  })

  it('returns no violations for backend_only skills even when directive absent', () => {
    const content = '# /foo\n\n## Behavior\nDoes stuff.\n'
    const fm = { ...goodFrontmatter(), backend_only: true }
    const violations = checkInvocationDirective(SKILL_PATH, fm, content)
    expect(violations).toHaveLength(0)
  })

  it('errors when directive has wrong skill_name', () => {
    const content =
      '# /foo\n\n> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "bar")`. Non-blocking.\n\n## Behavior\nDoes stuff.\n'
    const violations = checkInvocationDirective(SKILL_PATH, goodFrontmatter(), content)
    const v = violations.find((x) => x.rule === 'structure.missing-invocation-directive')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// checkDeprecationSanity
// ---------------------------------------------------------------------------

describe('checkDeprecationSanity', () => {
  it('returns no violations for non-deprecated skills', () => {
    expect(checkDeprecationSanity(SKILL_PATH, goodFrontmatter())).toHaveLength(0)
  })

  it('errors when deprecated but sunset_date is missing', () => {
    const fm = {
      ...goodFrontmatter(),
      status: 'deprecated',
      deprecation_date: '2025-01-01',
    }
    const violations = checkDeprecationSanity(SKILL_PATH, fm)
    const v = violations.find((x) => x.rule === 'deprecation.missing-sunset-date')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('errors when deprecated but deprecation_date is missing', () => {
    const fm = {
      ...goodFrontmatter(),
      status: 'deprecated',
      sunset_date: '2025-04-01',
    }
    const violations = checkDeprecationSanity(SKILL_PATH, fm)
    const v = violations.find((x) => x.rule === 'deprecation.missing-deprecation-date')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('errors when sunset_date is not after deprecation_date', () => {
    const fm = {
      ...goodFrontmatter(),
      status: 'deprecated',
      deprecation_date: '2025-04-01',
      sunset_date: '2025-01-01',
    }
    const violations = checkDeprecationSanity(SKILL_PATH, fm)
    const v = violations.find((x) => x.rule === 'deprecation.sunset-before-deprecation')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })

  it('passes when both dates are valid and sunset is after deprecation', () => {
    const fm = {
      ...goodFrontmatter(),
      status: 'deprecated',
      deprecation_date: '2025-01-01',
      sunset_date: '2025-04-01',
    }
    expect(checkDeprecationSanity(SKILL_PATH, fm)).toHaveLength(0)
  })

  it('errors when deprecation_date is not a valid ISO date', () => {
    const fm = {
      ...goodFrontmatter(),
      status: 'deprecated',
      deprecation_date: 'not-a-date',
      sunset_date: '2025-04-01',
    }
    const violations = checkDeprecationSanity(SKILL_PATH, fm)
    const v = violations.find((x) => x.rule === 'deprecation.invalid-deprecation-date')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Config loaders
// ---------------------------------------------------------------------------

describe('loadSkillOwners', () => {
  beforeEach(() => vi.mocked(existsSync).mockReset())

  it('returns keys from skill-owners.json', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ captain: ['sos'], 'agent-team': ['build-log'] })
    )
    const owners = loadSkillOwners(REPO_ROOT)
    expect(owners).toContain('captain')
    expect(owners).toContain('agent-team')
  })

  it('returns empty array when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(loadSkillOwners(REPO_ROOT)).toEqual([])
  })
})

describe('loadMcpToolManifest', () => {
  beforeEach(() => vi.mocked(existsSync).mockReset())

  it('returns array of tool names', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(['crane_sos', 'crane_schedule']))
    const tools = loadMcpToolManifest('/repo/config/mcp-tool-manifest.json')
    expect(tools).toContain('crane_sos')
    expect(tools).toContain('crane_schedule')
  })

  it('returns empty array when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(loadMcpToolManifest('/repo/config/mcp-tool-manifest.json')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Aggregation and formatting
// ---------------------------------------------------------------------------

describe('aggregateResults', () => {
  it('counts violations correctly', () => {
    const violations = [
      {
        rule: 'r1',
        severity: 'error' as const,
        path: 'p',
        message: 'm',
        fix: 'f',
      },
      {
        rule: 'r2',
        severity: 'warning' as const,
        path: 'p',
        message: 'm',
        fix: 'f',
      },
    ]
    const result = aggregateResults(violations, 5)
    expect(result.skills_reviewed).toBe(5)
    expect(result.total_violations).toBe(2)
    expect(result.by_severity.error).toBe(1)
    expect(result.by_severity.warning).toBe(1)
    expect(result.by_severity.info).toBe(0)
  })

  it('handles zero violations', () => {
    const result = aggregateResults([], 3)
    expect(result.total_violations).toBe(0)
    expect(result.by_severity.error).toBe(0)
  })
})

describe('formatHuman', () => {
  it('shows "All skills pass." when no violations', () => {
    const result = aggregateResults([], 2)
    expect(formatHuman(result)).toContain('All skills pass.')
  })

  it('formats each violation with severity and fix', () => {
    const violations = [
      {
        rule: 'frontmatter.missing-field',
        severity: 'error' as const,
        path: '.agents/skills/foo/SKILL.md',
        message: 'Missing required field: owner',
        fix: 'Add owner field.',
      },
    ]
    const output = formatHuman(aggregateResults(violations, 1))
    expect(output).toContain('ERROR')
    expect(output).toContain('[frontmatter.missing-field]')
    expect(output).toContain('Missing required field: owner')
    expect(output).toContain('Fix: Add owner field.')
  })
})

describe('formatJson', () => {
  it('produces valid JSON with expected shape', () => {
    const result = aggregateResults([], 1)
    const json = JSON.parse(formatJson(result)) as typeof result
    expect(json).toHaveProperty('skills_reviewed', 1)
    expect(json).toHaveProperty('total_violations', 0)
    expect(json).toHaveProperty('by_severity')
    expect(json).toHaveProperty('violations')
    expect(Array.isArray(json.violations)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('parses --path', () => {
    const args = parseArgs(['--path', '.agents/skills/foo'])
    expect(args.path).toBe('.agents/skills/foo')
    expect(args.all).toBe(false)
  })

  it('parses --all', () => {
    const args = parseArgs(['--all'])
    expect(args.all).toBe(true)
    expect(args.path).toBeUndefined()
  })

  it('parses --strict', () => {
    expect(parseArgs(['--strict']).strict).toBe(true)
  })

  it('parses --json', () => {
    expect(parseArgs(['--json']).json).toBe(true)
  })

  it('parses --manifest', () => {
    const args = parseArgs(['--manifest', '/custom/path.json'])
    expect(args.manifest).toBe('/custom/path.json')
  })

  it('defaults to advisory (strict=false)', () => {
    expect(parseArgs(['--all']).strict).toBe(false)
  })

  it('defaults json to false', () => {
    expect(parseArgs(['--all']).json).toBe(false)
  })
})
