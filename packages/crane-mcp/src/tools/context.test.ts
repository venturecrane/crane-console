/**
 * Tests for context.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockVentures } from '../__fixtures__/api-responses.js'
import { mockRepoInfo } from '../__fixtures__/repo-fixtures.js'

vi.mock('../lib/repo-scanner.js')

const getModule = async () => {
  vi.resetModules()
  return import('./context.js')
}

describe('context tool', () => {
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

  it('returns current context when in valid repo', async () => {
    const { executeContext } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0]) // vc

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeContext({})

    expect(result.valid).toBe(true)
    expect(result.venture).toBe('vc')
    expect(result.venture_name).toBe('Venture Crane')
    expect(result.git_repo).toBe('venturecrane/crane-console')
    expect(result.git_branch).toBe('main')
  })

  it('returns error when not in git repo', async () => {
    const { executeContext } = await getModule()
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)

    const result = await executeContext({})

    expect(result.valid).toBe(false)
    expect(result.message).toContain('Not in a git repository')
  })

  it('returns error for unknown org', async () => {
    const { executeContext } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue({
      org: 'unknownorg',
      repo: 'some-repo',
      branch: 'main',
    })
    vi.mocked(findVentureByRepo).mockReturnValue(null)

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeContext({})

    expect(result.valid).toBe(false)
    expect(result.message).toContain('Unknown org')
  })

  it('includes branch information', async () => {
    const { executeContext } = await getModule()
    const { getCurrentRepoInfo, findVentureByRepo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue({
      org: 'venturecrane',
      repo: 'crane-console',
      branch: 'feature/new-feature',
    })
    vi.mocked(findVentureByRepo).mockReturnValue(mockVentures[0])

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    const result = await executeContext({})

    expect(result.git_branch).toBe('feature/new-feature')
    expect(result.message).toContain('feature/new-feature')
  })

  it('returns invalid when API key missing', async () => {
    const { executeContext } = await getModule()
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    delete process.env.CRANE_CONTEXT_KEY
    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)

    const result = await executeContext({})

    expect(result.valid).toBe(false)
    expect(result.api_key_present).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not set')
  })
})
