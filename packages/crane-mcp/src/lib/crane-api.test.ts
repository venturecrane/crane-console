/**
 * Tests for crane-api.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mockVenturesResponse,
  mockVentures,
  mockSodResponse,
  mockDocGetResponse,
} from '../__fixtures__/api-responses.js'

const PROD_URL = 'https://crane-context.automation-ab6.workers.dev'
const STAGING_URL = 'https://crane-context-staging.automation-ab6.workers.dev'

// Reset modules to clear the cache between tests
const getModule = async () => {
  vi.resetModules()
  return import('./crane-api.js')
}

describe('crane-api', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('CraneApi.getVentures', () => {
    it('returns parsed venture list', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenturesResponse,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      const ventures = await api.getVentures()

      expect(ventures).toHaveLength(4)
      expect(ventures[0].code).toBe('vc')
      expect(ventures[0].name).toBe('Venture Crane')
      expect(ventures[0].org).toBe('venturecrane')
    })

    it('caches results on subsequent calls', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockVenturesResponse,
      })

      const api = new CraneApi('test-api-key', PROD_URL)

      // First call
      await api.getVentures()
      // Second call
      await api.getVentures()

      // fetch should only be called once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('handles API errors', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const api = new CraneApi('test-api-key', PROD_URL)

      await expect(api.getVentures()).rejects.toThrow('API error: 500')
    })
  })

  describe('CraneApi.startSession', () => {
    it('sends correct payload and headers', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await api.startSession({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sod'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Relay-Key': 'test-api-key',
          }),
        })
      )

      // Verify body content
      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.venture).toBe('vc')
      expect(body.repo).toBe('venturecrane/crane-console')
      expect(body.agent).toBe('test-agent')
      expect(body.schema_version).toBe('1.0')
    })

    it('includes X-Relay-Key header', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })

      const api = new CraneApi('my-secret-key', PROD_URL)
      await api.startSession({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
      })

      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs[1].headers['X-Relay-Key']).toBe('my-secret-key')
    })
  })

  describe('CraneApi.getDoc', () => {
    it('fetches doc successfully', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ doc: mockDocGetResponse }),
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      const doc = await api.getDoc('vc', 'vc-project-instructions.md')

      expect(doc).not.toBeNull()
      expect(doc!.scope).toBe('vc')
      expect(doc!.doc_name).toBe('vc-project-instructions.md')
      expect(doc!.content).toContain('Test content')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/docs/vc/vc-project-instructions.md'),
        expect.objectContaining({
          headers: { 'X-Relay-Key': 'test-api-key' },
        })
      )
    })

    it('returns null on 404', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      const doc = await api.getDoc('vc', 'nonexistent.md')

      expect(doc).toBeNull()
    })

    it('throws on server error', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const api = new CraneApi('test-api-key', PROD_URL)

      await expect(api.getDoc('vc', 'test.md')).rejects.toThrow('API error: 500')
    })
  })

  describe('CraneApi.createHandoff', () => {
    it('posts handoff data with session_id and payload', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await api.createHandoff({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
        summary: 'Completed work on feature X',
        status: 'done',
        session_id: 'sess_abc123',
        issue_number: 42,
        payload: { commits: 5 },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/eod'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Relay-Key': 'test-api-key',
          }),
        })
      )

      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.venture).toBe('vc')
      expect(body.summary).toBe('Completed work on feature X')
      expect(body.status_label).toBe('done')
      expect(body.session_id).toBe('sess_abc123')
      expect(body.issue_number).toBe(42)
      expect(body.payload).toEqual({ commits: 5 })
    })

    it('defaults payload to empty object when omitted', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await api.createHandoff({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
        summary: 'No payload provided',
        status: 'done',
        session_id: 'sess_xyz',
      })

      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.payload).toEqual({})
    })

    it('includes error detail on failure', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'session_id is required',
      })

      const api = new CraneApi('test-api-key', PROD_URL)

      await expect(
        api.createHandoff({
          venture: 'vc',
          repo: 'venturecrane/crane-console',
          agent: 'test-agent',
          summary: 'Test',
          status: 'done',
          session_id: '',
        })
      ).rejects.toThrow('Handoff failed (400): session_id is required')
    })
  })

  describe('CraneApi.queryHandoffs', () => {
    it('queries handoffs with correct params', async () => {
      const { CraneApi } = await getModule()

      const mockHandoffs = {
        handoffs: [
          {
            id: 'h1',
            session_id: 'sess_1',
            venture: 'vc',
            repo: 'venturecrane/crane-console',
            from_agent: 'agent-1',
            summary: 'Did stuff',
            status_label: 'done',
            created_at: '2026-02-14T10:00:00Z',
          },
        ],
        has_more: false,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHandoffs,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      const result = await api.queryHandoffs({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        track: 1,
        limit: 10,
      })

      expect(result.handoffs).toHaveLength(1)
      expect(result.handoffs[0].summary).toBe('Did stuff')
      expect(result.has_more).toBe(false)

      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('/handoffs?')
      expect(callUrl).toContain('venture=vc')
      expect(callUrl).toContain('repo=venturecrane%2Fcrane-console')
      expect(callUrl).toContain('track=1')
      expect(callUrl).toContain('limit=10')
    })

    it('throws on failure with detail', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      })

      const api = new CraneApi('test-api-key', PROD_URL)

      await expect(
        api.queryHandoffs({
          venture: 'vc',
          repo: 'venturecrane/crane-console',
        })
      ).rejects.toThrow('Query handoffs failed (500): Internal error')
    })
  })

  describe('environment-aware API base', () => {
    it('uses the apiBase URL passed to constructor', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenturesResponse,
      })

      const api = new CraneApi('test-api-key', STAGING_URL)
      await api.getVentures()

      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toBe(`${STAGING_URL}/ventures`)
    })

    it('uses production URL when passed production base', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await api.startSession({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
      })

      expect(mockFetch).toHaveBeenCalledWith(`${PROD_URL}/sod`, expect.any(Object))
    })
  })
})
