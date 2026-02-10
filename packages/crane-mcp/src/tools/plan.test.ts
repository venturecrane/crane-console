/**
 * Tests for plan.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, statSync, existsSync } from 'fs'
import { mockWeeklyPlanContent, mockStaleWeeklyPlanContent } from '../__fixtures__/repo-fixtures.js'

vi.mock('fs')

const getModule = async () => {
  vi.resetModules()
  return import('./plan.js')
}

describe('plan tool', () => {
  const originalCwd = process.cwd

  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/Users/testuser/dev/crane-console')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('parses valid WEEKLY_PLAN.md', async () => {
    const { executePlan } = await getModule()

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(mockWeeklyPlanContent)
    vi.mocked(statSync).mockReturnValue({
      mtime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    } as ReturnType<typeof statSync>)

    const result = await executePlan({})

    expect(result.status).toBe('valid')
    expect(result.plan).toBeDefined()
    expect(result.plan?.priority_venture).toBe('Venture Crane (vc)')
    expect(result.plan?.secondary_focus).toBe('Kid Expenses (ke)')
    expect(result.plan?.target_issues).toContain('#42 Implement test suite')
  })

  it('calculates plan age correctly', async () => {
    const { executePlan } = await getModule()

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(mockWeeklyPlanContent)

    // 3 days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    vi.mocked(statSync).mockReturnValue({
      mtime: threeDaysAgo,
    } as ReturnType<typeof statSync>)

    const result = await executePlan({})

    expect(result.status).toBe('valid')
    expect(result.age_days).toBe(3)
  })

  it('returns stale status when plan is old', async () => {
    const { executePlan } = await getModule()

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(mockStaleWeeklyPlanContent)

    // 10 days ago (>= 7 is stale)
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    vi.mocked(statSync).mockReturnValue({
      mtime: tenDaysAgo,
    } as ReturnType<typeof statSync>)

    const result = await executePlan({})

    expect(result.status).toBe('stale')
    expect(result.age_days).toBe(10)
    expect(result.message).toContain('stale')
  })

  it('returns error when file missing', async () => {
    const { executePlan } = await getModule()

    vi.mocked(existsSync).mockReturnValue(false)

    const result = await executePlan({})

    expect(result.status).toBe('missing')
    expect(result.message).toContain('Missing')
    expect(result.plan).toBeUndefined()
  })

  it('extracts target issues from plan', async () => {
    const { executePlan } = await getModule()

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(mockWeeklyPlanContent)
    vi.mocked(statSync).mockReturnValue({
      mtime: new Date(),
    } as ReturnType<typeof statSync>)

    const result = await executePlan({})

    expect(result.plan?.target_issues).toHaveLength(2)
    expect(result.plan?.target_issues).toContain('#42 Implement test suite')
    expect(result.plan?.target_issues).toContain('#38 Add CI/CD pipeline')
  })
})
