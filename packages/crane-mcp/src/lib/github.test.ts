/**
 * Tests for github.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'
import {
  mockP0Issues,
  mockReadyIssues,
  mockGhApiSearchOutput,
  mockIssueBreakdown,
} from '../__fixtures__/github-responses.js'

vi.mock('child_process')

// Reset modules to get fresh import for each test
const getModule = async () => {
  vi.resetModules()
  return import('./github.js')
}

describe('github', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('checkGhAuth', () => {
    it('returns true when authenticated', async () => {
      const { checkGhAuth } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('which gh')) return '/usr/local/bin/gh'
        if (cmdStr.includes('gh auth status')) return 'Logged in to github.com'
        return ''
      })

      const result = checkGhAuth()

      expect(result.installed).toBe(true)
      expect(result.authenticated).toBe(true)
    })

    it('returns false when not authenticated', async () => {
      const { checkGhAuth } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('which gh')) return '/usr/local/bin/gh'
        if (cmdStr.includes('gh auth status')) {
          throw new Error('You are not logged into any GitHub hosts')
        }
        return ''
      })

      const result = checkGhAuth()

      expect(result.installed).toBe(true)
      expect(result.authenticated).toBe(false)
      expect(result.error).toBe('gh CLI not authenticated')
    })

    it('returns false when gh not installed', async () => {
      const { checkGhAuth } = await getModule()

      vi.mocked(execSync).mockImplementation(() => {
        const error = new Error('command not found: gh') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      })

      const result = checkGhAuth()

      expect(result.installed).toBe(false)
      expect(result.authenticated).toBe(false)
      expect(result.error).toBe('gh CLI not installed')
    })
  })

  describe('getIssuesByLabel', () => {
    it('constructs correct query and parses response', async () => {
      const { getIssuesByLabel } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('which gh')) return '/usr/local/bin/gh'
        if (cmdStr.includes('gh auth status')) return 'Logged in'
        if (cmdStr.includes('gh api')) {
          // Verify the query includes the correct labels
          expect(cmdStr).toContain('repo:venturecrane/crane-console')
          expect(cmdStr).toContain('label:prio:P0')
          return mockGhApiSearchOutput(mockP0Issues)
        }
        return ''
      })

      const result = getIssuesByLabel('venturecrane', 'crane-console', ['prio:P0'])

      expect(result.success).toBe(true)
      expect(result.issues).toHaveLength(2)
      expect(result.issues?.[0].number).toBe(1)
    })

    it('returns error when not authenticated', async () => {
      const { getIssuesByLabel } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('which gh')) return '/usr/local/bin/gh'
        if (cmdStr.includes('gh auth status')) {
          throw new Error('Not authenticated')
        }
        return ''
      })

      const result = getIssuesByLabel('venturecrane', 'crane-console', ['prio:P0'])

      expect(result.success).toBe(false)
      expect(result.error).toContain('not authenticated')
    })
  })

  describe('getP0Issues', () => {
    it('filters by prio:P0 label', async () => {
      const { getP0Issues } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('which gh')) return '/usr/local/bin/gh'
        if (cmdStr.includes('gh auth status')) return 'Logged in'
        if (cmdStr.includes('gh api')) {
          expect(cmdStr).toContain('label:prio:P0')
          return mockGhApiSearchOutput(mockP0Issues)
        }
        return ''
      })

      const result = getP0Issues('venturecrane', 'crane-console')

      expect(result.success).toBe(true)
      expect(result.issues).toHaveLength(2)
    })
  })

  describe('getIssueBreakdown', () => {
    it('fetches all 5 queues', async () => {
      const { getIssueBreakdown } = await getModule()

      let apiCallCount = 0
      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('which gh')) return '/usr/local/bin/gh'
        if (cmdStr.includes('gh auth status')) return 'Logged in'
        if (cmdStr.includes('gh api')) {
          apiCallCount++
          if (cmdStr.includes('prio:P0')) return mockGhApiSearchOutput(mockIssueBreakdown.p0)
          if (cmdStr.includes('status:ready'))
            return mockGhApiSearchOutput(mockIssueBreakdown.ready)
          if (cmdStr.includes('status:in-progress'))
            return mockGhApiSearchOutput(mockIssueBreakdown.in_progress)
          if (cmdStr.includes('status:blocked'))
            return mockGhApiSearchOutput(mockIssueBreakdown.blocked)
          if (cmdStr.includes('status:triage'))
            return mockGhApiSearchOutput(mockIssueBreakdown.triage)
          return '[]'
        }
        return ''
      })

      const result = getIssueBreakdown('venturecrane', 'crane-console')

      expect(result.success).toBe(true)
      expect(apiCallCount).toBe(5)
      expect(result.breakdown?.p0).toHaveLength(2)
      expect(result.breakdown?.ready).toHaveLength(2)
      expect(result.breakdown?.in_progress).toHaveLength(1)
      expect(result.breakdown?.blocked).toHaveLength(1)
      expect(result.breakdown?.triage).toHaveLength(2)
    })

    it('handles GitHub API errors', async () => {
      const { getIssueBreakdown } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('which gh')) return '/usr/local/bin/gh'
        if (cmdStr.includes('gh auth status')) return 'Logged in'
        if (cmdStr.includes('gh api')) {
          throw new Error('API rate limit exceeded')
        }
        return ''
      })

      const result = getIssueBreakdown('venturecrane', 'crane-console')

      expect(result.success).toBe(false)
      expect(result.error).toContain('GitHub API error')
    })
  })
})
