/**
 * Tests for setupGeminiMcp - env passthrough, stale-config update, and security allowlist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({ on: vi.fn().mockReturnThis(), kill: vi.fn() })),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    // Return valid ventures.json for INFISICAL_PATHS derivation
    if (String(filePath).includes('ventures.json')) {
      return JSON.stringify({
        ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
      })
    }
    return '{}'
  }),
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

import { setupGeminiMcp, setupClaudeMcp, extractPassthroughArgs } from './launch-lib.js'

const EXPECTED_ENV_KEYS = [
  'CRANE_CONTEXT_KEY',
  'CRANE_ENV',
  'CRANE_VENTURE_CODE',
  'CRANE_VENTURE_NAME',
  'CRANE_REPO',
  'GH_TOKEN',
  'VERCEL_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'STITCH_API_KEY',
]

function getWritten(): Record<string, unknown> {
  return JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
}

describe('setupGeminiMcp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates settings.json with all env vars and security allowlist when no file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    setupGeminiMcp('/fake/repo')

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.gemini'), { recursive: true })
    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = getWritten()
    const env = (written.mcpServers as Record<string, Record<string, unknown>>).crane.env as Record<
      string,
      string
    >

    for (const key of EXPECTED_ENV_KEYS) {
      expect(env).toHaveProperty(key)
    }
    expect(env.GH_TOKEN).toBe('$GH_TOKEN')

    // Security allowlist should include all env keys
    const security = written.security as Record<string, Record<string, unknown>>
    const allowed = security.environmentVariableRedaction.allowed as string[]
    for (const key of EXPECTED_ENV_KEYS) {
      expect(allowed).toContain(key)
    }
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

    const written = getWritten()
    const env = (written.mcpServers as Record<string, Record<string, unknown>>).crane.env as Record<
      string,
      string
    >

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

    const written = getWritten()
    const env = (written.mcpServers as Record<string, Record<string, unknown>>).crane.env as Record<
      string,
      string
    >

    expect(env.CUSTOM_VENTURE_VAR).toBe('custom-value')
    expect(env.GH_TOKEN).toBe('$GH_TOKEN')
  })

  it('skips write when config already has all required vars and security allowlist', () => {
    const currentSettings: Record<string, unknown> = {
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
            STITCH_API_KEY: '$STITCH_API_KEY',
          },
          ...(process.env.STITCH_API_KEY
            ? {
                stitch: {
                  command: 'npx',
                  args: ['@_davideast/stitch-mcp@0.5.1', 'proxy'],
                  env: { STITCH_API_KEY: '$STITCH_API_KEY' },
                },
              }
            : {}),
        },
      },
      security: {
        environmentVariableRedaction: {
          allowed: EXPECTED_ENV_KEYS,
        },
      },
    }

    // When STITCH_API_KEY is in the environment, setupGeminiMcp expects a stitch server entry
    if (process.env.STITCH_API_KEY) {
      const servers = currentSettings.mcpServers as Record<string, unknown>
      servers.stitch = {
        command: 'npx',
        args: ['@_davideast/stitch-mcp@0.5.1', 'proxy'],
        env: { STITCH_API_KEY: '$STITCH_API_KEY' },
      }
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
      security: {
        environmentVariableRedaction: {
          allowed: EXPECTED_ENV_KEYS,
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(badSettings))

    setupGeminiMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = getWritten()
    expect(
      (
        (written.mcpServers as Record<string, Record<string, unknown>>).crane.env as Record<
          string,
          string
        >
      ).GH_TOKEN
    ).toBe('$GH_TOKEN')
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

    const written = getWritten()
    const env = (written.mcpServers as Record<string, Record<string, unknown>>).crane.env as Record<
      string,
      string
    >

    for (const key of EXPECTED_ENV_KEYS) {
      expect(env).toHaveProperty(key)
    }
  })

  it('adds security allowlist when env is current but allowlist is missing', () => {
    const noSecuritySettings = {
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
            STITCH_API_KEY: '$STITCH_API_KEY',
          },
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(noSecuritySettings))

    setupGeminiMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = getWritten()
    const security = written.security as Record<string, Record<string, unknown>>
    const allowed = security.environmentVariableRedaction.allowed as string[]
    for (const key of EXPECTED_ENV_KEYS) {
      expect(allowed).toContain(key)
    }
  })

  it('preserves existing allowed vars while adding missing ones', () => {
    const partialAllowlist = {
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
            STITCH_API_KEY: '$STITCH_API_KEY',
          },
        },
      },
      security: {
        environmentVariableRedaction: {
          allowed: ['CRANE_CONTEXT_KEY', 'CUSTOM_VAR'],
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(partialAllowlist))

    setupGeminiMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const written = getWritten()
    const allowed = (
      (written.security as Record<string, Record<string, unknown>>)
        .environmentVariableRedaction as Record<string, unknown>
    ).allowed as string[]

    // Existing custom var preserved
    expect(allowed).toContain('CUSTOM_VAR')
    // All expected vars added
    for (const key of EXPECTED_ENV_KEYS) {
      expect(allowed).toContain(key)
    }
  })
})

describe('setupClaudeMcp', () => {
  const SOURCE_CONFIG = {
    mcpServers: {
      crane: { command: 'crane-mcp', args: [], env: {} },
      stitch: { command: 'npx', args: ['@_davideast/stitch-mcp@0.5.1', 'proxy'], env: {} },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies from source when target does not exist', () => {
    vi.mocked(existsSync).mockImplementation((filePath: string) => {
      if (String(filePath).includes('crane-console')) return true
      return false
    })
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      return JSON.stringify(SOURCE_CONFIG)
    })

    setupClaudeMcp('/fake/repo')

    expect(copyFileSync).toHaveBeenCalledTimes(1)
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('syncs missing servers from source into target', () => {
    const targetConfig = {
      mcpServers: {
        crane: { command: 'crane-mcp', args: [], env: {} },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      if (String(filePath).includes('crane-console')) return JSON.stringify(SOURCE_CONFIG)
      return JSON.stringify(targetConfig)
    })

    setupClaudeMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.mcpServers.stitch).toEqual(SOURCE_CONFIG.mcpServers.stitch)
  })

  it('updates stale server configs when source has newer version', () => {
    const targetConfig = {
      mcpServers: {
        crane: { command: 'crane-mcp', args: [], env: {} },
        stitch: { command: 'npx', args: ['@_davideast/stitch-mcp@0.4.0', 'proxy'], env: {} },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      if (String(filePath).includes('crane-console')) return JSON.stringify(SOURCE_CONFIG)
      return JSON.stringify(targetConfig)
    })

    setupClaudeMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.mcpServers.stitch.args[0]).toBe('@_davideast/stitch-mcp@0.5.1')
  })

  it('skips write when target matches source', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      return JSON.stringify(SOURCE_CONFIG)
    })

    setupClaudeMcp('/fake/repo')

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('overwrites malformed target JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      if (String(filePath).includes('crane-console')) return JSON.stringify(SOURCE_CONFIG)
      return '{invalid json'
    })

    setupClaudeMcp('/fake/repo')

    expect(copyFileSync).toHaveBeenCalledTimes(1)
  })

  it('preserves target-only servers not in source', () => {
    const targetConfig = {
      mcpServers: {
        crane: { command: 'crane-mcp', args: [], env: {} },
        stitch: { command: 'npx', args: ['@_davideast/stitch-mcp@0.5.1', 'proxy'], env: {} },
        custom: { command: 'custom-mcp', args: [] },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      if (String(filePath).includes('crane-console')) return JSON.stringify(SOURCE_CONFIG)
      return JSON.stringify(targetConfig)
    })

    setupClaudeMcp('/fake/repo')

    // No write needed - source servers match target. Custom server is preserved.
    expect(writeFileSync).not.toHaveBeenCalled()
  })
})

describe('extractPassthroughArgs', () => {
  it('passes -p "prompt" through when venture code is present', () => {
    const result = extractPassthroughArgs(['vc', '-p', 'echo hello'])
    expect(result).toEqual(['-p', 'echo hello'])
  })

  it('passes --allowedTools through', () => {
    const result = extractPassthroughArgs(['vc', '-p', 'test', '--allowedTools', 'Bash(npm test)'])
    expect(result).toEqual(['-p', 'test', '--allowedTools', 'Bash(npm test)'])
  })

  it('strips crane flags and does not pass them through', () => {
    const result = extractPassthroughArgs(['vc', '--debug', '-p', 'echo hello'])
    expect(result).toEqual(['-p', 'echo hello'])
  })

  it('strips --list and does not pass it through', () => {
    const result = extractPassthroughArgs(['vc', '--list'])
    expect(result).toEqual([])
  })

  it('strips agent flags', () => {
    const result = extractPassthroughArgs(['vc', '--claude', '-p', 'test'])
    expect(result).toEqual(['-p', 'test'])
  })

  it('strips --agent and its value', () => {
    const result = extractPassthroughArgs(['vc', '--agent', 'gemini', '-p', 'test'])
    expect(result).toEqual(['-p', 'test'])
  })

  it('strips --secrets-audit and --fix', () => {
    const result = extractPassthroughArgs(['vc', '--secrets-audit', '--fix'])
    expect(result).toEqual([])
  })

  it('returns empty array when only venture code provided', () => {
    const result = extractPassthroughArgs(['vc'])
    expect(result).toEqual([])
  })

  it('returns empty array for no args', () => {
    const result = extractPassthroughArgs([])
    expect(result).toEqual([])
  })

  it('handles -d shorthand for --debug', () => {
    const result = extractPassthroughArgs(['vc', '-d', '-p', 'test'])
    expect(result).toEqual(['-p', 'test'])
  })

  it('treats only the first non-flag arg as venture code', () => {
    // "vc" is venture code, "extra-arg" should pass through
    const result = extractPassthroughArgs(['vc', 'extra-arg'])
    expect(result).toEqual(['extra-arg'])
  })
})
