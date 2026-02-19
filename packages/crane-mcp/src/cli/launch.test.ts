/**
 * Tests for launch-lib.ts - the extracted, testable crane launcher logic.
 *
 * These tests import real functions instead of simulating behavior externally.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawnSync } from 'child_process'

// Mock child_process before importing launch-lib
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    kill: vi.fn(),
  })),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

// Mock fs to avoid real filesystem access
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
}))

// Mock repo-scanner
vi.mock('../lib/repo-scanner.js', () => ({
  scanLocalRepos: vi.fn(() => []),
}))

// Mock ssh-auth
vi.mock('./ssh-auth.js', () => ({
  prepareSSHAuth: vi.fn(() => ({ env: {} })),
}))

import {
  resolveAgent,
  stripAgentFlags,
  fetchSecrets,
  ensureFreshBuild,
  INFISICAL_PATHS,
  KNOWN_AGENTS,
} from './launch-lib.js'
import { spawn, execSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'

describe('resolveAgent', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.CRANE_DEFAULT_AGENT
  })

  it('returns claude by default', () => {
    expect(resolveAgent([])).toBe('claude')
  })

  it('resolves --gemini flag', () => {
    expect(resolveAgent(['--gemini'])).toBe('gemini')
  })

  it('resolves --codex flag', () => {
    expect(resolveAgent(['--codex'])).toBe('codex')
  })

  it('resolves --claude flag', () => {
    expect(resolveAgent(['--claude'])).toBe('claude')
  })

  it('resolves --agent <name> flag', () => {
    expect(resolveAgent(['--agent', 'gemini'])).toBe('gemini')
  })

  it('resolves CRANE_DEFAULT_AGENT env var', () => {
    process.env.CRANE_DEFAULT_AGENT = 'codex'
    expect(resolveAgent([])).toBe('codex')
  })

  it('flag takes priority over env var', () => {
    process.env.CRANE_DEFAULT_AGENT = 'codex'
    expect(resolveAgent(['--gemini'])).toBe('gemini')
  })

  it('--agent takes priority over env var', () => {
    process.env.CRANE_DEFAULT_AGENT = 'codex'
    expect(resolveAgent(['--agent', 'claude'])).toBe('claude')
  })

  it('exits on conflicting flags', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
    expect(() => resolveAgent(['--claude', '--gemini'])).toThrow('process.exit')
    expect(mockExit).toHaveBeenCalledWith(1)
    mockExit.mockRestore()
  })
})

describe('stripAgentFlags', () => {
  it('removes --claude flag', () => {
    expect(stripAgentFlags(['vc', '--claude'])).toEqual(['vc'])
  })

  it('removes --agent and its value', () => {
    expect(stripAgentFlags(['vc', '--agent', 'gemini', '--debug'])).toEqual(['vc', '--debug'])
  })

  it('preserves non-agent flags', () => {
    expect(stripAgentFlags(['vc', '--debug', '--list'])).toEqual(['vc', '--debug', '--list'])
  })

  it('handles empty args', () => {
    expect(stripAgentFlags([])).toEqual([])
  })
})

describe('INFISICAL_PATHS', () => {
  it('maps venture codes to correct paths', () => {
    expect(INFISICAL_PATHS['vc']).toBe('/vc')
    expect(INFISICAL_PATHS['ke']).toBe('/ke')
    expect(INFISICAL_PATHS['sc']).toBe('/sc')
    expect(INFISICAL_PATHS['dfg']).toBe('/dfg')
    expect(INFISICAL_PATHS['dc']).toBe('/dc')
    expect(INFISICAL_PATHS['smd']).toBe('/smd')
  })
})

describe('KNOWN_AGENTS', () => {
  it('has expected agents', () => {
    expect(KNOWN_AGENTS).toEqual({
      claude: 'claude',
      gemini: 'gemini',
      codex: 'codex',
    })
  })
})

describe('fetchSecrets', () => {
  it('parses valid JSON output into secrets', () => {
    const mockOutput = JSON.stringify([
      { key: 'CRANE_CONTEXT_KEY', value: 'test-key-123' },
      { key: 'OTHER_SECRET', value: 'other-value' },
    ])

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    const result = fetchSecrets('/fake/repo', '/vc')
    expect(result).toEqual({
      secrets: {
        CRANE_CONTEXT_KEY: 'test-key-123',
        OTHER_SECRET: 'other-value',
      },
    })
  })

  it('returns error on empty output', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      error: undefined,
    } as any)

    const result = fetchSecrets('/fake/repo', '/vc')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('empty output')
  })

  it('returns error on malformed JSON', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'not-json-{{{',
      stderr: '',
      error: undefined,
    } as any)

    const result = fetchSecrets('/fake/repo', '/vc')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('malformed JSON')
  })

  it('returns error when CRANE_CONTEXT_KEY is missing', () => {
    const mockOutput = JSON.stringify([{ key: 'OTHER_KEY', value: 'some-value' }])

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    const result = fetchSecrets('/fake/repo', '/vc')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('CRANE_CONTEXT_KEY is missing')
    expect((result as { error: string }).error).toContain('sync-shared-secrets.sh')
  })

  it('returns error when parsed secrets array is empty', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      error: undefined,
    } as any)

    const result = fetchSecrets('/fake/repo', '/vc')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('no secrets')
  })

  it('returns error on non-zero exit code', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'auth expired',
      error: undefined,
    } as any)

    const result = fetchSecrets('/fake/repo', '/vc')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('exit 1')
    expect((result as { error: string }).error).toContain('auth expired')
  })

  it('returns error on ENOENT (infisical not installed)', () => {
    const enoent = new Error('spawn infisical ENOENT') as NodeJS.ErrnoException
    enoent.code = 'ENOENT'

    vi.mocked(spawnSync).mockReturnValue({
      status: null,
      stdout: '',
      stderr: '',
      error: enoent,
    } as any)

    const result = fetchSecrets('/fake/repo', '/vc')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('not found')
  })

  it('adds --projectId when INFISICAL_TOKEN is present', () => {
    const mockOutput = JSON.stringify([{ key: 'CRANE_CONTEXT_KEY', value: 'test-key' }])

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    fetchSecrets('/fake/repo', '/vc', { INFISICAL_TOKEN: 'some-token' })

    expect(spawnSync).toHaveBeenCalledWith(
      'infisical',
      expect.arrayContaining(['--projectId']),
      expect.any(Object)
    )
  })

  it('uses CRANE_ENV=dev with staging path for vc', () => {
    const originalEnv = process.env.CRANE_ENV
    process.env.CRANE_ENV = 'dev'

    const mockOutput = JSON.stringify([{ key: 'CRANE_CONTEXT_KEY', value: 'test-key' }])

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    fetchSecrets('/fake/repo', '/vc')

    expect(spawnSync).toHaveBeenCalledWith(
      'infisical',
      expect.arrayContaining(['--env', 'dev', '--path', '/vc/staging']),
      expect.any(Object)
    )

    process.env.CRANE_ENV = originalEnv
  })

  it('falls back to prod for non-vc ventures when CRANE_ENV=dev', () => {
    const originalEnv = process.env.CRANE_ENV
    process.env.CRANE_ENV = 'dev'

    const mockOutput = JSON.stringify([{ key: 'CRANE_CONTEXT_KEY', value: 'test-key' }])

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    fetchSecrets('/fake/repo', '/ke')

    expect(spawnSync).toHaveBeenCalledWith(
      'infisical',
      expect.arrayContaining(['--env', 'prod', '--path', '/ke']),
      expect.any(Object)
    )
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Staging not available for ke'))

    warnSpy.mockRestore()
    process.env.CRANE_ENV = originalEnv
  })

  it('defaults to prod when CRANE_ENV is not set', () => {
    const originalEnv = process.env.CRANE_ENV
    delete process.env.CRANE_ENV

    const mockOutput = JSON.stringify([{ key: 'CRANE_CONTEXT_KEY', value: 'test-key' }])

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    fetchSecrets('/fake/repo', '/vc')

    expect(spawnSync).toHaveBeenCalledWith(
      'infisical',
      expect.arrayContaining(['--env', 'prod']),
      expect.any(Object)
    )

    process.env.CRANE_ENV = originalEnv
  })
})

describe('launchAgent', () => {
  it('spawns agent binary directly (not infisical)', async () => {
    // Import after mocks are set up
    const { launchAgent } = await import('./launch-lib.js')
    const { execSync } = await import('child_process')

    // Mock validateAgentBinary (which calls execSync with 'which')
    vi.mocked(execSync).mockImplementation(() => Buffer.from('/usr/local/bin/claude'))

    // Mock fetchSecrets via spawnSync
    const mockOutput = JSON.stringify([
      { key: 'CRANE_CONTEXT_KEY', value: 'test-key' },
      { key: 'OTHER', value: 'val' },
    ])
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    const venture = {
      code: 'vc',
      name: 'Venture Crane',
      org: 'venturecrane',
      localPath: '/fake/path',
    }

    // Mock process.chdir
    const origChdir = process.chdir
    process.chdir = vi.fn() as any

    launchAgent(venture, 'claude', false)

    // Verify spawn was called with 'claude' binary, not 'infisical'
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      [],
      expect.objectContaining({
        stdio: 'inherit',
        cwd: '/fake/path',
      })
    )

    // Verify spawn was NOT called with 'infisical'
    expect(spawn).not.toHaveBeenCalledWith('infisical', expect.any(Array), expect.any(Object))

    process.chdir = origChdir
  })

  it('does not use shell: true', async () => {
    const { launchAgent } = await import('./launch-lib.js')
    const { execSync } = await import('child_process')

    vi.mocked(execSync).mockImplementation(() => Buffer.from('/usr/local/bin/claude'))

    const mockOutput = JSON.stringify([{ key: 'CRANE_CONTEXT_KEY', value: 'test-key' }])
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    const venture = {
      code: 'vc',
      name: 'Venture Crane',
      org: 'venturecrane',
      localPath: '/fake/path',
    }

    const origChdir = process.chdir
    process.chdir = vi.fn() as any

    launchAgent(venture, 'claude', false)

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.not.objectContaining({ shell: true })
    )

    process.chdir = origChdir
  })

  it('injects venture identity env vars into child process', async () => {
    const { launchAgent } = await import('./launch-lib.js')
    const { execSync } = await import('child_process')

    vi.mocked(execSync).mockImplementation(() => Buffer.from('/usr/local/bin/claude'))

    const mockOutput = JSON.stringify([{ key: 'CRANE_CONTEXT_KEY', value: 'test-key' }])
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    const venture = {
      code: 'ke',
      name: 'Kid Expenses',
      org: 'venturecrane',
      localPath: '/Users/test/dev/ke-console',
    }

    const origChdir = process.chdir
    process.chdir = vi.fn() as any

    launchAgent(venture, 'claude', false)

    const spawnCall = vi.mocked(spawn).mock.calls.at(-1)!
    const env = spawnCall[2]?.env as Record<string, string>

    expect(env.CRANE_VENTURE_CODE).toBe('ke')
    expect(env.CRANE_VENTURE_NAME).toBe('Kid Expenses')
    expect(env.CRANE_REPO).toBe('ke-console')

    process.chdir = origChdir
  })

  it('registers signal forwarding for SIGINT and SIGTERM', async () => {
    const { launchAgent } = await import('./launch-lib.js')
    const { execSync } = await import('child_process')

    vi.mocked(execSync).mockImplementation(() => Buffer.from('/usr/local/bin/claude'))

    const mockOutput = JSON.stringify([{ key: 'CRANE_CONTEXT_KEY', value: 'test-key' }])
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: mockOutput,
      stderr: '',
      error: undefined,
    } as any)

    const processOnSpy = vi.spyOn(process, 'on')

    const venture = {
      code: 'vc',
      name: 'Venture Crane',
      org: 'venturecrane',
      localPath: '/fake/path',
    }

    const origChdir = process.chdir
    process.chdir = vi.fn() as any

    launchAgent(venture, 'claude', false)

    // Verify signal handlers were registered
    const registeredSignals = processOnSpy.mock.calls.map((call) => call[0])
    expect(registeredSignals).toContain('SIGINT')
    expect(registeredSignals).toContain('SIGTERM')

    processOnSpy.mockRestore()
    process.chdir = origChdir
  })
})

describe('ensureFreshBuild', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.CRANE_FRESH_BUILD
    vi.clearAllMocks()
    // Default: existsSync returns true (src and dist dirs exist)
    vi.mocked(existsSync).mockReturnValue(true)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('skips when CRANE_FRESH_BUILD guard is set', () => {
    process.env.CRANE_FRESH_BUILD = '1'

    ensureFreshBuild()

    expect(readdirSync).not.toHaveBeenCalled()
  })

  it('skips when dist directory does not exist', () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      return !String(p).includes('dist')
    })

    ensureFreshBuild()

    expect(readdirSync).not.toHaveBeenCalled()
  })

  it('skips when src directory does not exist', () => {
    let callCount = 0
    vi.mocked(existsSync).mockImplementation(() => {
      callCount++
      // First call (dist) = true, second call (src) = false
      return callCount <= 1
    })

    ensureFreshBuild()

    expect(readdirSync).not.toHaveBeenCalled()
  })

  it('skips when build is fresh (dist newer than src)', () => {
    vi.mocked(readdirSync).mockImplementation((dir: any) => {
      if (String(dir).includes('src')) return ['cli/launch-lib.ts'] as any
      if (String(dir).includes('dist')) return ['cli/launch-lib.js'] as any
      return [] as any
    })
    vi.mocked(statSync).mockImplementation((p: any) => {
      // src file at time 100, dist file at time 200 (dist is newer)
      return { mtimeMs: String(p).includes('src') ? 100 : 200 } as any
    })

    ensureFreshBuild()

    // Should not attempt rebuild
    expect(execSync).not.toHaveBeenCalled()
  })

  it('rebuilds and re-execs when source is newer than dist', () => {
    vi.mocked(readdirSync).mockImplementation((dir: any) => {
      if (String(dir).includes('src')) return ['cli/launch-lib.ts'] as any
      if (String(dir).includes('dist')) return ['cli/launch-lib.js'] as any
      return [] as any
    })
    vi.mocked(statSync).mockImplementation((p: any) => {
      // src file at time 200, dist file at time 100 (src is newer = stale build)
      return { mtimeMs: String(p).includes('src') ? 200 : 100 } as any
    })

    // Mock execSync for the rebuild (npm run build)
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))

    // Mock spawnSync for the re-exec
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any)

    expect(() => ensureFreshBuild()).toThrow('process.exit')

    // Verify rebuild was attempted
    expect(execSync).toHaveBeenCalledWith(
      'npm run build',
      expect.objectContaining({ timeout: 30_000 })
    )

    // Verify re-exec was attempted with guard env var
    expect(spawnSync).toHaveBeenCalledWith(
      process.argv[0],
      process.argv.slice(1),
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({ CRANE_FRESH_BUILD: '1' }),
      })
    )

    mockExit.mockRestore()
  })

  it('continues with existing build when rebuild fails', () => {
    vi.mocked(readdirSync).mockImplementation((dir: any) => {
      if (String(dir).includes('src')) return ['cli/launch-lib.ts'] as any
      if (String(dir).includes('dist')) return ['cli/launch-lib.js'] as any
      return [] as any
    })
    vi.mocked(statSync).mockImplementation((p: any) => {
      return { mtimeMs: String(p).includes('src') ? 200 : 100 } as any
    })

    // Rebuild fails
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('tsc failed')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Should not throw - graceful fallback
    ensureFreshBuild()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-rebuild failed'))

    // Should NOT attempt re-exec
    expect(spawnSync).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
