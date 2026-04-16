/**
 * Tests for skill-audit.ts tool
 *
 * Mocks fs (readdirSync, readFileSync, existsSync) and child_process (execSync)
 * to exercise inventory, staleness, schema-gap, and deprecation-queue logic
 * without touching disk or git.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any dynamic import
// ---------------------------------------------------------------------------

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  }
})

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SKILL.md frontmatter block. */
function skillMd(fm: Record<string, string>, extra = ''): string {
  const lines = ['---']
  for (const [k, v] of Object.entries(fm)) lines.push(`${k}: ${v}`)
  lines.push('---', '', extra)
  return lines.join('\n')
}

const FULL_FM = {
  name: 'my-skill',
  description: 'Does a thing.',
  version: '1.0.0',
  scope: 'enterprise',
  owner: 'captain',
  status: 'stable',
}

// A date 10 days ago and 200 days ago in ISO format
function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('skill-audit tool', () => {
  let fsMock: typeof import('fs')
  let cpMock: typeof import('child_process')

  beforeEach(async () => {
    vi.resetModules()
    fsMock = await import('fs')
    cpMock = await import('child_process')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  // Helper: load module fresh after mocks are configured
  const getModule = async () => {
    vi.resetModules()
    return import('./skill-audit.js')
  }

  // -------------------------------------------------------------------------
  // Empty result when no skills match scope
  // -------------------------------------------------------------------------

  it('returns empty inventory when no skills exist', async () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(false)
    vi.mocked(fsMock.readdirSync).mockReturnValue([])

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.inventory.total).toBe(0)
    expect(result.schema_gaps).toHaveLength(0)
    expect(result.staleness).toHaveLength(0)
    expect(result.deprecation_queue).toHaveLength(0)
    expect(result.summary).toContain('0 skill(s)')
  })

  // -------------------------------------------------------------------------
  // Inventory counts by scope / status / owner
  // -------------------------------------------------------------------------

  it('counts skills by scope, status, and owner', async () => {
    // Two enterprise skills: one stable/captain, one draft/agent-team
    const stableSkillMd = skillMd({ ...FULL_FM, name: 'alpha', status: 'stable', owner: 'captain' })
    const draftSkillMd = skillMd({
      name: 'beta',
      description: 'Beta.',
      version: '0.1.0',
      scope: 'enterprise',
      owner: 'agent-team',
      status: 'draft',
    })

    vi.mocked(fsMock.existsSync).mockImplementation((p) => {
      const path = String(p)
      // Base skills dirs exist
      if (path.endsWith('/.agents/skills') || path.endsWith('/skills')) return true
      // SKILL.md files exist for both skills
      if (path.endsWith('/alpha/SKILL.md') || path.endsWith('/beta/SKILL.md')) return true
      return false
    })

    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'alpha', isDirectory: () => true },
      { name: 'beta', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)

    vi.mocked(fsMock.readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('/alpha/SKILL.md')) return stableSkillMd
      if (String(p).endsWith('/beta/SKILL.md')) return draftSkillMd
      return ''
    })

    vi.mocked(cpMock.execSync).mockReturnValue(daysAgoISO(5) as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.inventory.total).toBe(2)
    expect(result.inventory.by_status['stable']).toBe(1)
    expect(result.inventory.by_status['draft']).toBe(1)
    expect(result.inventory.by_owner['captain']).toBe(1)
    expect(result.inventory.by_owner['agent-team']).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Staleness detection
  // -------------------------------------------------------------------------

  it('flags skills whose git-last-touched exceeds the threshold', async () => {
    const freshSkill = skillMd({ ...FULL_FM, name: 'fresh' })
    const staleSkill = skillMd({ ...FULL_FM, name: 'old-skill', owner: 'agent-team' })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'fresh', isDirectory: () => true },
      { name: 'old-skill', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)

    vi.mocked(fsMock.readFileSync).mockImplementation((p) => {
      if (String(p).includes('/fresh/')) return freshSkill
      if (String(p).includes('/old-skill/')) return staleSkill
      return ''
    })

    // fresh = touched 10 days ago, old-skill = touched 200 days ago
    vi.mocked(cpMock.execSync).mockImplementation((cmd) => {
      if (String(cmd).includes('/fresh/')) return daysAgoISO(10) as unknown as Buffer
      return daysAgoISO(200) as unknown as Buffer
    })

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.staleness).toHaveLength(1)
    expect(result.staleness[0].skill).toBe('old-skill')
    expect(result.staleness[0].days_since).toBeGreaterThan(180)
    expect(result.staleness[0].owner).toBe('agent-team')
  })

  it('marks skill as stale when git log returns empty (never committed)', async () => {
    const skill = skillMd({ ...FULL_FM, name: 'uncommitted' })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'uncommitted', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)
    vi.mocked(fsMock.readFileSync).mockReturnValue(skill)
    // git log returns empty string (not yet committed)
    vi.mocked(cpMock.execSync).mockReturnValue('' as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.staleness).toHaveLength(1)
    expect(result.staleness[0].last_touched).toBe('unknown')
    expect(result.staleness[0].days_since).toBe(Infinity)
  })

  // -------------------------------------------------------------------------
  // Schema gap detection
  // -------------------------------------------------------------------------

  it('reports missing required fields', async () => {
    // Missing: version, scope, owner, status
    const incomplete = skillMd({ name: 'partial', description: 'A partial skill.' })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'partial', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)
    vi.mocked(fsMock.readFileSync).mockReturnValue(incomplete)
    vi.mocked(cpMock.execSync).mockReturnValue(daysAgoISO(5) as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.schema_gaps).toHaveLength(1)
    expect(result.schema_gaps[0].skill).toBe('partial')
    expect(result.schema_gaps[0].missing_fields).toContain('version')
    expect(result.schema_gaps[0].missing_fields).toContain('scope')
    expect(result.schema_gaps[0].missing_fields).toContain('owner')
    expect(result.schema_gaps[0].missing_fields).toContain('status')
  })

  it('reports no schema gaps for fully-specified skills', async () => {
    const complete = skillMd({ ...FULL_FM })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'my-skill', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)
    vi.mocked(fsMock.readFileSync).mockReturnValue(complete)
    vi.mocked(cpMock.execSync).mockReturnValue(daysAgoISO(5) as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.schema_gaps).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Deprecation queue
  // -------------------------------------------------------------------------

  it('populates deprecation_queue for deprecated skills with sunset_date in the past', async () => {
    const pastSunset = new Date()
    pastSunset.setDate(pastSunset.getDate() - 10)
    const pastDeprecation = new Date()
    pastDeprecation.setDate(pastDeprecation.getDate() - 100)

    const deprecatedSkill = skillMd({
      ...FULL_FM,
      name: 'old-way',
      status: 'deprecated',
      deprecation_date: pastDeprecation.toISOString().slice(0, 10),
      sunset_date: pastSunset.toISOString().slice(0, 10),
    })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'old-way', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)
    vi.mocked(fsMock.readFileSync).mockReturnValue(deprecatedSkill)
    vi.mocked(cpMock.execSync).mockReturnValue(daysAgoISO(5) as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.deprecation_queue).toHaveLength(1)
    expect(result.deprecation_queue[0].skill).toBe('old-way')
    expect(result.deprecation_queue[0].days_until_sunset).toBeLessThanOrEqual(0)
  })

  it('populates deprecation_queue for deprecated skills with sunset_date in the future', async () => {
    const futureSunset = new Date()
    futureSunset.setDate(futureSunset.getDate() + 30)
    const pastDeprecation = new Date()
    pastDeprecation.setDate(pastDeprecation.getDate() - 5)

    const deprecatedSkill = skillMd({
      ...FULL_FM,
      name: 'retiring-soon',
      status: 'deprecated',
      deprecation_date: pastDeprecation.toISOString().slice(0, 10),
      sunset_date: futureSunset.toISOString().slice(0, 10),
    })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'retiring-soon', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)
    vi.mocked(fsMock.readFileSync).mockReturnValue(deprecatedSkill)
    vi.mocked(cpMock.execSync).mockReturnValue(daysAgoISO(5) as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.deprecation_queue).toHaveLength(1)
    expect(result.deprecation_queue[0].skill).toBe('retiring-soon')
    expect(result.deprecation_queue[0].days_until_sunset).toBeGreaterThan(0)
  })

  it('does not populate deprecation_queue for stable skills', async () => {
    const stable = skillMd({ ...FULL_FM })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'my-skill', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)
    vi.mocked(fsMock.readFileSync).mockReturnValue(stable)
    vi.mocked(cpMock.execSync).mockReturnValue(daysAgoISO(5) as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.deprecation_queue).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // include_deprecated = false
  // -------------------------------------------------------------------------

  it('excludes deprecated skills from inventory when include_deprecated is false', async () => {
    const stable = skillMd({ ...FULL_FM, name: 'keep-me' })
    const deprecated = skillMd({
      ...FULL_FM,
      name: 'drop-me',
      status: 'deprecated',
      deprecation_date: '2025-01-01',
      sunset_date: '2025-04-01',
    })

    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readdirSync).mockReturnValue([
      { name: 'keep-me', isDirectory: () => true },
      { name: 'drop-me', isDirectory: () => true },
    ] as ReturnType<typeof import('fs').readdirSync>)
    vi.mocked(fsMock.readFileSync).mockImplementation((p) => {
      if (String(p).includes('/keep-me/')) return stable
      return deprecated
    })
    vi.mocked(cpMock.execSync).mockReturnValue(daysAgoISO(5) as unknown as Buffer)

    const { runSkillAudit } = await getModule()
    const result = runSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: false,
    })

    expect(result.inventory.total).toBe(1)
    expect(result.inventory.by_status['deprecated']).toBeUndefined()
    expect(result.inventory.by_status['stable']).toBe(1)
  })

  // -------------------------------------------------------------------------
  // executeSkillAudit wrapper
  // -------------------------------------------------------------------------

  it('executeSkillAudit returns success with formatted message', async () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(false)
    vi.mocked(fsMock.readdirSync).mockReturnValue([])

    const { executeSkillAudit } = await getModule()
    const result = await executeSkillAudit({
      scope: 'enterprise',
      stale_threshold_days: 180,
      include_deprecated: true,
    })

    expect(result.status).toBe('success')
    expect(result.message).toContain('Skill Audit Report')
  })
})
