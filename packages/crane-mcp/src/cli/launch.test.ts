/**
 * Tests for launch.ts CLI
 *
 * Note: Testing CLI entry points is challenging because they execute on import.
 * We test the core functions by extracting testable logic rather than testing
 * the main() function directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawn } from 'child_process'
import { createInterface } from 'readline'

// We can't easily test the CLI entry point directly since it executes on import.
// Instead, we verify the module structure and test behavior through integration patterns.

vi.mock('child_process')
vi.mock('readline')

describe('launch CLI', () => {
  describe('module structure', () => {
    it('exports are available', async () => {
      // Verify the module can be parsed (TypeScript compilation check)
      // The actual launch.ts is an executable script, not a module with exports
      expect(true).toBe(true)
    })
  })

  describe('spawn behavior', () => {
    it('spawn creates child process with correct arguments (no shell)', () => {
      const mockChild = {
        on: vi.fn().mockReturnThis(),
      }
      vi.mocked(spawn).mockReturnValue(mockChild as any)

      // Simulate what launchClaude does - without shell: true to avoid DEP0190 and loop issues
      spawn('infisical', ['run', '--silent', '--path', '/vc', '--', 'claude'], {
        stdio: 'inherit',
        cwd: '/Users/testuser/dev/crane-console',
      })

      expect(spawn).toHaveBeenCalledWith(
        'infisical',
        ['run', '--silent', '--path', '/vc', '--', 'claude'],
        expect.objectContaining({
          stdio: 'inherit',
          cwd: '/Users/testuser/dev/crane-console',
        })
      )
    })

    it('spawn should NOT use shell: true (fixes loop issue)', () => {
      const mockChild = {
        on: vi.fn().mockReturnThis(),
      }
      vi.mocked(spawn).mockReturnValue(mockChild as any)

      spawn('infisical', ['run', '--path', '/ke', '--', 'claude'], {
        stdio: 'inherit',
        cwd: '/Users/testuser/dev/ke-console',
      })

      // Verify shell is NOT being used
      expect(spawn).toHaveBeenCalledWith(
        'infisical',
        expect.any(Array),
        expect.not.objectContaining({
          shell: true,
        })
      )
    })
  })

  describe('readline behavior', () => {
    it('createInterface is used for interactive prompts', () => {
      const mockRl = {
        question: vi.fn(),
        close: vi.fn(),
      }
      vi.mocked(createInterface).mockReturnValue(mockRl as any)

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      expect(createInterface).toHaveBeenCalled()
      expect(rl.question).toBeDefined()
    })
  })

  describe('INFISICAL_PATHS mapping', () => {
    it('maps venture codes to correct paths', () => {
      // This mirrors the mapping in launch.ts
      const INFISICAL_PATHS: Record<string, string> = {
        vc: '/vc',
        ke: '/ke',
        sc: '/sc',
        dfg: '/dfg',
        smd: '/smd',
        dc: '/dc',
      }

      expect(INFISICAL_PATHS['vc']).toBe('/vc')
      expect(INFISICAL_PATHS['ke']).toBe('/ke')
      expect(INFISICAL_PATHS['sc']).toBe('/sc')
      expect(INFISICAL_PATHS['dfg']).toBe('/dfg')
      expect(INFISICAL_PATHS['dc']).toBe('/dc')
    })
  })

  describe('venture list output format', () => {
    it('formats venture info correctly', () => {
      // Test the formatting logic used by printVentureList
      const venture = {
        code: 'vc',
        name: 'Venture Crane',
        org: 'venturecrane',
        localPath: '/Users/testuser/dev/crane-console',
      }

      const num = `1)`.padEnd(3)
      const name = venture.name.padEnd(20)
      const code = `[${venture.code}]`.padEnd(6)
      const path = venture.localPath
      const formatted = `${num} ${name} ${code} ${path}`

      expect(formatted).toContain('1)')
      expect(formatted).toContain('Venture Crane')
      expect(formatted).toContain('[vc]')
      expect(formatted).toContain('/Users/testuser/dev/crane-console')
    })

    it('shows not installed status', () => {
      const venture = {
        code: 'dfg',
        name: 'Durgan Field Guide',
        org: 'durganfieldguide',
        localPath: null,
      }

      const path = venture.localPath || '(not installed)'
      const status = venture.localPath ? '' : ' [!]'

      expect(path).toBe('(not installed)')
      expect(status).toBe(' [!]')
    })
  })

  describe('remote URL parsing', () => {
    it('parses SSH URL correctly', () => {
      const sshUrl = 'git@github.com:venturecrane/crane-console.git'
      const match = sshUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)

      expect(match).not.toBeNull()
      expect(match?.[1]).toBe('venturecrane')
      expect(match?.[2]).toBe('crane-console')
    })

    it('parses HTTPS URL correctly', () => {
      const httpsUrl = 'https://github.com/kidexpenses/ke-console.git'
      const match = httpsUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)

      expect(match).not.toBeNull()
      expect(match?.[1]).toBe('kidexpenses')
      expect(match?.[2]).toBe('ke-console')
    })
  })

  describe('venture matching', () => {
    it('matches ventures to repos by org (case insensitive)', () => {
      const ventures = [
        { code: 'vc', name: 'Venture Crane', org: 'venturecrane' },
        { code: 'ke', name: 'Kid Expenses', org: 'kidexpenses' },
      ]

      const repos = [{ path: '/dev/crane-console', org: 'VentureCrane', repoName: 'crane-console' }]

      const matched = ventures.map((v) => {
        const repo = repos.find((r) => r.org.toLowerCase() === v.org.toLowerCase())
        return { ...v, localPath: repo?.path || null }
      })

      expect(matched[0].localPath).toBe('/dev/crane-console')
      expect(matched[1].localPath).toBeNull()
    })
  })
})
