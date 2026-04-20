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
    // Return valid ventures.json for INFISICAL_PATHS derivation and resolveVentureCodeFromPath.
    // Must include ALL known venture codes so scope-matching tests work correctly —
    // venturesConfig is loaded at module init time and never re-read.
    if (String(filePath).includes('ventures.json')) {
      return JSON.stringify({
        ventures: [
          { code: 'vc' },
          { code: 'ke' },
          { code: 'sc' },
          { code: 'dfg' },
          { code: 'ss' },
          { code: 'dc' },
        ],
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
  syncGlobalSkills,
  syncVentureSkills,
  parseSkillScope,
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
  'NODE_AUTH_TOKEN',
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
            NODE_AUTH_TOKEN: '$NODE_AUTH_TOKEN',
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

    // Source matches target — no write expected
    expect(writeFileSync).not.toHaveBeenCalled()
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

describe('syncGlobalSkills', () => {
  // Build a Dirent-like object for the { withFileTypes: true } code path.
  type Dirent = { name: string; isDirectory: () => boolean; isFile: () => boolean }
  const dirent = (name: string, isDir: boolean): Dirent => ({
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is a no-op when config/global-skills.json is missing', () => {
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('global-skills.json')) {
        throw new Error('ENOENT')
      }
      return '[]'
    })

    syncGlobalSkills()

    expect(copyFileSync).not.toHaveBeenCalled()
    expect(mkdirSync).not.toHaveBeenCalled()
  })

  it('is a no-op when config is malformed JSON', () => {
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('global-skills.json')) return 'not json {{'
      return '[]'
    })

    syncGlobalSkills()

    expect(copyFileSync).not.toHaveBeenCalled()
  })

  it('copies new skill files from source to home directory', () => {
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('global-skills.json')) return JSON.stringify(['nav-spec'])
      return 'source content'
    })

    // source dir exists; home target files do not
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      // Source nav-spec directory exists
      if (s.endsWith('/.agents/skills/nav-spec')) return true
      // Target files in ~/.agents/skills do not exist yet
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills/nav-spec')) {
        return [dirent('SKILL.md', false), dirent('validate.py', false)] as unknown as ReturnType<
          typeof readdirSync
        >
      }
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    syncGlobalSkills()

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/.agents/skills/nav-spec'), {
      recursive: true,
    })
    expect(copyFileSync).toHaveBeenCalledTimes(2)
  })

  it('skips files that are already identical', () => {
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('global-skills.json')) return JSON.stringify(['nav-spec'])
      return 'same content' // both source and target return this
    })

    vi.mocked(existsSync).mockReturnValue(true) // everything exists

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills/nav-spec')) {
        return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
      }
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    syncGlobalSkills()

    expect(copyFileSync).not.toHaveBeenCalled()
  })

  it('recursively copies nested skill subdirectories', () => {
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('global-skills.json')) return JSON.stringify(['nav-spec'])
      return 'content'
    })

    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      // Source dirs exist
      if (s.endsWith('/.agents/skills/nav-spec')) return true
      if (s.endsWith('/.agents/skills/nav-spec/workflows')) return true
      // Target files do not
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills/nav-spec')) {
        return [dirent('SKILL.md', false), dirent('workflows', true)] as unknown as ReturnType<
          typeof readdirSync
        >
      }
      if (s.endsWith('/.agents/skills/nav-spec/workflows')) {
        return [dirent('author.md', false), dirent('audit.md', false)] as unknown as ReturnType<
          typeof readdirSync
        >
      }
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    syncGlobalSkills()

    // Top-level + nested subdir both get mkdir
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/.agents/skills/nav-spec'), {
      recursive: true,
    })
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('/.agents/skills/nav-spec/workflows'),
      { recursive: true }
    )
    // SKILL.md + 2 workflow files = 3 copies
    expect(copyFileSync).toHaveBeenCalledTimes(3)
  })

  it('skips a listed skill whose source directory is missing', () => {
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('global-skills.json')) return JSON.stringify(['ghost-skill'])
      return ''
    })

    vi.mocked(existsSync).mockReturnValue(false)

    syncGlobalSkills()

    expect(copyFileSync).not.toHaveBeenCalled()
    expect(mkdirSync).not.toHaveBeenCalled()
  })

  it('processes multiple skills from config', () => {
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('global-skills.json'))
        return JSON.stringify(['nav-spec', 'product-design'])
      return 'content'
    })

    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills/nav-spec')) return true
      if (s.endsWith('/.agents/skills/product-design')) return true
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills/nav-spec')) {
        return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
      }
      if (s.endsWith('/.agents/skills/product-design')) {
        return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
      }
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    syncGlobalSkills()

    expect(copyFileSync).toHaveBeenCalledTimes(2)
  })
})

