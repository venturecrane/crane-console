/**
 * Tests for rejected-GitHub-token handling in the launcher.
 *
 * Background: a revoked classic PAT sat in Infisical at every venture path and
 * was injected into every agent session. Because GH_TOKEN outranks the keyring
 * inside gh, it did not merely fail — it shadowed a working `gh auth login`,
 * so `gh` broke on machines whose keyring auth was fine. checkGhAuth() reported
 * "authenticated" throughout, because it tested presence rather than validity.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

import { execSync } from 'node:child_process'

/** Make the next curl probe report a given HTTP status, or throw. */
function mockProbe(status: string | Error) {
  vi.mocked(execSync).mockImplementation(() => {
    if (status instanceof Error) throw status
    return status
  })
}

describe('validateGithubToken', () => {
  it('reports a token GitHub accepts as valid', async () => {
    const { validateGithubToken } = await import('../lib/github.js')
    mockProbe('200')

    expect(validateGithubToken('ghp_live')).toBe('valid')
  })

  it('reports a 401 as invalid', async () => {
    const { validateGithubToken } = await import('../lib/github.js')
    mockProbe('401')

    expect(validateGithubToken('ghp_revoked')).toBe('invalid')
  })

  it('reports a 403 as unknown, not invalid', async () => {
    const { validateGithubToken } = await import('../lib/github.js')
    mockProbe('403')

    // 403 is a live token missing a scope. Dropping it would not fix that, and
    // would throw away a credential that still authenticates.
    expect(validateGithubToken('ghp_underscoped')).toBe('unknown')
  })

  it('reports a network failure as unknown so callers fail open', async () => {
    const { validateGithubToken } = await import('../lib/github.js')
    mockProbe(new Error('curl: (6) Could not resolve host'))

    expect(validateGithubToken('ghp_whatever')).toBe('unknown')
  })

  it('never interpolates the token into the command string', async () => {
    const { validateGithubToken } = await import('../lib/github.js')
    mockProbe('200')

    validateGithubToken('ghp_supersecret')

    const [command, options] = vi.mocked(execSync).mock.calls[0]
    // The value must travel by environment, or it lands in `ps` output and in
    // any transcript that echoes the command.
    expect(String(command)).not.toContain('ghp_supersecret')
    expect((options as { env: Record<string, string> }).env.CRANE_TOKEN_UNDER_TEST).toBe(
      'ghp_supersecret'
    )
  })
})

describe('stripRejectedGithubTokens', () => {
  it('drops a rejected GH_TOKEN so keyring auth is not shadowed', async () => {
    const { stripRejectedGithubTokens } = await import('./launch-lib.js')
    mockProbe('401')

    const result = stripRejectedGithubTokens({ GH_TOKEN: 'ghp_revoked', OTHER: 'keep' })

    expect(result.secrets).not.toHaveProperty('GH_TOKEN')
    expect(result.secrets.OTHER).toBe('keep')
    expect(result.dropped).toContain('GH_TOKEN')
  })

  it('drops NODE_AUTH_TOKEN too — the same dead PAT backs GitHub Packages', async () => {
    const { stripRejectedGithubTokens } = await import('./launch-lib.js')
    mockProbe('401')

    const result = stripRejectedGithubTokens({ NODE_AUTH_TOKEN: 'ghp_revoked' })

    expect(result.dropped).toContain('NODE_AUTH_TOKEN')
  })

  it('keeps a valid token untouched', async () => {
    const { stripRejectedGithubTokens } = await import('./launch-lib.js')
    mockProbe('200')

    const result = stripRejectedGithubTokens({ GH_TOKEN: 'ghp_live' })

    expect(result.secrets.GH_TOKEN).toBe('ghp_live')
    expect(result.dropped).toEqual([])
  })

  it('keeps the token when the API is unreachable', async () => {
    const { stripRejectedGithubTokens } = await import('./launch-lib.js')
    mockProbe(new Error('offline'))

    // An offline launch must behave exactly as it does today. Treating an
    // unreachable API as a bad credential would break every flight-mode session.
    const result = stripRejectedGithubTokens({ GH_TOKEN: 'ghp_live' })

    expect(result.secrets.GH_TOKEN).toBe('ghp_live')
    expect(result.dropped).toEqual([])
  })
})

describe('buildChildEnv GitHub token clearing', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('clears an inherited rejected token that secrets alone would not remove', async () => {
    const { buildChildEnv } = await import('./launch-lib.js')
    mockProbe('401')

    // A nested launch inherits GH_TOKEN in process.env. buildChildEnv spreads
    // process.env first, so deleting the key from `secrets` is not enough —
    // the spread would put the dead token straight back.
    process.env.GH_TOKEN = 'ghp_revoked'

    const env = buildChildEnv(
      { GH_TOKEN: 'ghp_revoked' },
      {},
      {
        code: 'vc',
        name: 'Venture Crane',
        repoName: 'crane-console',
      }
    )

    // Node omits undefined entries from a child environment.
    expect(env.GH_TOKEN).toBeUndefined()
  })

  it('passes a valid inherited token through', async () => {
    const { buildChildEnv } = await import('./launch-lib.js')
    mockProbe('200')

    process.env.GH_TOKEN = 'ghp_live'

    const env = buildChildEnv(
      { GH_TOKEN: 'ghp_live' },
      {},
      {
        code: 'vc',
        name: 'Venture Crane',
        repoName: 'crane-console',
      }
    )

    expect(env.GH_TOKEN).toBe('ghp_live')
  })
})
