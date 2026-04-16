/**
 * Tests for skill-invoke.ts tools (crane_skill_invoked / crane_skill_usage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getModule = async () => {
  vi.resetModules()
  return import('./skill-invoke.js')
}

// ============================================================================
// crane_skill_invoked
// ============================================================================

describe('crane_skill_invoked tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CRANE_CONTEXT_KEY: 'test-key',
      CRANE_VENTURE_CODE: 'vc',
      CRANE_REPO: 'venturecrane/crane-console',
    }
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('records a skill invocation and returns the invocation id', async () => {
    const { executeSkillInvoke } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invocation: {
          id: 'inv_01ABC',
          skill_name: 'sos',
          status: 'started',
          created_at: '2026-04-15T00:00:00.000Z',
        },
        correlation_id: 'corr_abc',
      }),
    })

    const result = await executeSkillInvoke({ skill_name: 'sos' })

    expect(result.success).toBe(true)
    expect(result.invocation_id).toBe('inv_01ABC')
    expect(result.message).toContain('inv_01ABC')
  })

  it('auto-fills venture and repo from env', async () => {
    const { executeSkillInvoke } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invocation: {
          id: 'inv_01DEF',
          skill_name: 'eos',
          status: 'completed',
          created_at: '2026-04-15T00:00:00.000Z',
        },
        correlation_id: 'corr_def',
      }),
    })

    await executeSkillInvoke({ skill_name: 'eos', status: 'completed', duration_ms: 1200 })

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(fetchInit.body as string) as Record<string, unknown>

    expect(body.venture).toBe('vc')
    expect(body.repo).toBe('venturecrane/crane-console')
    expect(body.status).toBe('completed')
    expect(body.duration_ms).toBe(1200)
  })

  it('returns success=false (not throw) when API key is missing', async () => {
    const { executeSkillInvoke } = await getModule()

    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeSkillInvoke({ skill_name: 'commit' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not set')
    // fetch must NOT have been called
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns success=false (not throw) on HTTP error', async () => {
    const { executeSkillInvoke } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    })

    const result = await executeSkillInvoke({ skill_name: 'sos' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Warning')
    // Never throws
  })

  it('returns success=false (not throw) on network failure', async () => {
    const { executeSkillInvoke } = await getModule()

    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))

    const result = await executeSkillInvoke({ skill_name: 'sos' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Warning')
    // Never throws
  })

  it('passes error_message on failed status', async () => {
    const { executeSkillInvoke } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invocation: {
          id: 'inv_01GHI',
          skill_name: 'ship',
          status: 'failed',
          created_at: '2026-04-15T00:00:00.000Z',
        },
        correlation_id: 'corr_ghi',
      }),
    })

    await executeSkillInvoke({
      skill_name: 'ship',
      status: 'failed',
      error_message: 'CI did not pass',
    })

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(fetchInit.body as string) as Record<string, unknown>

    expect(body.status).toBe('failed')
    expect(body.error_message).toBe('CI did not pass')
  })
})

// ============================================================================
// crane_skill_usage
// ============================================================================

describe('crane_skill_usage tool', () => {
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

  it('returns formatted markdown with usage stats', async () => {
    const { executeSkillUsage } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        since: '2026-03-16T00:00:00.000Z',
        stats: [
          { skill_name: 'sos', invocation_count: 42, last_invoked_at: '2026-04-14T10:00:00.000Z' },
          { skill_name: 'eos', invocation_count: 38, last_invoked_at: '2026-04-14T18:00:00.000Z' },
        ],
        correlation_id: 'corr_abc',
      }),
    })

    const result = await executeSkillUsage({})

    expect(result.success).toBe(true)
    expect(result.message).toContain('sos')
    expect(result.message).toContain('42')
    expect(result.message).toContain('eos')
    expect(result.message).toContain('38')
  })

  it('returns empty message when no invocations recorded', async () => {
    const { executeSkillUsage } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        since: '2026-03-16T00:00:00.000Z',
        stats: [],
        correlation_id: 'corr_empty',
      }),
    })

    const result = await executeSkillUsage({})

    expect(result.success).toBe(true)
    expect(result.message).toContain('No skill invocations')
  })

  it('filters by skill_name when provided', async () => {
    const { executeSkillUsage } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        since: '2026-03-16T00:00:00.000Z',
        stats: [
          { skill_name: 'sos', invocation_count: 42, last_invoked_at: '2026-04-14T10:00:00.000Z' },
        ],
        correlation_id: 'corr_filter',
      }),
    })

    await executeSkillUsage({ skill_name: 'sos' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('skill_name=sos')
  })

  it('passes since param to the API', async () => {
    const { executeSkillUsage } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        since: '2026-01-15T00:00:00.000Z',
        stats: [],
        correlation_id: 'corr_since',
      }),
    })

    await executeSkillUsage({ since: '90d' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('since=90d')
  })

  it('returns error when API key is missing', async () => {
    const { executeSkillUsage } = await getModule()

    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeSkillUsage({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not found')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns error on API failure', async () => {
    const { executeSkillUsage } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await executeSkillUsage({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to query skill usage')
  })
})
