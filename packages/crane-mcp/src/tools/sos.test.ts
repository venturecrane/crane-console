/**
 * Tests for sos.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mockVentures,
  mockSosResponse,
  mockSosResponseWithDocIndex,
  mockSosResponseWithEnterpriseContext,
  mockSosResponseWithLargeDocIndex,
  mockSosResponseWithBudgetExhaustion,
  mockLongNoteContent,
  mockBudgetExhaustionContent,
} from '../__fixtures__/api-responses.js'
import { mockRepoInfo, mockLocalRepos } from '../__fixtures__/repo-fixtures.js'
import { mockP0Issues } from '../__fixtures__/github-responses.js'

vi.mock('../lib/repo-scanner.js')
vi.mock('../lib/github.js')
vi.mock('../lib/session-state.js')
vi.mock('fs')

const getModule = async () => {
  vi.resetModules()
  return import('./sos.js')
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

describe('sos tool', () => {
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
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    // Mock fetch for getVentures and startSession
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.context).toBeDefined()
    expect(result.context?.venture).toBe('vc')
    expect(result.context?.venture_name).toBe('Venture Crane')
    expect(result.context?.session_id).toBe('sess_test123')
  })

  it('lists ventures when no venture specified and not in repo', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, scanLocalRepos } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)
    vi.mocked(scanLocalRepos).mockReturnValue(mockLocalRepos)

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeSos({})

    expect(result.status).toBe('select_venture')
    expect(result.ventures).toBeDefined()
    expect(result.ventures?.length).toBe(4)
    expect(result.message).toContain('Available ventures')
  })

  it('shows P0 issues in Alerts section when present', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: mockP0Issues })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    expect(result.p0_issues).toHaveLength(2)
    expect(result.message).toContain('## Alerts')
    expect(result.message).toContain('P0 Issues')
    expect(result.message).toContain('#1')
  })

  it('does not render doc index table in message (removed for brevity)', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponseWithDocIndex,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    // Doc index table is no longer rendered - available via crane_doc_audit()
    expect(result.message).not.toContain('Available Documentation')
    expect(result.message).not.toContain('vc-project-instructions.md')
    // Footer points to crane_doc_audit() for full index
    expect(result.message).toContain('crane_doc_audit()')
  })

  it('validates venture code', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, scanLocalRepos } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)
    vi.mocked(scanLocalRepos).mockReturnValue([])

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeSos({ venture: 'invalid' })

    expect(result.status).toBe('error')
    expect(result.message).toContain('Unknown venture')
  })

  it('returns error when API key missing', async () => {
    const { executeSos } = await getModule()

    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeSos({})

    expect(result.status).toBe('error')
    expect(result.message).toContain('CRANE_CONTEXT_KEY')
  })

  it('includes current-venture enterprise context notes under 2KB budget', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponseWithEnterpriseContext,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    // Current-venture (vc) note should be included
    expect(result.message).toContain('Short summary under the cap.')
    // Global note (3000 chars) is excluded because it's not current-venture
    expect(result.message).not.toContain(mockLongNoteContent)
    // Should have pointer to cross-venture notes
    expect(result.message).toContain('Other ventures')
  })

  it('passes short enterprise context notes through intact', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponseWithEnterpriseContext,
      })

    const result = await executeSos({})

    // The short note's full content should appear without truncation marker
    expect(result.message).toContain('VC Executive Summary')
    expect(result.message).toContain('Short summary under the cap.')
  })

  it('truncates current-venture notes when exceeding 2KB budget', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponseWithBudgetExhaustion,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('Enterprise Context')
    // First vc note title + 200-char excerpt shown
    expect(result.message).toContain('VC Strategy')
    // Pointer to full content
    expect(result.message).toContain('executive-summary')
    // Global notes are excluded from inline display
    expect(result.message).not.toContain('SMD Global Overview')
  })

  it('only includes current-venture notes, excludes global notes', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    // Fixture has global note and venture note
    const filterTestResponse = {
      ...mockSosResponse,
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
        json: async () => filterTestResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    // Current-venture (vc) note should be included
    expect(result.message).toContain('VC Note Second In Array')
    expect(result.message).toContain('Venture-specific content.')
    // Global note should NOT be in the inline enterprise context
    expect(result.message).not.toContain('Global Note First In Array')
    // Should have pointer to other ventures
    expect(result.message).toContain('Other ventures')
  })

  it('treats in_progress handoff as stale when newer done handoff exists', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const now = new Date()
    const newerTime = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString() // 1h ago
    const olderTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() // 2h ago

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
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
              created_at: newerTime,
            },
            {
              id: 'h2',
              session_id: 'sess_2',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-m16',
              summary: 'Design work in progress',
              status_label: 'in_progress',
              created_at: olderTime,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('## Continuity')
    // Stale in_progress should NOT show as Resume - a newer done handoff supersedes it
    expect(result.message).not.toContain('### Resume: in_progress')
    // Both handoffs should appear in the one-liner list
    expect(result.message).toContain('Fixed the handoff system')
    expect(result.recent_handoffs).toHaveLength(2)
  })

  it('shows Resume block when in_progress handoff is newer than all done handoffs', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const now = new Date()
    const newerTime = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString() // 1h ago
    const olderTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() // 2h ago

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
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
              from_agent: 'agent-m16',
              summary: 'Design work in progress',
              status_label: 'in_progress',
              created_at: newerTime,
            },
            {
              id: 'h2',
              session_id: 'sess_2',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-mac23',
              summary: 'Fixed the handoff system',
              status_label: 'done',
              created_at: olderTime,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('## Continuity')
    // Fresh in_progress should show as Resume
    expect(result.message).toContain('### Resume: in_progress')
    expect(result.message).toContain('Design work in progress')
    // done handoff renders as truncated one-liner
    expect(result.message).toContain('Other recent handoffs:')
    expect(result.message).toContain('Fixed the handoff system')
    expect(result.recent_handoffs).toHaveLength(2)
  })

  it('falls back to last_handoff when queryHandoffs fails', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    // Should fall back to the single last_handoff in inline format
    expect(result.message).toContain('Last handoff from claude')
    expect(result.message).toContain('Completed task implementation')
    expect(result.recent_handoffs).toBeUndefined()
  })

  it('shows older handoffs without 24h cutoff filter', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48h ago

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
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

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    // No 24h cutoff - older handoffs should appear in recent list
    expect(result.message).toContain('1 recent handoff(s)')
    expect(result.message).toContain('Old handoff')
  })

  it('stores session state after successful start', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')
    const { setSession } = await import('../lib/session-state.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    await executeSos({})

    expect(setSession).toHaveBeenCalledWith('sess_test123', 'vc', 'venturecrane/crane-console')
  })

  it('shows schedule briefing cadence table when items are due', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      // handoffs query - let it fail silently
      .mockRejectedValueOnce(new Error('no mock'))
      // schedule briefing
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              name: 'code-review-ke',
              title: 'Code Review (ke)',
              cadence_days: 30,
              scope: 'ke',
              priority: 2,
              status: 'due',
              days_since: 31,
              last_completed_at: null,
              last_completed_by: null,
              last_result: null,
              last_result_summary: null,
              description: null,
            },
            {
              name: 'fleet-health',
              title: 'Fleet Health Check',
              cadence_days: 7,
              scope: 'global',
              priority: 2,
              status: 'overdue',
              days_since: 17,
              last_completed_at: null,
              last_completed_by: null,
              last_result: null,
              last_result_summary: null,
              description: null,
            },
          ],
          overdue_count: 1,
          due_count: 1,
          untracked_count: 0,
        }),
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.schedule_briefing).toBeDefined()
    expect(result.schedule_briefing).toHaveLength(2)
    expect(result.message).toContain('Cadence')
    expect(result.message).toContain('Code Review (ke)')
    expect(result.message).toContain('Fleet Health Check')
    expect(result.message).toContain('DUE')
    expect(result.message).toContain('OVERDUE')
    expect(result.message).toContain('1 overdue')
    expect(result.message).toContain('1 due')
  })

  it('degrades gracefully when schedule briefing fails', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      // handoffs + schedule briefing both fail
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.schedule_briefing).toBeUndefined()
    // SOD still works, no Cadence section
    expect(result.message).not.toContain('Cadence')
  })

  it('omits cadence section when all items are current', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      .mockRejectedValueOnce(new Error('no mock'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          overdue_count: 0,
          due_count: 0,
          untracked_count: 0,
        }),
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.schedule_briefing).toBeUndefined()
    expect(result.message).not.toContain('Cadence')
  })

  it('omits doc index regardless of doc count (available via crane_doc_audit)', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponseWithLargeDocIndex,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    // Doc index is no longer rendered inline
    expect(result.message).not.toContain('Available Documentation')
    expect(result.message).not.toContain('doc-01.md')
    // Footer still points to crane_doc_audit
    expect(result.message).toContain('crane_doc_audit()')
  })

  it('includes directives section with repo name', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('## Directives')
    expect(result.message).toContain('All changes through PRs')
    expect(result.message).toContain('venturecrane/crane-console')
    expect(result.message).toContain('Never remove, deprecate, or disable')
    expect(result.message).toContain('npm run verify')
    expect(result.message).toContain('Scope discipline')
  })

  it('ends with explicit STOP directive to re-anchor non-Claude agents', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    // STOP directive must be the final line so it can't be missed by an agent
    // that scans only the tail of the response.
    expect(result.message).toContain('**STOP.')
    expect(result.message).toContain('Do not start any work')
    expect(result.message?.trimEnd().endsWith('user responds with their focus.**')).toBe(true)
  })

  it('omits Alerts section when no P0 issues and no active sessions', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).not.toContain('## Alerts')
  })

  it('shows GH_TOKEN warning when env var is missing', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    // Ensure GH_TOKEN is not set
    delete process.env.GH_TOKEN

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('GH_TOKEN not set')
  })

  it('does not show GH_TOKEN warning when env var is set', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    process.env.GH_TOKEN = 'test-token'

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).not.toContain('GH_TOKEN not set')
  })

  it('preserves knowledge base index in output', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const kbResponse = {
      ...mockSosResponse,
      knowledge_base: {
        notes: [
          {
            id: 'note_kb1',
            title: 'Design Patterns',
            tags: '["methodology"]',
            venture: 'vc',
            updated_at: '2026-02-10T00:00:00Z',
          },
        ],
        count: 1,
      },
    }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => kbResponse,
      })

    const result = await executeSos({})

    expect(result.status).toBe('valid')
    expect(result.message).toContain('## Knowledge Base')
    expect(result.message).toContain('note(s)')
    expect(result.message).toContain('crane_notes()')
    expect(result.message).toContain('crane_notes(q: "...")')
  })

  it('preserves SosResult backward compatibility (all legacy fields)', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

    const result = await executeSos({})

    // Core structured fields must be populated
    expect(result.status).toBe('valid')
    expect(result.current_dir).toBeDefined()
    expect(result.context).toBeDefined()
    expect(result.p0_issues).toBeDefined()
    expect(result.active_sessions).toBeDefined()
    expect(result.message).toBeDefined()
    expect(typeof result.message).toBe('string')
  })

  it('shows full summary in Resume block for in_progress handoff', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const now = new Date()
    const recentTime = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()
    const multiLineSummary =
      '## In Progress\n- Function retryWithBackoff() partially implemented in src/lib/api.ts\n\n## Next Session\n1. Complete retry logic\n2. Run npm test'

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          handoffs: [
            {
              id: 'h_active',
              session_id: 'sess_active',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-mac23',
              summary: multiLineSummary,
              status_label: 'in_progress',
              created_at: recentTime,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSos({})

    expect(result.message).toContain('### Resume: in_progress')
    expect(result.message).toContain('From agent-mac23')
    // Full multi-line summary should be shown, not truncated
    expect(result.message).toContain('Function retryWithBackoff()')
    expect(result.message).toContain('Complete retry logic')
    expect(result.message).toContain('Run npm test')
  })

  it('truncates Resume block at 1KB budget', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const now = new Date()
    const recentTime = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()
    const longSummary = 'A'.repeat(2000)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          handoffs: [
            {
              id: 'h_long',
              session_id: 'sess_long',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-mac23',
              summary: longSummary,
              status_label: 'in_progress',
              created_at: recentTime,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSos({})

    expect(result.message).toContain('### Resume: in_progress')
    expect(result.message).toContain('Truncated')
    expect(result.message).toContain('crane_sos')
    // Should not contain the full 2000-char string
    expect(result.message).not.toContain(longSummary)
  })

  it('renders done-only handoffs without Resume block', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const now = new Date()
    const recentTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          handoffs: [
            {
              id: 'h_done1',
              session_id: 'sess_done1',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-mac23',
              summary: 'Completed feature X',
              status_label: 'done',
              created_at: recentTime,
            },
            {
              id: 'h_done2',
              session_id: 'sess_done2',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-m16',
              summary: 'Finished docs update',
              status_label: 'done',
              created_at: recentTime,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSos({})

    expect(result.message).toContain('## Continuity')
    expect(result.message).toContain('2 recent handoff(s)')
    expect(result.message).not.toContain('### Resume')
    expect(result.message).toContain('Completed feature X')
    expect(result.message).toContain('Finished docs update')
  })

  it('shows callouts for multiple in_progress handoffs', async () => {
    const { executeSos } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')
    const { getP0Issues } = await import('../lib/github.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])
    vi.mocked(getP0Issues).mockReturnValue({ success: true, issues: [] })

    const now = new Date()
    const time1 = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()
    const time2 = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          handoffs: [
            {
              id: 'h_ip1',
              session_id: 'sess_ip1',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-mac23',
              summary: 'Working on retry logic',
              status_label: 'in_progress',
              created_at: time1,
            },
            {
              id: 'h_ip2',
              session_id: 'sess_ip2',
              venture: 'vc',
              repo: 'venturecrane/crane-console',
              from_agent: 'agent-m16',
              summary: 'OAuth migration halfway done',
              status_label: 'in_progress',
              issue_number: 200,
              created_at: time2,
            },
          ],
          has_more: false,
        }),
      })

    const result = await executeSos({})

    // First in_progress gets full Resume block
    expect(result.message).toContain('### Resume: in_progress')
    expect(result.message).toContain('Working on retry logic')
    // Second in_progress gets one-liner callout
    expect(result.message).toContain('Also in_progress: agent-m16')
    expect(result.message).toContain('on issue #200')
  })
})

// ============================================================================
// Pure helper tests — calendar-day diff (Plan §B.5 — defect #11)
// ============================================================================

describe('calendarDaysSince', () => {
  it('returns 0 for two timestamps in the same MST day', async () => {
    const { calendarDaysSince } = await getModule()
    const morning = new Date('2026-04-07T10:00:00-07:00') // 10am MST
    const evening = new Date('2026-04-07T22:00:00-07:00') // 10pm MST same day
    expect(calendarDaysSince(morning, evening)).toBe(0)
  })

  it('returns 1 when crossing MST midnight even with < 24h elapsed', async () => {
    const { calendarDaysSince } = await getModule()
    const lateNight = new Date('2026-04-07T22:00:00-07:00') // 10pm Apr 7 MST
    const earlyMorning = new Date('2026-04-08T08:00:00-07:00') // 8am Apr 8 MST
    expect(calendarDaysSince(lateNight, earlyMorning)).toBe(1)
  })

  it('returns 7 for one full week', async () => {
    const { calendarDaysSince } = await getModule()
    const start = new Date('2026-04-01T12:00:00-07:00')
    const end = new Date('2026-04-08T12:00:00-07:00')
    expect(calendarDaysSince(start, end)).toBe(7)
  })

  it('clamps to 0 for future dates (never negative)', async () => {
    const { calendarDaysSince } = await getModule()
    const future = new Date('2027-01-01T00:00:00-07:00')
    const now = new Date('2026-04-07T00:00:00-07:00')
    expect(calendarDaysSince(future, now)).toBe(0)
  })
})

describe('formatAgeDays', () => {
  it('renders 0 days as "today" (never "0 days old")', async () => {
    const { formatAgeDays } = await getModule()
    expect(formatAgeDays(0)).toBe('today')
  })

  it('renders 1 day as "1 day old" (singular)', async () => {
    const { formatAgeDays } = await getModule()
    expect(formatAgeDays(1)).toBe('1 day old')
  })

  it('renders N days as "N days old" (plural)', async () => {
    const { formatAgeDays } = await getModule()
    expect(formatAgeDays(7)).toBe('7 days old')
    expect(formatAgeDays(30)).toBe('30 days old')
  })
})

// ============================================================================
// Cadence aggregate contract (Plan §B.5 — defect #9)
// ============================================================================
//
// The cadence display section MUST trust the server-computed
// `overdue_count` / `due_count` / `untracked_count` aggregates and MUST
// NOT recompute them from the items array. Recomputing creates a second
// source of truth that can disagree with the server, which is exactly
// the kind of "lie by omission" the truthfulness contract bans.
//
// This is a regression guard — if anyone reintroduces a
// `scheduleBriefing.items.filter(...).length` recomputation, this test
// will fail. The check is a string scan of the compiled SOS source.

describe('cadence contract (defect #9)', () => {
  it('source has no client-side aggregate recomputation', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const sosSource = fs.readFileSync(path.join(__dirname, 'sos.ts'), 'utf-8') as string
    // Extract just the body of buildSosMessage. We don't want to flag
    // generic .filter() calls elsewhere in the file.
    const lines = sosSource.split('\n')
    const cadenceStart = lines.findIndex((l) => l.includes('--- Cadence'))
    const cadenceEnd = lines.findIndex(
      (l, i) => i > cadenceStart && l.includes('--- ') && !l.includes('--- Cadence')
    )
    const cadenceSection = lines.slice(cadenceStart, cadenceEnd).join('\n')

    // The cadence section uses the server's overdue_count/due_count fields
    // directly. It should NOT contain `.filter(... => i.status === 'overdue').length`
    // or similar recomputation patterns.
    expect(cadenceSection).not.toMatch(
      /\.filter\([^)]*status\s*===\s*['"]overdue['"][^)]*\)\.length/
    )
    expect(cadenceSection).not.toMatch(/\.filter\([^)]*status\s*===\s*['"]due['"][^)]*\)\.length/)

    // Conversely it MUST reference the server-computed fields.
    expect(cadenceSection).toContain('scheduleBriefing.overdue_count')
    expect(cadenceSection).toContain('scheduleBriefing.due_count')
  })
})
