/**
 * Tests for doc.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockDocGetResponse } from '../__fixtures__/api-responses.js'

const getModule = async () => {
  vi.resetModules()
  return import('./doc.js')
}

describe('doc tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' }
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns doc content on success', async () => {
    const { executeDoc } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ doc: mockDocGetResponse }),
    })

    const result = await executeDoc({ scope: 'vc', doc_name: 'vc-project-instructions.md' })

    expect(result.success).toBe(true)
    expect(result.message).toContain('VC Project Instructions')
    expect(result.message).toContain('v1')
    expect(result.message).toContain('Test content...')
  })

  it('returns not found message on 404', async () => {
    const { executeDoc } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const result = await executeDoc({ scope: 'vc', doc_name: 'nonexistent.md' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Document not found')
    expect(result.message).toContain('vc/nonexistent.md')
  })

  it('returns error when API key missing', async () => {
    delete process.env.CRANE_CONTEXT_KEY

    const { executeDoc } = await getModule()

    const result = await executeDoc({ scope: 'vc', doc_name: 'test.md' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY')
  })

  it('returns error on server failure', async () => {
    const { executeDoc } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await executeDoc({ scope: 'vc', doc_name: 'test.md' })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to fetch document')
  })
})
