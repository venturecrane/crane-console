/**
 * Tests for status.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockRepoInfo } from '../__fixtures__/repo-fixtures.js'
import { mockIssueBreakdown, mockEmptyIssueBreakdown } from '../__fixtures__/github-responses.js'

vi.mock('../lib/github.js')
vi.mock('../lib/repo-scanner.js')

const getModule = async () => {
  vi.resetModules()
  return import('./status.js')
}

describe('status tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns all 5 issue queues', async () => {
    const { executeStatus } = await getModule()
    const { getIssueBreakdown } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(getIssueBreakdown).mockReturnValue({
      success: true,
      breakdown: mockIssueBreakdown,
    })

    const result = await executeStatus({})

    expect(result.success).toBe(true)
    expect(result.issues).toBeDefined()
    expect(result.issues?.p0).toHaveLength(2)
    expect(result.issues?.ready).toHaveLength(2)
    expect(result.issues?.in_progress).toHaveLength(1)
    expect(result.issues?.blocked).toHaveLength(1)
    expect(result.issues?.triage).toHaveLength(2)
  })

  it('formats issues correctly in message', async () => {
    const { executeStatus } = await getModule()
    const { getIssueBreakdown } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(getIssueBreakdown).mockReturnValue({
      success: true,
      breakdown: mockIssueBreakdown,
    })

    const result = await executeStatus({})

    expect(result.message).toContain('P0 Issues')
    expect(result.message).toContain('#1')
    expect(result.message).toContain('Critical: Production outage')
    expect(result.message).toContain('Ready for Development')
    expect(result.message).toContain('In Progress')
    expect(result.message).toContain('Blocked')
    expect(result.message).toContain('Triage Queue')
  })

  it('handles empty queues', async () => {
    const { executeStatus } = await getModule()
    const { getIssueBreakdown } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(getIssueBreakdown).mockReturnValue({
      success: true,
      breakdown: mockEmptyIssueBreakdown,
    })

    const result = await executeStatus({})

    expect(result.success).toBe(true)
    expect(result.message).toContain('no fires today')
    expect(result.message).toContain('Nothing blocked')
  })

  it('handles GitHub API errors', async () => {
    const { executeStatus } = await getModule()
    const { getIssueBreakdown } = await import('../lib/github.js')
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo)
    vi.mocked(getIssueBreakdown).mockReturnValue({
      success: false,
      error: 'API rate limit exceeded',
    })

    const result = await executeStatus({})

    expect(result.success).toBe(false)
    expect(result.error).toContain('API rate limit')
    expect(result.message).toContain('Error')
  })

  it('returns error when not in git repo', async () => {
    const { executeStatus } = await getModule()
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)

    const result = await executeStatus({})

    expect(result.success).toBe(false)
    expect(result.error).toContain('Not in a git repository')
  })
})