describe('parseSkillScope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns scope value for bare frontmatter', () => {
    vi.mocked(readFileSync).mockReturnValue('---\nname: test\nscope: enterprise\n---\n# body')
    expect(parseSkillScope('/fake/SKILL.md')).toBe('enterprise')
  })

  it('returns scope value for quoted frontmatter', () => {
    vi.mocked(readFileSync).mockReturnValue('---\nscope: "venture:ss"\n---\n')
    expect(parseSkillScope('/fake/SKILL.md')).toBe('venture:ss')
  })

  it('returns scope value for global scope', () => {
    vi.mocked(readFileSync).mockReturnValue('---\nscope: global\n---\n')
    expect(parseSkillScope('/fake/SKILL.md')).toBe('global')
  })

  it('returns null when scope field is absent', () => {
    vi.mocked(readFileSync).mockReturnValue('---\nname: test\n---\n')
    expect(parseSkillScope('/fake/SKILL.md')).toBeNull()
  })

  it('returns null when no frontmatter block present', () => {
    vi.mocked(readFileSync).mockReturnValue('# Just a markdown file\n')
    expect(parseSkillScope('/fake/SKILL.md')).toBeNull()
  })

  it('returns null when file is unreadable', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(parseSkillScope('/nonexistent/SKILL.md')).toBeNull()
  })
})

