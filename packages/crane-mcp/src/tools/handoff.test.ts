/**
 * Tests for handoff.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockVentures } from '../__fixtures__/api-responses.js'
import { mockRepoInfo } from '../__fixtures__/repo-fixtures.js'

vi.mock('../lib/repo-scanner.js')
vi.mock('../lib/session-state.js')

const getModule = async () => {
  vi.resetModules()
  return import('./handoff.js')
}

describe('handoff tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' }

    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates handoff with valid input and session', async () => {
    const { executeHandoff } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue({
      sessionId: 'sess_test123',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])

    // Mock fetch for getVentures and createHandoff
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

    const result = await executeHandoff({
      summary: 'Completed feature implementation',
      status: 'done',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('Handoff created')
    expect(result.message).toContain('sess_test123')
  })

  it('passes session_id in API request body', async () => {
    const { executeHandoff } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue({
      sessionId: 'sess_abc',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

    await executeHandoff({
      summary: 'Test',
      status: 'done',
    })

    // Verify all required fields were passed to the /eod endpoint
    const eodCall = mockFetch.mock.calls[1]
    const body = JSON.parse(eodCall[1].body)
    expect(body.schema_version).toBe('1.0')
    expect(body.session_id).toBe('sess_abc')
    expect(body.venture).toBe('vc')
    expect(body.repo).toBe('venturecrane/crane-console')
    expect(body.agent).toMatch(/^crane-mcp-/)
    expect(body.summary).toBe('Test')
    expect(body.status_label).toBe('done')
    expect(body.payload).toEqual({})
  })

  it('returns error when no session active', async () => {
    const { executeHandoff } = await getModule()
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue(null)

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('No active session')
    expect(result.message).toContain('crane_sod')
  })

  it('returns error when API key missing', async () => {
    const { executeHandoff } = await getModule()

    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not found')
  })

  it('returns error when not in git repo', async () => {
    const { executeHandoff } = await getModule()
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue({
      sessionId: 'sess_test',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Not in a git repository')
  })

  it('returns error on repo mismatch', async () => {
    const { executeHandoff } = await getModule()
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue({
      sessionId: 'sess_test',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue({
      org: 'kidexpenses',
      repo: 'ke-console',
      branch: 'main',
    })

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Repo mismatch')
    expect(result.message).toContain('venturecrane/crane-console')
    expect(result.message).toContain('kidexpenses/ke-console')
  })

  it('includes issue number when provided', async () => {
    const { executeHandoff } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue({
      sessionId: 'sess_test',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

    const result = await executeHandoff({
      summary: 'Working on issue',
      status: 'in_progress',
      issue_number: 42,
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('#42')

    // Verify issue_number was passed to API
    const eodCall = mockFetch.mock.calls[1]
    const body = JSON.parse(eodCall[1].body)
    expect(body.issue_number).toBe(42)
  })

  it('handles API errors with detail', async () => {
    const { executeHandoff } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue({
      sessionId: 'sess_test',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0])

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      })

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to create handoff')
    expect(result.message).toContain('500')
  })

  it('returns error for unknown org', async () => {
    const { executeHandoff } = await getModule()
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js')
    const { getSessionContext } = await import('../lib/session-state.js')

    vi.mocked(getSessionContext).mockReturnValue({
      sessionId: 'sess_test',
      venture: 'vc',
      repo: 'unknownorg/some-repo',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue({
      org: 'unknownorg',
      repo: 'some-repo',
      branch: 'main',
    })
    vi.mocked(findVentureByOrg).mockReturnValue(null)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Unknown org')
  })
})
