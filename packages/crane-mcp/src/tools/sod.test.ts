/**
 * Tests for sod.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, statSync, readFileSync } from 'fs'
import {
  mockVentures,
  mockSodResponse,
  mockSodResponseWithDocIndex,
  mockSodResponseWithEnterpriseContext,
  mockSodResponseWithLargeDocIndex,
  mockSodResponseWithBudgetExhaustion,
  mockLongNoteContent,
  mockBudgetExhaustionContent,
} from '../__fixtures__/api-responses.js'
import {
  mockRepoInfo,
  mockLocalRepos,
  mockWeeklyPlanContent,
} from '../__fixtures__/repo-fixtures.js'
import { mockP0Issues } from '../__fixtures__/github-responses.js'

vi.mock('../lib/repo-scanner.js')
vi.mock('../lib/github.js')
vi.mock('fs')

const getModule = async () => {
  vi.resetModules()
  return import('./sod.js')
}

describe('sod tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' }
    vi.spyOn(process, 'cwd').mockReturnValue('/Users/testuser/dev/crane-console')

    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns valid context when in valid repo', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    // Mock fetch for getVentures and startSession
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    expect(result.context).toBeDefined()
    expect(result.context?.venture).toBe('vc')
    expect(result.context?.venture_name).toBe('Venture Crane')
    expect(result.context?.session_id).toBe('sess_test123')
  })

  it('lists ventures when no venture specified and not in repo', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, scanLocalRepos } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)
    vi.mocked(scanLocalRepos).mockReturnValue(mockLocalRepos)

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeSod({})

    expect(result.status).toBe('select_venture')
    expect(result.ventures).toBeDefined()
    expect(result.ventures?.length).toBe(4)
    expect(result.message).toContain('Available ventures')
  })

  it('shows P0 issues when present', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: mockP0Issues })
    vi.mocked(existsSync).mockReturnValue(false)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })

    const result = await executeSod({})

    expect(result.p0_issues).toHaveLength(2)
    expect(result.message).toContain('P0 Issues')
    expect(result.message).toContain('#1')
    expect(result.message).toContain('immediate attention')
  })

  it('includes weekly plan status', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    // Mock plan file exists and is valid
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({
      mtime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    } as ReturnType<typeof statSync>)
    vi.mocked(readFileSync).mockReturnValue(mockWeeklyPlanContent)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })

    const result = await executeSod({})

    expect(result.weekly_plan.status).toBe('valid')
    // Note: priority_venture extraction uses dynamic require('fs') which isn't fully mockable
    // The age calculation works correctly though
    expect(result.weekly_plan.age_days).toBe(2)
    expect(result.message).toContain('Weekly Plan')
  })

  it('handles missing plan file', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })

    const result = await executeSod({})

    expect(result.weekly_plan.status).toBe('missing')
    expect(result.message).toContain('Missing')
  })

  it('renders doc index table when doc_index present in response', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponseWithDocIndex,
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('Available Documentation')
    expect(result.message).toContain('crane_doc')
    expect(result.message).toContain('vc-project-instructions.md')
    expect(result.message).toContain('team-workflow.md')
  })

  it('validates venture code', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, scanLocalRepos } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)
    vi.mocked(scanLocalRepos).mockReturnValue([])

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeSod({ venture: 'invalid' })

    expect(result.status).toBe('error')
    expect(result.message).toContain('Unknown venture')
  })

  it('returns error when API key missing', async () => {
    const { executeSod } = await getModule()

    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeSod({})

    expect(result.status).toBe('error')
    expect(result.message).toContain('CRANE_CONTEXT_KEY')
  })

  it('includes enterprise context notes under budget in full', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponseWithEnterpriseContext,
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    // Short note should be fully included
    expect(result.message).toContain('Short summary under the cap.')
    // 3000-char note is under the 12K budget — should be included in full
    expect(result.message).toContain(mockLongNoteContent)
    expect(result.message).not.toContain('Truncated')
  })

  it('passes short enterprise context notes through intact', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponseWithEnterpriseContext,
      })

    const result = await executeSod({})

    // The short note's full content should appear without truncation marker
    expect(result.message).toContain('VC Executive Summary')
    expect(result.message).toContain('Short summary under the cap.')
  })

  it('truncates when enterprise context exceeds budget', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponseWithBudgetExhaustion,
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('Enterprise Context')
    // First two venture-scoped notes fit (~8K < 12K budget)
    expect(result.message).toContain('VC Strategy')
    expect(result.message).toContain('VC Roadmap')
    // Third note should be partially included (truncated)
    expect(result.message).toContain('SMD Global Overview')
    expect(result.message).toContain('Truncated')
    // Fourth note should be omitted with pointer
    expect(result.message).toContain('more note(s) available')
    expect(result.message).toContain('crane_notes')
    // Full 4000-char content should NOT appear 3 times (budget prevents it)
    const fullContentMatches = result.message.split(mockBudgetExhaustionContent).length - 1
    expect(fullContentMatches).toBeLessThanOrEqual(2)
  })

  it('sorts venture-scoped notes before global notes', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    // Fixture has global note FIRST in array, venture note SECOND
    const sortTestResponse = {
      ...mockSodResponse,
      enterprise_context: {
        notes: [
          {
            id: 'note_global_first',
            title: 'Global Note First In Array',
            content: 'Global content.',
            tags: '["executive-summary"]',
            venture: null,
            archived: 0,
            created_at: '2026-02-10T00:00:00Z',
            updated_at: '2026-02-10T00:00:00Z',
            actor_key_id: null,
            meta_json: null,
          },
          {
            id: 'note_vc_second',
            title: 'VC Note Second In Array',
            content: 'Venture-specific content.',
            tags: '["executive-summary"]',
            venture: 'vc',
            archived: 0,
            created_at: '2026-02-09T00:00:00Z',
            updated_at: '2026-02-09T00:00:00Z',
            actor_key_id: null,
            meta_json: null,
          },
        ],
        count: 2,
      },
    }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sortTestResponse,
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    // Venture-scoped note should appear BEFORE global note in output
    const vcPos = result.message.indexOf('VC Note Second In Array')
    const globalPos = result.message.indexOf('Global Note First In Array')
    expect(vcPos).toBeGreaterThan(-1)
    expect(globalPos).toBeGreaterThan(-1)
    expect(vcPos).toBeLessThan(globalPos)
  })

  it('caps doc index table at 30 rows with overflow indicator', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponseWithLargeDocIndex,
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('Available Documentation (40 docs)')
    // First 30 docs should appear
    expect(result.message).toContain('doc-01.md')
    expect(result.message).toContain('doc-30.md')
    // Doc 31+ should NOT appear
    expect(result.message).not.toContain('doc-31.md')
    // Overflow indicator
    expect(result.message).toContain('10 more')
    expect(result.message).toContain('crane_doc_audit')
  })
})
