/**
 * Tests for crane_secret_check.
 *
 * Critical assertion: the result MUST NEVER contain secretValue or secretComment.
 * That's the whole point of this tool — it's the leak-free positive surface for
 * "is this set?" queries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn().mockReturnThis(), kill: vi.fn() })),
}))

const getModule = async () => {
  vi.resetModules()
  return import('./secret-check.js')
}

describe('crane_secret_check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('projects keys only — never returns secretValue', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(
      JSON.stringify([
        { secretKey: 'TELEGRAM_BOT_TOKEN', secretValue: '1234567:ZZZZZZZZZZZZZZ' },
        { secretKey: 'TELEGRAM_ALLOWED_USERS', secretValue: '7367659986' },
      ])
    )

    const result = await executeSecretCheck({
      path: '/ss/ai-employee/customer-zero/telegram',
      env: 'prod',
      includeImports: false,
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('TELEGRAM_BOT_TOKEN')
    expect(result.message).toContain('TELEGRAM_ALLOWED_USERS')
    // The critical guarantee: no value content of any kind in the result.
    expect(result.message).not.toContain('1234567:')
    expect(result.message).not.toContain('ZZZZZZZZZZZZZZ')
    expect(result.message).not.toContain('7367659986')
    expect(result.message).not.toContain('secretValue')
  })

  it('strips secretComment defensively — comments may hold value-like content', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(
      JSON.stringify([
        {
          secretKey: 'API_KEY',
          secretValue: 'sk-abcdef',
          secretComment: 'fallback secret: sk-FALLBACK-9876543210',
        },
      ])
    )

    const result = await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      includeImports: false,
    })

    expect(result.message).toContain('API_KEY')
    expect(result.message).not.toContain('sk-FALLBACK')
    expect(result.message).not.toContain('fallback secret')
    expect(result.message).not.toContain('secretComment')
  })

  it('splits names into present and missing', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(
      JSON.stringify([
        { secretKey: 'API_KEY', secretValue: 'redacted' },
        { secretKey: 'DB_URL', secretValue: 'redacted' },
      ])
    )

    const result = await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      names: ['API_KEY', 'MISSING_ONE', 'DB_URL'],
      includeImports: false,
    })

    expect(result.success).toBe(true)
    expect(result.message).toMatch(/Present:.*API_KEY/)
    expect(result.message).toMatch(/Present:.*DB_URL/)
    expect(result.message).toMatch(/Missing:.*MISSING_ONE/)
  })

  it('treats empty-value secrets as present (key exists)', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(
      JSON.stringify([{ secretKey: 'EMPTY_KEY', secretValue: '' }])
    )

    const result = await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      names: ['EMPTY_KEY'],
      includeImports: false,
    })

    expect(result.message).toMatch(/Present:.*EMPTY_KEY/)
    expect(result.message).toMatch(/Missing:.*\(none\)/)
  })

  it('reports all missing when no secrets at path', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(JSON.stringify([]))

    const result = await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      names: ['A', 'B'],
      includeImports: false,
    })

    expect(result.message).toMatch(/Present:.*\(none\)/)
    expect(result.message).toMatch(/Missing:.*A.*B/)
  })

  it('handles the { secrets: [...] } envelope shape', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(
      JSON.stringify({
        secrets: [{ secretKey: 'WRAPPED_KEY', secretValue: 'wrapped-val' }],
      })
    )

    const result = await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      includeImports: false,
    })

    expect(result.message).toContain('WRAPPED_KEY')
    expect(result.message).not.toContain('wrapped-val')
  })

  it('passes --include-imports=false by default', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(JSON.stringify([]))

    await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      includeImports: false,
    })

    const calledWith = vi.mocked(execSync).mock.calls[0][0] as string
    expect(calledWith).toContain('--include-imports=false')
  })

  it('passes --include-imports=true when caller opts in', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(JSON.stringify([]))

    await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      includeImports: true,
    })

    const calledWith = vi.mocked(execSync).mock.calls[0][0] as string
    expect(calledWith).toContain('--include-imports=true')
  })

  it('returns failure on CLI error', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('infisical: not found')
    })

    const result = await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      includeImports: false,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('infisical CLI call failed')
  })

  it('returns failure on malformed JSON output', async () => {
    const { execSync } = await import('node:child_process')
    const { executeSecretCheck } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce('not json')

    const result = await executeSecretCheck({
      path: '/vc',
      env: 'prod',
      includeImports: false,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('JSON parse failed')
  })
})

describe('crane_secret_check — input validation', () => {
  it('rejects path with shell metacharacters', async () => {
    const { secretCheckInputSchema } = await getModule()
    const cases = ['/vc; rm', '/vc && evil', '/vc$(whoami)', '/vc`id`', '/vc|cat /etc/passwd']
    for (const path of cases) {
      expect(() => secretCheckInputSchema.parse({ path, env: 'prod' })).toThrow()
    }
  })

  it('rejects env with shell metacharacters', async () => {
    const { secretCheckInputSchema } = await getModule()
    expect(() => secretCheckInputSchema.parse({ path: '/vc', env: 'prod; rm' })).toThrow()
    expect(() => secretCheckInputSchema.parse({ path: '/vc', env: 'prod$(x)' })).toThrow()
  })

  it('rejects name with shell metacharacters', async () => {
    const { secretCheckInputSchema } = await getModule()
    expect(() =>
      secretCheckInputSchema.parse({
        path: '/vc',
        env: 'prod',
        names: ['VALID_KEY', 'INVALID;NAME'],
      })
    ).toThrow()
  })

  it('accepts canonical inputs', async () => {
    const { secretCheckInputSchema } = await getModule()
    expect(() =>
      secretCheckInputSchema.parse({
        path: '/ss/ai-employee/customer-zero/telegram',
        env: 'prod',
        names: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USERS'],
      })
    ).not.toThrow()
  })
})