describe('syncVentureSkills', () => {
  // Build a Dirent-like object for the { withFileTypes: true } code path.
  type Dirent = { name: string; isDirectory: () => boolean; isFile: () => boolean }
  const dirent = (name: string, isDir: boolean): Dirent => ({
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: source skills root exists
    vi.mocked(existsSync).mockImplementation((p) => {
      return String(p).endsWith('.agents/skills')
    })
    // Default: statSync returns distinct inodes (source != target)
    vi.mocked(statSync)
      .mockReturnValueOnce({ ino: 1 } as ReturnType<typeof statSync>) // repoPath
      .mockReturnValueOnce({ ino: 2 } as ReturnType<typeof statSync>) // CRANE_CONSOLE_ROOT
    // Default: readFileSync returns ventures.json for module init;
    // individual tests override as needed
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [
            { code: 'vc' },
            { code: 'ke' },
            { code: 'ss' },
            { code: 'sc' },
            { code: 'dc' },
            { code: 'dfg' },
          ],
        })
      }
      return '{}'
    })
  })

  it('skips when target is crane-console itself (same inode)', () => {
    vi.mocked(statSync).mockReturnValue({ ino: 999 } as ReturnType<typeof statSync>)
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>)

    syncVentureSkills('/some/path/crane-console')

    expect(copyFileSync).not.toHaveBeenCalled()
    expect(mkdirSync).not.toHaveBeenCalled()
  })

  it('skips when source .agents/skills root does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    syncVentureSkills('/some/path/ke-console')

    expect(copyFileSync).not.toHaveBeenCalled()
    expect(mkdirSync).not.toHaveBeenCalled()
  })

  it('copies all enterprise skills on a fresh venture with no local skills', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      // Source root and skill dirs exist
      if (s.includes('crane-console') && s.includes('.agents/skills')) return true
      // Target files do not exist yet
      return false
    })

    // Source root lists two skills
    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills')) {
        return [dirent('sos', true), dirent('ship', true)] as unknown as ReturnType<
          typeof readdirSync
        >
      }
      if (s.endsWith('/sos') || s.endsWith('/ship')) {
        return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
      }
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('ventures.json')) {
        return JSON.stringify({
          ventures: [{ code: 'ke' }, { code: 'ss' }],
        })
      }
      // SKILL.md for each skill: enterprise scope
      return '---\nscope: enterprise\n---\n'
    })

    syncVentureSkills('/home/user/ke-console')

    // Both skills copied
    expect(copyFileSync).toHaveBeenCalledTimes(2)
  })

  it('skips scope: venture:<other-code> skills', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      if (s.includes('.agents/skills')) return true
      return false
    })

    // Source root has one venture-scoped skill for 'ss', but we are syncing to 'ke'
    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills')) {
        return [dirent('ss-only-skill', true)] as unknown as ReturnType<typeof readdirSync>
      }
      return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
    })

    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('ventures.json')) {
        return JSON.stringify({ ventures: [{ code: 'ke' }, { code: 'ss' }] })
      }
      // skill scoped to ss
      return '---\nscope: "venture:ss"\n---\n'
    })

    syncVentureSkills('/home/user/ke-console')

    // ss-specific skill not copied to ke
    expect(copyFileSync).not.toHaveBeenCalled()
  })

  it('syncs scope: venture:<this-code> skills to the matching venture', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      // Source skill directories exist; target files do NOT (fresh venture)
      if (s.includes('crane-console') && s.includes('.agents/skills')) return true
      if (
        s.endsWith('/ss-console/.agents/skills') ||
        s.endsWith('/ss-console/.agents/skills/ss-special')
      )
        return true
      // Target SKILL.md does not exist yet
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills')) {
        return [dirent('ss-special', true)] as unknown as ReturnType<typeof readdirSync>
      }
      return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
    })

    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('ventures.json')) {
        return JSON.stringify({ ventures: [{ code: 'ke' }, { code: 'ss' }] })
      }
      // skill scoped to ss — same as target venture
      return '---\nscope: "venture:ss"\n---\n'
    })

    syncVentureSkills('/home/user/ss-console')

    // ss-scoped skill IS copied to ss-console
    expect(copyFileSync).toHaveBeenCalledTimes(1)
  })

  it('skips identical files (content compare)', () => {
    vi.mocked(existsSync).mockReturnValue(true) // source and target both exist

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills')) {
        return [dirent('sos', true)] as unknown as ReturnType<typeof readdirSync>
      }
      if (s.endsWith('/sos')) {
        return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
      }
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    // Both source and target read the same content
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('ventures.json')) {
        return JSON.stringify({ ventures: [{ code: 'ke' }] })
      }
      return '---\nscope: enterprise\n---\n# identical'
    })

    syncVentureSkills('/home/user/ke-console')

    // File exists in target with identical content — no copy
    expect(copyFileSync).not.toHaveBeenCalled()
  })

  it('overwrites stale files (source wins)', () => {
    // Target exists but with different content
    vi.mocked(existsSync).mockImplementation((p) => {
      return true // everything exists
    })

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills')) {
        return [dirent('sos', true)] as unknown as ReturnType<typeof readdirSync>
      }
      if (s.endsWith('/sos')) {
        return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
      }
      return [] as unknown as ReturnType<typeof readdirSync>
    })

    let callCount = 0
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('ventures.json')) {
        return JSON.stringify({ ventures: [{ code: 'ke' }] })
      }
      callCount++
      // Alternate content: first read = source, second read = stale target
      return callCount % 2 === 1
        ? '---\nscope: enterprise\n---\n# updated content'
        : '---\nscope: enterprise\n---\n# old content'
    })

    syncVentureSkills('/home/user/ke-console')

    // Stale target overwritten
    expect(copyFileSync).toHaveBeenCalledTimes(1)
  })

  it('skips venture-scoped skills when venture code cannot be resolved', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      if (s.includes('.agents/skills')) return true
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('/.agents/skills')) {
        return [dirent('mystery-skill', true)] as unknown as ReturnType<typeof readdirSync>
      }
      return [dirent('SKILL.md', false)] as unknown as ReturnType<typeof readdirSync>
    })

    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('ventures.json')) {
        return JSON.stringify({ ventures: [{ code: 'ke' }] })
      }
      return '---\nscope: "venture:xx"\n---\n'
    })

    // repoPath doesn't match any known venture pattern
    syncVentureSkills('/home/user/unknown-repo')

    // venture-scoped skill skipped (unknown venture code)
    expect(copyFileSync).not.toHaveBeenCalled()
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
