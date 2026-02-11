/**
 * Tests for launch-lib.ts — the extracted, testable crane launcher logic.
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
  INFISICAL_PATHS,
  KNOWN_AGENTS,
} from './launch-lib.js'
import { spawn } from 'child_process'

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

  it('uses CRANE_ENV for --env flag', () => {
    const originalEnv = process.env.CRANE_ENV
    process.env.CRANE_ENV = 'staging'

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
      expect.arrayContaining(['--env', 'staging']),
      expect.any(Object)
    )

    process.env.CRANE_ENV = originalEnv
  })

  it('defaults to dev when CRANE_ENV is not set', () => {
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
      expect.arrayContaining(['--env', 'dev']),
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
