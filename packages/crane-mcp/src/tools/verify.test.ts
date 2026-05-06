/**
 * Tests for crane_verify and crane_claim_origin.
 *
 * Coverage:
 *   - Zod refinements: command required for fresh_process/live_state,
 *     vendor_docs minimum output, oversize output rejection
 *   - Best-effort error handling: missing CRANE_CONTEXT_KEY, API failures
 *   - executeVerify happy path returns verify_id
 *   - executeClaimOrigin formats results
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/crane-api.js', () => {
  const mockApi = {
    recordVerification: vi.fn(),
    getClaimOrigin: vi.fn(),
  }
  function MockCraneApi() {
    return mockApi
  }
  return {
    CraneApi: MockCraneApi,
    _mockApi: mockApi,
  }
})

vi.mock('../lib/config.js', () => ({ getApiBase: () => 'https://api.example.com' }))

beforeEach(() => {
  process.env.CRANE_CONTEXT_KEY = 'test-key'
})

// ----------------------------------------------------------------------------
// Zod refinements (integrity bindings)
// ----------------------------------------------------------------------------

describe('verifyInputSchema integrity bindings', () => {
  it('rejects fresh_process without command', async () => {
    const { verifyInputSchema } = await import('./verify.js')
    const result = verifyInputSchema.safeParse({
      method: 'fresh_process',
      claim: 'main is green',
      output: 'ok',
      tool_used: 'Bash',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('command is required')
    }
  })

  it('rejects live_state without command', async () => {
    const { verifyInputSchema } = await import('./verify.js')
    const result = verifyInputSchema.safeParse({
      method: 'live_state',
      claim: 'PR 100 is merged',
      output: 'merged',
      tool_used: 'gh_api',
    })
    expect(result.success).toBe(false)
  })

  it('accepts vendor_docs without command (command is optional for vendor_docs)', async () => {
    const { verifyInputSchema } = await import('./verify.js')
    const longOutput = 'x'.repeat(150)
    const result = verifyInputSchema.safeParse({
      method: 'vendor_docs',
      claim: 'AI SDK supports streaming',
      output: longOutput,
      tool_used: 'Context7',
    })
    expect(result.success).toBe(true)
  })

  it('rejects vendor_docs with output shorter than minimum', async () => {
    const { verifyInputSchema } = await import('./verify.js')
    const result = verifyInputSchema.safeParse({
      method: 'vendor_docs',
      claim: 'I read the docs',
      output: 'ok',
      tool_used: 'Context7',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('output.length >=')
    }
  })

  it('rejects oversize output with head_tail guidance', async () => {
    const { verifyInputSchema } = await import('./verify.js')
    const huge = 'a'.repeat(8 * 1024 + 1)
    const result = verifyInputSchema.safeParse({
      method: 'fresh_process',
      claim: 'tests passed',
      output: huge,
      command: 'npm test',
      tool_used: 'Bash',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('head_tail')
    }
  })

  it('rejects non-enum tool_used', async () => {
    const { verifyInputSchema } = await import('./verify.js')
    const result = verifyInputSchema.safeParse({
      method: 'live_state',
      claim: 'x',
      output: 'y',
      command: 'gh api',
      tool_used: 'random_thing',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a fully-formed live_state record', async () => {
    const { verifyInputSchema } = await import('./verify.js')
    const result = verifyInputSchema.safeParse({
      method: 'live_state',
      claim: 'PR 100 is merged',
      output: '{"state":"merged","mergedAt":"2026-05-06T17:00:00Z"}',
      tool_used: 'gh_api',
      command: 'gh pr view 100 --json state,mergedAt',
      files_touched: ['packages/crane-mcp/src/index.ts'],
    })
    expect(result.success).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// executeVerify
// ----------------------------------------------------------------------------

describe('executeVerify', () => {
  it('returns warning when CRANE_CONTEXT_KEY is missing', async () => {
    delete process.env.CRANE_CONTEXT_KEY
    const { executeVerify } = await import('./verify.js')
    const result = await executeVerify({
      method: 'fresh_process',
      claim: 'test',
      output: 'ok',
      command: 'echo ok',
      tool_used: 'Bash',
    })
    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not set')
  })

  it('returns verify_id on happy path', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { recordVerification: ReturnType<typeof vi.fn> }
    }
    _mockApi.recordVerification.mockResolvedValueOnce({
      id: 'vfy_01HQXVABCDEFGHIJK',
      method: 'fresh_process',
      source: 'tool',
      redacted: false,
      output_truncation: 'none',
      files_touched: [],
    })

    const { executeVerify } = await import('./verify.js')
    const result = await executeVerify({
      method: 'fresh_process',
      claim: 'test',
      output: 'ok',
      command: 'echo ok',
      tool_used: 'Bash',
    })

    expect(result.success).toBe(true)
    expect(result.verify_id).toBe('vfy_01HQXVABCDEFGHIJK')
    expect(result.message).toContain('vfy_')
  })

  it('surfaces redacted flag in success message when scrubber fired', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { recordVerification: ReturnType<typeof vi.fn> }
    }
    _mockApi.recordVerification.mockResolvedValueOnce({
      id: 'vfy_AAA',
      method: 'fresh_process',
      source: 'tool',
      redacted: true,
      output_truncation: 'none',
      files_touched: [],
    })

    const { executeVerify } = await import('./verify.js')
    const result = await executeVerify({
      method: 'fresh_process',
      claim: 'env dump',
      output: 'API_KEY=hunter2',
      command: 'env',
      tool_used: 'Bash',
    })
    expect(result.success).toBe(true)
    expect(result.redacted).toBe(true)
    expect(result.message).toContain('secrets masked')
  })

  it('returns success:false on API failure (best-effort, never throws)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { recordVerification: ReturnType<typeof vi.fn> }
    }
    _mockApi.recordVerification.mockRejectedValueOnce(new Error('Worker 500'))

    const { executeVerify } = await import('./verify.js')
    const result = await executeVerify({
      method: 'fresh_process',
      claim: 'test',
      output: 'ok',
      command: 'echo ok',
      tool_used: 'Bash',
    })
    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to record verification')
  })
})

// ----------------------------------------------------------------------------
// executeClaimOrigin
// ----------------------------------------------------------------------------

describe('executeClaimOrigin formatter', () => {
  it('renders empty-state message when no claims found', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getClaimOrigin: ReturnType<typeof vi.fn> }
    }
    _mockApi.getClaimOrigin.mockResolvedValueOnce({
      file: 'src/foo.ts',
      since: '2026-02-05T00:00:00Z',
      limit: 50,
      claims: [],
    })

    const { executeClaimOrigin } = await import('./verify.js')
    const result = await executeClaimOrigin({ file: 'src/foo.ts' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('No prior claims')
  })

  it('formats prior claims with verify_id and method', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getClaimOrigin: ReturnType<typeof vi.fn> }
    }
    _mockApi.getClaimOrigin.mockResolvedValueOnce({
      file: 'src/foo.ts',
      since: '2026-02-05T00:00:00Z',
      limit: 50,
      claims: [
        {
          verify_id: 'vfy_AAA',
          session_id: 'sess_BBB',
          claim: 'foo() returns the cached value',
          method: 'fresh_process',
          ts: '2026-04-15T10:00:00Z',
          files_touched: ['src/foo.ts'],
        },
      ],
    })

    const { executeClaimOrigin } = await import('./verify.js')
    const result = await executeClaimOrigin({ file: 'src/foo.ts' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('vfy_AAA')
    expect(result.message).toContain('fresh_process')
    expect(result.message).toContain('foo() returns the cached value')
  })
})
