/**
 * Tests for crane_secret_set.
 *
 * Critical assertion: the result MUST NEVER contain the secret value — not on
 * success (only a masked confirmation + char count), and not on failure (any
 * child-process output is redacted). The value is read server-side and never
 * crosses the agent's context boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
  unlinkSync: vi.fn(),
}))

const getModule = async () => {
  vi.resetModules()
  return import('./secret-set.js')
}

const ret = (o: Record<string, unknown>): any => o

describe('crane_secret_set', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads clipboard, writes to infisical, returns a masked confirmation', async () => {
    const { spawnSync } = await import('node:child_process')
    const { executeSecretSet } = await getModule()
    const VALUE = 'sk-elevenlabs-deadbeef-secret'

    vi.mocked(spawnSync).mockImplementation((cmd: string) =>
      cmd === 'pbpaste'
        ? ret({ status: 0, stdout: VALUE, stderr: '' })
        : ret({ status: 0, stdout: 'created', stderr: '' })
    )

    const result = await executeSecretSet({
      path: '/vc',
      env: 'prod',
      name: 'ELEVENLABS_API_KEY',
      source: 'clipboard',
      deleteSource: true,
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('ELEVENLABS_API_KEY')
    expect(result.message).toContain(`${VALUE.length} chars`)
    // The whole point: the value never appears in the result.
    expect(result.message).not.toContain(VALUE)

    // infisical was called with the KEY=VALUE arg (correct wiring).
    const infisicalCall = vi.mocked(spawnSync).mock.calls.find((c) => c[0] !== 'pbpaste')
    expect(infisicalCall).toBeDefined()
    expect(infisicalCall?.[1]).toContain('set')
    expect(infisicalCall?.[1]).toContain(`ELEVENLABS_API_KEY=${VALUE}`)
    expect(infisicalCall?.[1]).toEqual(expect.arrayContaining(['--path', '/vc', '--env', 'prod']))
  })

  it('reads from a file and shreds it after a successful write', async () => {
    const { spawnSync } = await import('node:child_process')
    const { readFileSync, unlinkSync } = await import('node:fs')
    const { executeSecretSet } = await getModule()

    vi.mocked(readFileSync).mockReturnValue('file-held-secret\n')
    vi.mocked(spawnSync).mockReturnValue(ret({ status: 0, stdout: 'ok', stderr: '' }))

    const result = await executeSecretSet({
      path: '/vc',
      env: 'prod',
      name: 'GH_PRIVATE_KEY_PEM',
      source: 'file',
      file: '/tmp/secret-inbox',
      deleteSource: true,
    })

    expect(result.success).toBe(true)
    // trailing newline stripped -> 16 chars
    expect(result.message).toContain('16 chars')
    expect(result.message).not.toContain('file-held-secret')
    expect(vi.mocked(unlinkSync)).toHaveBeenCalledWith('/tmp/secret-inbox')
    expect(result.message).toContain('source file deleted')
  })

  it('stores nothing when the clipboard is empty', async () => {
    const { spawnSync } = await import('node:child_process')
    const { executeSecretSet } = await getModule()

    vi.mocked(spawnSync).mockImplementation((cmd: string) =>
      cmd === 'pbpaste' ? ret({ status: 0, stdout: '', stderr: '' }) : ret({ status: 0 })
    )

    const result = await executeSecretSet({
      path: '/vc',
      env: 'prod',
      name: 'API_KEY',
      source: 'clipboard',
      deleteSource: true,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Nothing stored')
    // Only pbpaste ran; infisical was never invoked.
    expect(vi.mocked(spawnSync).mock.calls.every((c) => c[0] === 'pbpaste')).toBe(true)
  })

  it('redacts the value from infisical error output', async () => {
    const { spawnSync } = await import('node:child_process')
    const { executeSecretSet } = await getModule()
    const VALUE = 'leakme-supersecret-1234'

    vi.mocked(spawnSync).mockImplementation((cmd: string) =>
      cmd === 'pbpaste'
        ? ret({ status: 0, stdout: VALUE, stderr: '' })
        : ret({ status: 1, stdout: '', stderr: `failed to set ${VALUE} at /vc` })
    )

    const result = await executeSecretSet({
      path: '/vc',
      env: 'prod',
      name: 'API_KEY',
      source: 'clipboard',
      deleteSource: true,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('exited 1')
    expect(result.message).not.toContain(VALUE)
    expect(result.message).toContain('***')
  })
})

describe('crane_secret_set — input validation', () => {
  it('rejects bad key names and paths', async () => {
    const { secretSetInputSchema } = await getModule()
    expect(() =>
      secretSetInputSchema.parse({ path: '/vc', env: 'prod', name: 'bad name' })
    ).toThrow()
    expect(() =>
      secretSetInputSchema.parse({ path: '/vc; rm', env: 'prod', name: 'API_KEY' })
    ).toThrow()
  })

  it('requires an absolute file path when source=file', async () => {
    const { secretSetInputSchema } = await getModule()
    expect(() =>
      secretSetInputSchema.parse({ path: '/vc', env: 'prod', name: 'API_KEY', source: 'file' })
    ).toThrow()
    expect(() =>
      secretSetInputSchema.parse({
        path: '/vc',
        env: 'prod',
        name: 'API_KEY',
        source: 'file',
        file: 'relative/path',
      })
    ).toThrow()
  })

  it('accepts canonical clipboard input', async () => {
    const { secretSetInputSchema } = await getModule()
    expect(() =>
      secretSetInputSchema.parse({ path: '/vc', env: 'prod', name: 'ELEVENLABS_API_KEY' })
    ).not.toThrow()
  })
})
