/**
 * Tests for repo-scanner.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { homedir } from 'os';
import {
  mockLocalRepos,
  mockRepoInfo,
  mockRepoInfoFeatureBranch,
  mockRemoteUrls,
  mockDevDirEntries,
} from '../__fixtures__/repo-fixtures.js';
import { mockVentures } from '../__fixtures__/api-responses.js';

// Mock external modules
vi.mock('child_process');
vi.mock('fs');
vi.mock('os');

// We need to reset modules to clear the cache between tests
const getModule = async () => {
  vi.resetModules();
  return import('./repo-scanner.js');
};

describe('repo-scanner', () => {
  beforeEach(() => {
    vi.mocked(homedir).mockReturnValue('/Users/testuser');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('scanLocalRepos', () => {
    it('finds git directories in ~/dev', async () => {
      const { scanLocalRepos } = await getModule();

      vi.mocked(existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr === '/Users/testuser/dev') return true;
        if (pathStr.endsWith('.git')) return true;
        return false;
      });

      vi.mocked(readdirSync).mockReturnValue(mockDevDirEntries as unknown as ReturnType<typeof readdirSync>);

      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof statSync>);

      vi.mocked(execSync).mockImplementation((cmd, opts) => {
        const cwd = (opts as { cwd?: string })?.cwd || '';
        if (cwd.includes('crane-console')) return mockRemoteUrls.ssh;
        if (cwd.includes('ke-console')) return mockRemoteUrls.httpsKe;
        if (cwd.includes('sc-app')) return mockRemoteUrls.sshSc;
        throw new Error('No remote');
      });

      const repos = scanLocalRepos();

      expect(repos.length).toBe(3);
      expect(repos[0].org).toBe('venturecrane');
      expect(repos[0].repoName).toBe('crane-console');
    });

    it('extracts org from HTTPS URL', async () => {
      const { scanLocalRepos } = await getModule();

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['test-repo'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);
      vi.mocked(execSync).mockReturnValue('https://github.com/kidexpenses/ke-console.git');

      const repos = scanLocalRepos();

      expect(repos[0].org).toBe('kidexpenses');
      expect(repos[0].repoName).toBe('ke-console');
    });

    it('extracts org from SSH URL', async () => {
      const { scanLocalRepos } = await getModule();

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['test-repo'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);
      vi.mocked(execSync).mockReturnValue('git@github.com:venturecrane/crane-console.git');

      const repos = scanLocalRepos();

      expect(repos[0].org).toBe('venturecrane');
      expect(repos[0].repoName).toBe('crane-console');
    });

    it('caches results on subsequent calls', async () => {
      const { scanLocalRepos } = await getModule();

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['test-repo'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);
      vi.mocked(execSync).mockReturnValue('git@github.com:venturecrane/crane-console.git');

      // First call
      scanLocalRepos();
      // Second call
      scanLocalRepos();

      // readdirSync should only be called once due to caching
      expect(readdirSync).toHaveBeenCalledTimes(1);
    });

    it('returns empty array if ~/dev does not exist', async () => {
      const { scanLocalRepos } = await getModule();

      vi.mocked(existsSync).mockReturnValue(false);

      const repos = scanLocalRepos();

      expect(repos).toEqual([]);
    });
  });

  describe('getCurrentRepoInfo', () => {
    it('returns repo details when in a git repo', async () => {
      const { getCurrentRepoInfo } = await getModule();

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('remote get-url')) return mockRemoteUrls.ssh;
        if (cmdStr.includes('branch --show-current')) return 'main';
        return '';
      });

      const info = getCurrentRepoInfo();

      expect(info).toEqual(mockRepoInfo);
    });

    it('returns null when not in a git repo', async () => {
      const { getCurrentRepoInfo } = await getModule();

      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal: not a git repository');
      });

      const info = getCurrentRepoInfo();

      expect(info).toBeNull();
    });

    it('defaults to main branch on error', async () => {
      const { getCurrentRepoInfo } = await getModule();

      vi.mocked(execSync).mockImplementation((cmd) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('remote get-url')) return mockRemoteUrls.ssh;
        if (cmdStr.includes('branch --show-current')) throw new Error('detached HEAD');
        return '';
      });

      const info = getCurrentRepoInfo();

      expect(info?.branch).toBe('main');
    });
  });

  describe('findVentureByOrg', () => {
    it('matches org to venture (case insensitive)', async () => {
      const { findVentureByOrg } = await getModule();

      const venture = findVentureByOrg(mockVentures, 'VentureCrane');

      expect(venture).not.toBeNull();
      expect(venture?.code).toBe('vc');
    });

    it('returns null for unknown org', async () => {
      const { findVentureByOrg } = await getModule();

      const venture = findVentureByOrg(mockVentures, 'unknownorg');

      expect(venture).toBeNull();
    });
  });

  describe('findRepoForVenture', () => {
    it('finds local repo matching venture org', async () => {
      const { findRepoForVenture, scanLocalRepos } = await getModule();

      // Setup scanLocalRepos to return mock data
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['crane-console'] as unknown as ReturnType<typeof readdirSync>);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);
      vi.mocked(execSync).mockReturnValue(mockRemoteUrls.ssh);

      const venture = mockVentures[0]; // vc - venturecrane
      const repo = findRepoForVenture(venture);

      expect(repo).not.toBeNull();
      expect(repo?.org).toBe('venturecrane');
    });

    it('returns null when venture repo not installed', async () => {
      const { findRepoForVenture } = await getModule();

      vi.mocked(existsSync).mockReturnValue(false);

      const venture = mockVentures[0];
      const repo = findRepoForVenture(venture);

      expect(repo).toBeNull();
    });
  });
});
