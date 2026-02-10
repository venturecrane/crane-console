/**
 * Tests for doc-audit.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mockVentures,
  mockDocAuditComplete,
  mockDocAuditIncomplete,
} from '../__fixtures__/api-responses.js'

vi.mock('../lib/repo-scanner.js')
vi.mock('../lib/doc-generator.js')

const getModule = async () => {
  vi.resetModules()
  return import('./doc-audit.js')
}

describe('doc-audit tool', () => {
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

  it('returns error when API key is missing', async () => {
    const { executeDocAudit } = await getModule()
    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeDocAudit({})

    expect(result.status).toBe('error')
    expect(result.message).toContain('CRANE_CONTEXT_KEY')
  })

  it('audits a specific venture', async () => {
    const { executeDocAudit } = await getModule()

    // Mock ventures fetch + audit fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audit: mockDocAuditComplete }),
    })

    const result = await executeDocAudit({ venture: 'vc' })

    expect(result.status).toBe('success')
    expect(result.message).toContain('Venture Crane')
    expect(result.message).toContain('Present')
    expect(result.message).toContain('vc-project-instructions.md')
  })

  it('shows missing docs in audit', async () => {
    const { executeDocAudit } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audit: mockDocAuditIncomplete }),
    })

    const result = await executeDocAudit({ venture: 'smd' })

    expect(result.status).toBe('success')
    expect(result.message).toContain('Missing')
    expect(result.message).toContain('smd-project-instructions.md')
    expect(result.message).toContain('[required]')
  })

  it('audits all ventures', async () => {
    const { executeDocAudit } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audits: [mockDocAuditComplete, mockDocAuditIncomplete] }),
    })

    const result = await executeDocAudit({ all: true })

    expect(result.status).toBe('success')
    expect(result.message).toContain('Venture Crane')
    expect(result.message).toContain('SMD Ventures')
  })

  it('handles API errors gracefully', async () => {
    const { executeDocAudit } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    const result = await executeDocAudit({ venture: 'vc' })

    expect(result.status).toBe('error')
    expect(result.message).toContain('failed')
  })

  it('fix mode generates and uploads missing docs', async () => {
    const { executeDocAudit } = await getModule()
    const { generateDoc } = await import('../lib/doc-generator.js')
    const { getCurrentRepoInfo, scanLocalRepos } = await import('../lib/repo-scanner.js')

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null)
    vi.mocked(scanLocalRepos).mockReturnValue([
      {
        path: '/Users/test/dev/smd-console',
        name: 'smd-console',
        remote: 'git@github.com:smd-ventures/smd-console.git',
        org: 'smd-ventures',
        repoName: 'smd-console',
      },
    ])
    vi.mocked(generateDoc).mockReturnValue({
      content: '# SMD Ventures — Project Instructions\n\nGenerated.',
      title: 'SMD Ventures — Project Instructions',
      sources_read: ['CLAUDE.md'],
    })

    // First call: audit fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audit: mockDocAuditIncomplete }),
    })

    // Second call: ventures fetch (for fix mode)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    })

    // Third call: upload doc
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        scope: 'smd',
        doc_name: 'smd-project-instructions.md',
        version: 1,
      }),
    })

    const result = await executeDocAudit({ venture: 'smd', fix: true })

    expect(result.status).toBe('success')
    expect(result.message).toContain('generated and uploaded')
  })
})
