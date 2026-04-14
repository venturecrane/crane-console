/**
 * Tests for setupGeminiMcp - env passthrough, stale-config update, and security allowlist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  existsSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'fs'

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

import { join } from 'path'
import { homedir } from 'os'
import {
  setupGeminiMcp,
  setupClaudeMcp,
  ensureClaudeProjectTrust,
  ensureClaudeUserDenyRules,
  syncClaudeAssets,
  extractPassthroughArgs,
} from './launch-lib.js'

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
    },
  }

  // ensureClaudeProjectTrust is exercised in its own describe block. For these
  // tests we want to isolate the .mcp.json sync behavior, so we make
  // ~/.claude.json appear "already trusted" — that path becomes a no-op write
  // and won't pollute writeFileSync assertions.
  const CLAUDE_CONFIG_PATH = join(homedir(), '.claude.json')
  const TRUSTED_CLAUDE_CONFIG = JSON.stringify({
    projects: { '/fake/repo': { hasTrustDialogAccepted: true } },
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies source to target when target missing', () => {
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

    // Source unchanged (no API key to inject), target copied
    expect(copyFileSync).toHaveBeenCalledTimes(1)
  })

  it('syncs missing servers from source into target', () => {
    const targetConfig = {
      mcpServers: {
        crane: { command: 'crane-mcp', args: [], env: {} },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) return TRUSTED_CLAUDE_CONFIG
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      if (String(filePath).includes('crane-console')) return JSON.stringify(SOURCE_CONFIG)
      return JSON.stringify(targetConfig)
    })

    setupClaudeMcp('/fake/repo')

    // Source has no stitch — target should not get stitch either
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('removes legacy stitch subprocess from target', () => {
    const targetConfig = {
      mcpServers: {
        crane: { command: 'crane-mcp', args: [], env: {} },
        stitch: {
          command: 'npx',
          args: ['@_davideast/stitch-mcp@0.4.0', 'proxy'],
          env: { STITCH_PROJECT_ID: 'smdurgan-tools' },
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) return TRUSTED_CLAUDE_CONFIG
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      if (String(filePath).includes('crane-console')) return JSON.stringify(SOURCE_CONFIG)
      return JSON.stringify(targetConfig)
    })

    setupClaudeMcp('/fake/repo')

    // Target updated: legacy stitch subprocess removed
    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const targetWritten = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(targetWritten.mcpServers.stitch).toBeUndefined()
  })

  it('removes direct-HTTP stitch entry from target (claude-code#41664 bug class)', () => {
    // Direct HTTP registration trips Claude Code's OAuth DCR bug — even with a
    // valid API key header, tool calls fail. Launcher owns stitch registration
    // via the proxy subprocess, so any pre-existing HTTP entry must be stripped.
    const targetConfig = {
      mcpServers: {
        crane: { command: 'crane-mcp', args: [], env: {} },
        stitch: {
          type: 'http',
          url: 'https://stitch.googleapis.com/mcp',
          headers: { 'X-Goog-Api-Key': 'AQ.Ab8fake' },
        },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) return TRUSTED_CLAUDE_CONFIG
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
    const targetWritten = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(targetWritten.mcpServers.stitch).toBeUndefined()
  })

  it('skips write when source and target already match', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) return TRUSTED_CLAUDE_CONFIG
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      return JSON.stringify(SOURCE_CONFIG)
    })

    setupClaudeMcp('/fake/repo')

    // Source and target already match — no writes
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

    // Source unchanged, malformed target overwritten via copy
    expect(copyFileSync).toHaveBeenCalledTimes(1)
  })

  it('preserves target-only servers not in source', () => {
    const targetConfig = {
      mcpServers: {
        crane: { command: 'crane-mcp', args: [], env: {} },
        custom: { command: 'custom-mcp', args: [] },
      },
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) return TRUSTED_CLAUDE_CONFIG
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      if (String(filePath).includes('crane-console')) return JSON.stringify(SOURCE_CONFIG)
      return JSON.stringify(targetConfig)
    })

    setupClaudeMcp('/fake/repo')

    // Source and target match on crane, custom preserved. No writes needed.
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('marks the project trusted via ensureClaudeProjectTrust', () => {
    // ~/.claude.json starts WITHOUT the project entry. The .mcp.json side
    // already matches source so the only expected write is the trust patch.
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) return JSON.stringify({ projects: {} })
      if (String(filePath).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'vc' }, { code: 'ke' }, { code: 'sc' }, { code: 'dfg' }],
        })
      }
      return JSON.stringify(SOURCE_CONFIG)
    })

    setupClaudeMcp('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(writeFileSync).mock.calls[0]
    expect(path).toBe(CLAUDE_CONFIG_PATH)
    const written = JSON.parse(body as string)
    expect(written.projects['/fake/repo'].hasTrustDialogAccepted).toBe(true)
  })
})

describe('ensureClaudeProjectTrust', () => {
  const CLAUDE_CONFIG_PATH = join(homedir(), '.claude.json')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips silently when ~/.claude.json does not exist', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => String(p) !== CLAUDE_CONFIG_PATH)

    ensureClaudeProjectTrust('/fake/repo')

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('skips silently when ~/.claude.json is malformed', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => String(p) === CLAUDE_CONFIG_PATH)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) return '{not valid json'
      return '{}'
    })

    ensureClaudeProjectTrust('/fake/repo')

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('adds the project entry with hasTrustDialogAccepted when missing', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => String(p) === CLAUDE_CONFIG_PATH)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) {
        return JSON.stringify({ projects: {} })
      }
      return '{}'
    })

    ensureClaudeProjectTrust('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.projects['/fake/repo'].hasTrustDialogAccepted).toBe(true)
  })

  it('flips hasTrustDialogAccepted to true while preserving other project fields', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => String(p) === CLAUDE_CONFIG_PATH)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) {
        return JSON.stringify({
          projects: {
            '/fake/repo': {
              hasTrustDialogAccepted: false,
              allowedTools: ['Bash'],
              mcpContextUris: [],
            },
          },
        })
      }
      return '{}'
    })

    ensureClaudeProjectTrust('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.projects['/fake/repo'].hasTrustDialogAccepted).toBe(true)
    expect(written.projects['/fake/repo'].allowedTools).toEqual(['Bash'])
    expect(written.projects['/fake/repo'].mcpContextUris).toEqual([])
  })

  it('is a no-op when the project is already trusted', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => String(p) === CLAUDE_CONFIG_PATH)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) {
        return JSON.stringify({
          projects: { '/fake/repo': { hasTrustDialogAccepted: true } },
        })
      }
      return '{}'
    })

    ensureClaudeProjectTrust('/fake/repo')

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('creates projects map when ~/.claude.json has no projects key', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => String(p) === CLAUDE_CONFIG_PATH)
    vi.mocked(readFileSync).mockImplementation((filePath: string) => {
      if (String(filePath) === CLAUDE_CONFIG_PATH) {
        return JSON.stringify({ numStartups: 5 })
      }
      return '{}'
    })

    ensureClaudeProjectTrust('/fake/repo')

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.numStartups).toBe(5)
    expect(written.projects['/fake/repo'].hasTrustDialogAccepted).toBe(true)
  })
})

describe('ensureClaudeUserDenyRules', () => {
  const USER_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')
  const DENY_RULE = 'mcp__claude_ai_crane_context__*'

  // Set up readFileSync to respond for both the config file and the user settings
  // file. Any path matcher not supplied falls through to the default `'{}'`.
  function mockReads(opts: { rules?: unknown; settings?: string | object }): void {
    vi.mocked(readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath)
      if (p.includes('claude-deny-rules.json')) {
        return opts.rules !== undefined ? JSON.stringify(opts.rules) : JSON.stringify([DENY_RULE])
      }
      if (p.includes('.claude/settings.json')) {
        if (typeof opts.settings === 'string') return opts.settings
        return JSON.stringify(opts.settings ?? {})
      }
      return '{}'
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Silence expected warnings in malformed/bad-type test cases so they don't
    // clutter the test output. Individual tests that want to inspect warn
    // behavior can override this spy.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('creates ~/.claude/settings.json with deny rule when file missing', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    mockReads({})

    ensureClaudeUserDenyRules()

    expect(mkdirSync).toHaveBeenCalledWith(join(homedir(), '.claude'), { recursive: true })
    expect(writeFileSync).toHaveBeenCalledTimes(1)
    expect(vi.mocked(writeFileSync).mock.calls[0][0]).toBe(USER_SETTINGS_PATH)

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.permissions.deny).toEqual([DENY_RULE])
  })

  it('preserves real-world user settings shape (env, allow list, status line, flags)', () => {
    const realShape = {
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
      permissions: {
        allow: [
          'Bash(*)',
          'Read',
          'Edit',
          'Write',
          'Glob',
          'Grep',
          'WebFetch',
          'WebSearch',
          'Skill',
          'Task',
          'NotebookEdit',
          'mcp__crane__*',
          'mcp__claude_ai_*',
        ],
      },
      statusLine: {
        type: 'command',
        command: 'bash /Users/scottdurgan/dev/crane-console/scripts/crane-statusline.sh',
      },
      effortLevel: 'high',
      fastMode: true,
    }
    vi.mocked(existsSync).mockReturnValue(true)
    mockReads({ settings: realShape })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)

    // All sibling keys preserved verbatim
    expect(written.env).toEqual(realShape.env)
    expect(written.statusLine).toEqual(realShape.statusLine)
    expect(written.effortLevel).toBe('high')
    expect(written.fastMode).toBe(true)

    // Allow list untouched
    expect(written.permissions.allow).toEqual(realShape.permissions.allow)

    // Deny rule added
    expect(written.permissions.deny).toEqual([DENY_RULE])
  })

  it('skips write when deny rule already present', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    mockReads({
      settings: { permissions: { allow: ['mcp__claude_ai_*'], deny: [DENY_RULE] } },
    })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('skips with warning when settings.json is malformed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(existsSync).mockReturnValue(true)
    mockReads({ settings: '{not json' })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('malformed'))
  })

  it('coerces string permissions.deny into an array', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    mockReads({
      settings: { permissions: { deny: 'some-preexisting-rule' } },
    })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.permissions.deny).toEqual(['some-preexisting-rule', DENY_RULE])
  })

  it('skips with warning when permissions.deny has unexpected type', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(existsSync).mockReturnValue(true)
    mockReads({ settings: { permissions: { deny: 42 } } })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unexpected type'))
  })

  it('wildcard rule supersedes narrower same-namespace entries', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    mockReads({
      settings: {
        permissions: {
          deny: [
            'mcp__claude_ai_crane_context__github_search_code',
            'mcp__claude_ai_crane_context__github_list_issues',
            'mcp__some_other_server__*',
          ],
        },
      },
    })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    // Narrower crane_context entries stripped; unrelated deny preserved; wildcard added.
    expect(written.permissions.deny).toEqual(['mcp__some_other_server__*', DENY_RULE])
  })

  it('creates permissions object when settings has unrelated top-level keys only', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    mockReads({ settings: { env: { FOO: 'bar' } } })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(written.env).toEqual({ FOO: 'bar' })
    expect(written.permissions.deny).toEqual([DENY_RULE])
  })

  it('is a no-op when config/claude-deny-rules.json is empty or missing', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    // Empty rules list => launcher has nothing to inject
    mockReads({ rules: [], settings: { permissions: { allow: ['mcp__claude_ai_*'] } } })

    ensureClaudeUserDenyRules()

    expect(writeFileSync).not.toHaveBeenCalled()
  })
})

describe('syncClaudeAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies new command files from crane-console to target repo', () => {
    // statSync returns different inodes so repos are different
    vi.mocked(statSync)
      .mockReturnValueOnce({ ino: 1 } as ReturnType<typeof statSync>)
      .mockReturnValueOnce({ ino: 2 } as ReturnType<typeof statSync>)

    // Source directories exist with .md files
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      if (s.includes('.claude/commands') && !s.endsWith('.md')) return true
      if (s.includes('.claude/agents') && !s.endsWith('.md')) return true
      return false // target files don't exist yet
    })

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.includes('.claude/commands'))
        return ['ship.md', 'sos.md'] as unknown as ReturnType<typeof readdirSync>
      if (s.includes('.claude/agents'))
        return ['sprint-worker.md'] as unknown as ReturnType<typeof readdirSync>
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    syncClaudeAssets('/fake/repo')

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.claude/commands'), {
      recursive: true,
    })
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.claude/agents'), {
      recursive: true,
    })
    expect(copyFileSync).toHaveBeenCalledTimes(3) // ship.md + sod.md + sprint-worker.md
  })

  it('skips files that are already identical', () => {
    vi.mocked(statSync)
      .mockReturnValueOnce({ ino: 1 } as ReturnType<typeof statSync>)
      .mockReturnValueOnce({ ino: 2 } as ReturnType<typeof statSync>)

    vi.mocked(existsSync).mockReturnValue(true)

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.includes('.claude/commands'))
        return ['ship.md'] as unknown as ReturnType<typeof readdirSync>
      if (s.includes('.claude/agents')) return [] as unknown as ReturnType<typeof readdirSync>
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    // Both source and target return same content
    vi.mocked(readFileSync).mockReturnValue('# same content')

    syncClaudeAssets('/fake/repo')

    expect(copyFileSync).not.toHaveBeenCalled()
  })

  it('skips sync when target is crane-console itself', () => {
    // Same inode = same directory
    vi.mocked(statSync).mockReturnValue({ ino: 999 } as ReturnType<typeof statSync>)

    syncClaudeAssets('/fake/repo')

    expect(copyFileSync).not.toHaveBeenCalled()
    expect(mkdirSync).not.toHaveBeenCalled()
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
