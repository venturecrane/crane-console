/**
 * Tests for setupGeminiMcp - env passthrough and stale-config update logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({ on: vi.fn().mockReturnThis(), kill: vi.fn() })),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
}))

vi.mock('../lib/repo-scanner.js', () => ({
  scanLocalRepos: vi.fn(() => []),
}))

vi.mock('./ssh-auth.js', () => ({
  prepareSSHAuth: vi.fn(() => ({ env: {} })),
}))

import { setupGeminiMcp } from './launch-lib.js'

const EXPECTED_ENV_KEYS = [
  'CRANE_CONTEXT_KEY',
  'CRANE_ENV',
  'CRANE_VENTURE_CODE',
  'CRANE_VENTURE_NAME',
  'CRANE_REPO',
  'GH_TOKEN',
  'VERCEL_TOKEN',
  'CLOUDFLARE_API_TOKEN',
]

describe('setupGeminiMcp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates settings.json with all env vars when no file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    setupGeminiMcp('/fake/repo')

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.gemini'), { recursive: true })
    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    const env = written.mcpServers.crane.env

    for (const key of EXPECTED_ENV_KEYS) {
      expect(env).toHaveProperty(key)
    }
    expect(env.GH_TOKEN).toBe('$GH_TOKEN')
  })

  it('updates stale config that is missing auth tokens', () => {
    const staleSettings = {
      mcpServers: {
        crane: {
          command: 'crane-mcp',
          args: [],
          env: {
            CRANE_CONTEXT_KEY: '$CRANE_CONTEXT_KEY',
            CRANE_ENV: '$CRANE_ENV',
            CRANE_VENTURE_CODE: '$CRANE_VENTURE_CODE',
            CRANE_VENTURE_NAME: '$CRANE_VENTURE_NAME',
            CRANE_REPO: '$CRANE_REPO',
          },
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(staleSettings))

    setupGeminiMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    const env = written.mcpServers.crane.env

    for (const key of EXPECTED_ENV_KEYS) {
      expect(env).toHaveProperty(key)
    }
    expect(env.GH_TOKEN).toBe('$GH_TOKEN')
    expect(env.VERCEL_TOKEN).toBe('$VERCEL_TOKEN')
    expect(env.CLOUDFLARE_API_TOKEN).toBe('$CLOUDFLARE_API_TOKEN')
  })

  it('preserves venture-specific env vars during update', () => {
    const staleSettings = {
      mcpServers: {
        crane: {
          command: 'crane-mcp',
          args: [],
          env: {
            CRANE_CONTEXT_KEY: '$CRANE_CONTEXT_KEY',
            CRANE_ENV: '$CRANE_ENV',
            CRANE_VENTURE_CODE: '$CRANE_VENTURE_CODE',
            CRANE_VENTURE_NAME: '$CRANE_VENTURE_NAME',
            CRANE_REPO: '$CRANE_REPO',
            CUSTOM_VENTURE_VAR: 'custom-value',
          },
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(staleSettings))

    setupGeminiMcp('/fake/repo')

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    const env = written.mcpServers.crane.env

    expect(env.CUSTOM_VENTURE_VAR).toBe('custom-value')
    expect(env.GH_TOKEN).toBe('$GH_TOKEN')
  })

  it('skips write when config already has all required vars', () => {
    const currentSettings = {
      mcpServers: {
        crane: {
          command: 'crane-mcp',
          args: [],
          env: {
            CRANE_CONTEXT_KEY: '$CRANE_CONTEXT_KEY',
            CRANE_ENV: '$CRANE_ENV',
            CRANE_VENTURE_CODE: '$CRANE_VENTURE_CODE',
            CRANE_VENTURE_NAME: '$CRANE_VENTURE_NAME',
            CRANE_REPO: '$CRANE_REPO',
            GH_TOKEN: '$GH_TOKEN',
            VERCEL_TOKEN: '$VERCEL_TOKEN',
            CLOUDFLARE_API_TOKEN: '$CLOUDFLARE_API_TOKEN',
          },
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(currentSettings))

    setupGeminiMcp('/fake/repo')

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('updates config when env has wrong value for a key', () => {
    const badSettings = {
      mcpServers: {
        crane: {
          command: 'crane-mcp',
          args: [],
          env: {
            CRANE_CONTEXT_KEY: '$CRANE_CONTEXT_KEY',
            CRANE_ENV: '$CRANE_ENV',
            CRANE_VENTURE_CODE: '$CRANE_VENTURE_CODE',
            CRANE_VENTURE_NAME: '$CRANE_VENTURE_NAME',
            CRANE_REPO: '$CRANE_REPO',
            GH_TOKEN: 'hardcoded-token-oops',
            VERCEL_TOKEN: '$VERCEL_TOKEN',
            CLOUDFLARE_API_TOKEN: '$CLOUDFLARE_API_TOKEN',
          },
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(badSettings))

    setupGeminiMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.mcpServers.crane.env.GH_TOKEN).toBe('$GH_TOKEN')
  })

  it('adds env when crane server exists but env is missing', () => {
    const noEnvSettings = {
      mcpServers: {
        crane: {
          command: 'crane-mcp',
          args: [],
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(noEnvSettings))

    setupGeminiMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    const env = written.mcpServers.crane.env

    for (const key of EXPECTED_ENV_KEYS) {
      expect(env).toHaveProperty(key)
    }
  })
})
