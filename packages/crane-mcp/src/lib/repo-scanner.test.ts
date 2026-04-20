/**
 * Tests for repo-scanner.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'
import { readdirSync, statSync, existsSync } from 'fs'
import { homedir } from 'os'
import {
  mockLocalRepos,
  mockRepoInfo,
  mockRepoInfoFeatureBranch,
  mockRemoteUrls,
  mockDevDirEntries,
} from '../__fixtures__/repo-fixtures.js'
import { mockVentures } from '../__fixtures__/api-responses.js'

// Mock external modules
vi.mock('child_process')
vi.mock('fs')
vi.mock('os')

// We need to reset modules to clear the cache between tests
const getModule = async () => {
  vi.resetModules()
  return import('./repo-scanner.js')
}

describe('repo-scanner', () => {
  beforeEach(() => {
    vi.mocked(homedir).mockReturnValue('/Users/testuser')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('scanLocalRepos', () => {
    it('finds git directories in ~/dev', async () => {
      const { scanLocalRepos } = await getModule()

      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path)
        if (pathStr === '/Users/testuser/dev') return true
        if (pathStr.endsWith('.git')) return true
        return false
      })

      vi.mocked(readdirSync).mockReturnValue(
        mockDevDirEntries as unknown as ReturnType<typeof readdirSync>
      )

      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof statSync>)

      vi.mocked(execSync).mockImplementation((cmd, opts) => {
        const cwd = (opts as { cwd?: string })?.cwd || ''
        if (cwd.includes('crane-console')) return mockRemoteUrls.ssh
        if (cwd.includes('ke-console')) return mockRemoteUrls.httpsKe
        if (cwd.includes('sc-app')) return mockRemoteUrls.sshSc
        throw new Error('No remote')
      })

      const repos = scanLocalRepos()

      expect(repos.length).toBe(3)
      expect(repos[0].org).toBe('venturecrane')
      expect(repos[0].repoName).toBe('crane-console')
    })

    it('extracts org from HTTPS URL', async () => {
      const { scanLocalRepos } = await getModule()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(['test-repo'] as unknown as ReturnType<
        typeof readdirSync
      >)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof statSync
      >)
      vi.mocked(execSync).mockReturnValue('https://github.com/kidexpenses/ke-console.git')

      const repos = scanLocalRepos()

      expect(repos[0].org).toBe('kidexpenses')
      expect(repos[0].repoName).toBe('ke-console')
    })

    it('extracts org from SSH URL', async () => {
      const { scanLocalRepos } = await getModule()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(['test-repo'] as unknown as ReturnType<
        typeof readdirSync
      >)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof statSync
      >)
      vi.mocked(execSync).mockReturnValue('git@github.com:venturecrane/crane-console.git')

      const repos = scanLocalRepos()

      expect(repos[0].org).toBe('venturecrane')
      expect(repos[0].repoName).toBe('crane-console')
    })

    it('caches results on subsequent calls', async () => {
      const { scanLocalRepos } = await getModule()

      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(['test-repo'] as unknown as ReturnType<
        typeof readdirSync
      >)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof statSync
      >)
      vi.mocked(execSync).mockReturnValue('git@github.com:venturecrane/crane-console.git')

      // First call
      scanLocalRepos()
      // Second call
      scanLocalRepos()

      // readdirSync should only be called once due to caching
      expect(readdirSync).toHaveBeenCalledTimes(1)
    })

    it('returns empty array if ~/dev does not exist', async () => {
      const { scanLocalRepos } = await getModule()

      vi.mocked(existsSync).mockReturnValue(false)

      const repos = scanLocalRepos()

      expect(repos).toEqual([])
    })
  })

  describe('getCurrentRepoInfo', () => {
    it('returns repo details when in a git repo', async () => {
      const { getCurrentRepoInfo } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('remote get-url')) return mockRemoteUrls.ssh
        if (cmdStr.includes('branch --show-current')) return 'main'
        return ''
      })

      const info = getCurrentRepoInfo()

      expect(info).toEqual(mockRepoInfo)
    })

    it('returns null when not in a git repo', async () => {
      const { getCurrentRepoInfo } = await getModule()

      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal: not a git repository')
      })

      const info = getCurrentRepoInfo()

      expect(info).toBeNull()
    })

    it('defaults to main branch on error', async () => {
      const { getCurrentRepoInfo } = await getModule()

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        if (cmdStr.includes('remote get-url')) return mockRemoteUrls.ssh
        if (cmdStr.includes('branch --show-current')) throw new Error('detached HEAD')
        return ''
      })

      const info = getCurrentRepoInfo()

      expect(info?.branch).toBe('main')
    })
  })

  describe('getRepoSyncStatus', () => {
    const mockExec = (responses: Record<string, string | Error>) => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd)
        for (const [key, val] of Object.entries(responses)) {
          if (cmdStr.includes(key)) {
            if (val instanceof Error) throw val
            return val
          }
        }
        return ''
      })
    }

    it('returns current state when clean and up to date', async () => {
      const { getRepoSyncStatus } = await getModule()

      mockExec({
        'branch --show-current': 'main',
        'rev-parse --abbrev-ref @{u}': 'origin/main',
        'rev-list --left-right --count': '0\t0',
        'status --porcelain': '',
        'rev-parse --git-dir': '/tmp/.git',
      })
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(statSync).mockReturnValue({
        mtimeMs: Date.now() - 5000,
      } as ReturnType<typeof statSync>)

      const status = getRepoSyncStatus()

      expect(status).not.toBeNull()
      expect(status?.branch).toBe('main')
      expect(status?.upstream).toBe('origin/main')
      expect(status?.ahead).toBe(0)
      expect(status?.behind).toBe(0)
      expect(status?.dirty).toBe(0)
      expect(status?.lastFetchSecondsAgo).toBeGreaterThanOrEqual(4)
      expect(status?.lastFetchSecondsAgo).toBeLessThanOrEqual(6)
    })

    it('reports ahead/behind counts from rev-list --left-right', async () => {
      const { getRepoSyncStatus } = await getModule()

      mockExec({
        'branch --show-current': 'feature/x',
        'rev-parse --abbrev-ref @{u}': 'origin/feature/x',
        'rev-list --left-right --count': '3\t7',
        'status --porcelain': '',
        'rev-parse --git-dir': '/tmp/.git',
      })
      vi.mocked(existsSync).mockReturnValue(false)

      const status = getRepoSyncStatus()

      expect(status?.ahead).toBe(3)
      expect(status?.behind).toBe(7)
      expect(status?.lastFetchSecondsAgo).toBeNull()
    })

    it('counts dirty files from porcelain status', async () => {
      const { getRepoSyncStatus } = await getModule()

      mockExec({
        'branch --show-current': 'main',
        'rev-parse --abbrev-ref @{u}': 'origin/main',
        'rev-list --left-right --count': '0\t0',
        'status --porcelain': ' M foo.ts\n?? bar.ts\nA  baz.ts',
        'rev-parse --git-dir': '/tmp/.git',
      })
      vi.mocked(existsSync).mockReturnValue(false)

      const status = getRepoSyncStatus()

      expect(status?.dirty).toBe(3)
    })

    it('handles missing upstream gracefully (zero counts, branch only)', async () => {
      const { getRepoSyncStatus } = await getModule()

      mockExec({
        'branch --show-current': 'local-only',
        'rev-parse --abbrev-ref @{u}': new Error('no upstream configured'),
        'status --porcelain': '',
        'rev-parse --git-dir': '/tmp/.git',
      })
      vi.mocked(existsSync).mockReturnValue(false)

      const status = getRepoSyncStatus()

      expect(status?.branch).toBe('local-only')
      expect(status?.upstream).toBeNull()
      expect(status?.ahead).toBe(0)
      expect(status?.behind).toBe(0)
    })

    it('returns null when not in a git repo', async () => {
      const { getRepoSyncStatus } = await getModule()

      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal: not a git repository')
      })

      const status = getRepoSyncStatus()

      expect(status).toBeNull()
    })
  })

  describe('findVentureByRepo', () => {
    it('matches org and repo to venture (case insensitive org)', async () => {
      const { findVentureByRepo } = await getModule()

      const venture = findVentureByRepo(mockVentures, 'VentureCrane', 'crane-console')

      expect(venture).not.toBeNull()
      expect(venture?.code).toBe('vc')
    })

    it('returns null for unknown org', async () => {
      const { findVentureByRepo } = await getModule()

      const venture = findVentureByRepo(mockVentures, 'unknownorg', 'crane-console')

      expect(venture).toBeNull()
    })

    it('disambiguates ventures sharing the same org by repo name', async () => {
      const { findVentureByRepo } = await getModule()

      const ke = findVentureByRepo(mockVentures, 'venturecrane', 'ke-console')
      expect(ke).not.toBeNull()
      expect(ke?.code).toBe('ke')

      const sc = findVentureByRepo(mockVentures, 'venturecrane', 'sc-console')
      expect(sc).not.toBeNull()
      expect(sc?.code).toBe('sc')

      const dfg = findVentureByRepo(mockVentures, 'venturecrane', 'dfg-console')
      expect(dfg).not.toBeNull()
      expect(dfg?.code).toBe('dfg')
    })

    it('returns null when repo is not in any venture repos array', async () => {
      const { findVentureByRepo } = await getModule()

      const venture = findVentureByRepo(mockVentures, 'venturecrane', 'unknown-repo')

      expect(venture).toBeNull()
    })

    it('matches second repo in array', async () => {
      const { findVentureByRepo } = await getModule()

      const venture = findVentureByRepo(mockVentures, 'venturecrane', 'vc-web')

      expect(venture).not.toBeNull()
      expect(venture?.code).toBe('vc')
    })
  })

  describe('findRepoForVenture', () => {
    it('finds local repo matching venture org', async () => {
      const { findRepoForVenture, scanLocalRepos } = await getModule()

      // Setup scanLocalRepos to return mock data
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(['crane-console'] as unknown as ReturnType<
        typeof readdirSync
      >)
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
        typeof statSync
      >)
      vi.mocked(execSync).mockReturnValue(mockRemoteUrls.ssh)

      const venture = mockVentures[0] // vc - venturecrane
      const repo = findRepoForVenture(venture)

      expect(repo).not.toBeNull()
      expect(repo?.org).toBe('venturecrane')
    })

    it('returns null when venture repo not installed', async () => {
      const { findRepoForVenture } = await getModule()

      vi.mocked(existsSync).mockReturnValue(false)

      const venture = mockVentures[0]
      const repo = findRepoForVenture(venture)

      expect(repo).toBeNull()
    })
  })
})
