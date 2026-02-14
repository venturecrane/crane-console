/**
 * Tests for preflight.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockRepoInfo } from '../__fixtures__/repo-fixtures.js'

// Mock dependencies
vi.mock('../lib/github.js')
vi.mock('../lib/repo-scanner.js')

const getModule = async () => {
  vi.resetModules()
  return import('./preflight.js')
}

describe('preflight tool', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns pass when all checks succeed', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    process.env.CRANE_CONTEXT_KEY = 'test-key'
    vi.mocked(checkGhAuth).mockReturnValue({ installed: true, authenticated: true })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    mockFetch.mockResolvedValue({ ok: true })

    const result = await executePreflight({})

    expect(result.all_passed).toBe(true)
    expect(result.has_critical_failure).toBe(false)
    expect(result.checks).toHaveLength(4)
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true)
  })

  it('fails when CRANE_CONTEXT_KEY missing', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    delete process.env.CRANE_CONTEXT_KEY
    vi.mocked(checkGhAuth).mockReturnValue({ installed: true, authenticated: true })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    mockFetch.mockResolvedValue({ ok: true })

    const result = await executePreflight({})

    expect(result.all_passed).toBe(false)
    expect(result.has_critical_failure).toBe(true)
    const keyCheck = result.checks.find((c) => c.name === 'CRANE_CONTEXT_KEY')
    expect(keyCheck?.status).toBe('fail')
  })

  it('fails when gh not authenticated', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    process.env.CRANE_CONTEXT_KEY = 'test-key'
    vi.mocked(checkGhAuth).mockReturnValue({
      installed: true,
      authenticated: false,
      error: 'gh CLI not authenticated',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    mockFetch.mockResolvedValue({ ok: true })

    const result = await executePreflight({})

    expect(result.all_passed).toBe(false)
    const ghCheck = result.checks.find((c) => c.name === 'GitHub CLI')
    expect(ghCheck?.status).toBe('fail')
    expect(ghCheck?.message).toContain('not authenticated')
  })

  it('warns when not in git repo', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    process.env.CRANE_CONTEXT_KEY = 'test-key'
    vi.mocked(checkGhAuth).mockReturnValue({ installed: true, authenticated: true })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)
    mockFetch.mockResolvedValue({ ok: true })

    const result = await executePreflight({})

    // Git repo check is a warning, not critical failure
    const repoCheck = result.checks.find((c) => c.name === 'Git repository')
    expect(repoCheck?.status).toBe('warn')
  })

  it('fails when API unreachable', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    process.env.CRANE_CONTEXT_KEY = 'test-key'
    vi.mocked(checkGhAuth).mockReturnValue({ installed: true, authenticated: true })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    mockFetch.mockRejectedValue(new Error('Network error'))

    const result = await executePreflight({})

    expect(result.all_passed).toBe(false)
    expect(result.has_critical_failure).toBe(true)
    const apiCheck = result.checks.find((c) => c.name === 'Crane Context API')
    expect(apiCheck?.status).toBe('fail')
  })

  it('shows staging environment when CRANE_ENV=dev', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    process.env.CRANE_CONTEXT_KEY = 'test-key'
    process.env.CRANE_ENV = 'dev'
    vi.mocked(checkGhAuth).mockReturnValue({ installed: true, authenticated: true })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    mockFetch.mockResolvedValue({ ok: true })

    const result = await executePreflight({})

    const apiCheck = result.checks.find((c) => c.name === 'Crane Context API')
    expect(apiCheck?.message).toContain('staging')
  })

  it('shows production environment by default', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    delete process.env.CRANE_ENV
    process.env.CRANE_CONTEXT_KEY = 'test-key'
    vi.mocked(checkGhAuth).mockReturnValue({ installed: true, authenticated: true })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    mockFetch.mockResolvedValue({ ok: true })

    const result = await executePreflight({})

    const apiCheck = result.checks.find((c) => c.name === 'Crane Context API')
    expect(apiCheck?.message).toContain('production')
  })

  it('reports multiple failures', async () => {
    const { executePreflight } = await getModule()
    const { checkGhAuth } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    delete process.env.CRANE_CONTEXT_KEY
    vi.mocked(checkGhAuth).mockReturnValue({
      installed: false,
      authenticated: false,
      error: 'gh CLI not installed',
    })
    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)
    mockFetch.mockRejectedValue(new Error('Network error'))

    const result = await executePreflight({})

    expect(result.all_passed).toBe(false)
    expect(result.has_critical_failure).toBe(true)
    const failures = result.checks.filter((c) => c.status === 'fail')
    expect(failures.length).toBeGreaterThanOrEqual(3)
  })
})
