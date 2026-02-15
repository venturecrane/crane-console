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
vi.mock('../lib/session-state.js')
vi.mock('fs')

const getModule = async () => {
  vi.resetModules()
  return import('./sod.js')
}

/** Generate a YYYY-MM-DD string in local timezone, optionally offset by days */
function localDateStr(daysAgo = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
    // 3000-char note is under the 12K budget - should be included in full
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

  it('shows recent handoffs when queryHandoffs returns results', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    const now = new Date()
    const recentTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() // 2h ago

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          handoffs: [
            {
              id: 'h1',
              session_id: 'sess_1',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-mac23',
              summary: 'Fixed the handoff system',
              status_label: 'done',
              created_at: recentTime,
            },
            {
              id: 'h2',
              session_id: 'sess_2',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-m16',
              summary: 'Design work in progress',
              status_label: 'in_progress',
              created_at: recentTime,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('Recent Handoffs')
    expect(result.message).toContain('Fixed the handoff system')
    expect(result.message).toContain('Design work in progress')
    expect(result.recent_handoffs).toHaveLength(2)
  })

  it('falls back to last_handoff when queryHandoffs fails', async () => {
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
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    // Should fall back to the single last_handoff
    expect(result.message).toContain('Last Handoff')
    expect(result.message).toContain('Completed task implementation')
    expect(result.recent_handoffs).toBeUndefined()
  })

  it('filters handoffs older than 24h from recent display', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })
    vi.mocked(existsSync).mockReturnValue(false)

    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48h ago

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          handoffs: [
            {
              id: 'h_old',
              session_id: 'sess_old',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-old',
              summary: 'Old handoff',
              status_label: 'done',
              created_at: oldTime,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSod({})

    expect(result.status).toBe('valid')
    // Old handoffs filtered out, should fall back to last_handoff
    expect(result.message).toContain('Last Handoff')
    expect(result.message).not.toContain('Old handoff')
  })

  it('stores session state after successful start', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')
    const { setSession } = await import('../lib/session-state.js')

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

    await executeSod({})

    expect(setSession).toHaveBeenCalledWith('sess_test123', 'vc', 'venturecrane/crane-console')
  })

  it('shows portfolio review status when venture is vc', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    // Weekly plan missing, portfolio file exists with current review
    const portfolioJson = JSON.stringify({
      lastPortfolioReview: localDateStr(0),
      portfolioReviewCadenceDays: 7,
      ventures: [],
    })
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('ventures.json')) return true
      return false
    })
    vi.mocked(readFileSync).mockReturnValue(portfolioJson)

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
    expect(result.portfolio_review).toBeDefined()
    expect(result.portfolio_review?.status).toBe('current')
    expect(result.message).toContain('Portfolio Review')
    expect(result.message).toContain('Current')
  })

  it('shows portfolio review as due when older than cadence', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const portfolioJson = JSON.stringify({
      lastPortfolioReview: localDateStr(8),
      portfolioReviewCadenceDays: 7,
      ventures: [],
    })
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('ventures.json')) return true
      return false
    })
    vi.mocked(readFileSync).mockReturnValue(portfolioJson)

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

    expect(result.portfolio_review?.status).toBe('due')
    expect(result.portfolio_review?.age_days).toBe(8)
    expect(result.message).toContain('Due')
    expect(result.message).toContain('/portfolio-review')
  })

  it('shows portfolio review as overdue when older than 2x cadence', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const portfolioJson = JSON.stringify({
      lastPortfolioReview: localDateStr(16),
      portfolioReviewCadenceDays: 7,
      ventures: [],
    })
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('ventures.json')) return true
      return false
    })
    vi.mocked(readFileSync).mockReturnValue(portfolioJson)

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

    expect(result.portfolio_review?.status).toBe('overdue')
    expect(result.portfolio_review?.age_days).toBe(16)
    expect(result.message).toContain('Overdue')
  })

  it('handles malformed ventures.json gracefully for portfolio review', async () => {
    const { executeSod } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('ventures.json')) return true
      return false
    })
    vi.mocked(readFileSync).mockReturnValue('not valid json {{{')

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

    expect(result.portfolio_review?.status).toBe('missing')
  })

  describe('getPortfolioReviewStatus', () => {
    it('returns null for non-vc ventures', async () => {
      const { getPortfolioReviewStatus } = await getModule()

      expect(getPortfolioReviewStatus('ke')).toBeNull()
      expect(getPortfolioReviewStatus('dfg')).toBeNull()
      expect(getPortfolioReviewStatus('sc')).toBeNull()
    })

    it('returns missing when ventures.json does not exist', async () => {
      const { getPortfolioReviewStatus } = await getModule()

      vi.mocked(existsSync).mockReturnValue(false)

      const result = getPortfolioReviewStatus('vc')
      expect(result).toEqual({ status: 'missing' })
    })

    it('returns current when review is recent', async () => {
      const { getPortfolioReviewStatus } = await getModule()

      const today = localDateStr(0)
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ lastPortfolioReview: today, portfolioReviewCadenceDays: 7 })
      )

      const result = getPortfolioReviewStatus('vc')
      expect(result?.status).toBe('current')
      expect(result?.age_days).toBe(0)
      expect(result?.last_reviewed).toBe(today)
    })

    it('returns due when review is between cadence and 2x cadence', async () => {
      const { getPortfolioReviewStatus } = await getModule()

      const tenDaysAgo = localDateStr(10)
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ lastPortfolioReview: tenDaysAgo, portfolioReviewCadenceDays: 7 })
      )

      const result = getPortfolioReviewStatus('vc')
      expect(result?.status).toBe('due')
      expect(result?.age_days).toBe(10)
    })

    it('returns overdue when review is older than 2x cadence', async () => {
      const { getPortfolioReviewStatus } = await getModule()

      const twentyDaysAgo = localDateStr(20)
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ lastPortfolioReview: twentyDaysAgo, portfolioReviewCadenceDays: 7 })
      )

      const result = getPortfolioReviewStatus('vc')
      expect(result?.status).toBe('overdue')
      expect(result?.age_days).toBe(20)
    })

    it('returns missing when lastPortfolioReview is absent', async () => {
      const { getPortfolioReviewStatus } = await getModule()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ ventures: [] }))

      const result = getPortfolioReviewStatus('vc')
      expect(result).toEqual({ status: 'missing' })
    })

    it('returns missing when JSON is malformed', async () => {
      const { getPortfolioReviewStatus } = await getModule()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('this is not json')

      const result = getPortfolioReviewStatus('vc')
      expect(result).toEqual({ status: 'missing' })
    })
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
