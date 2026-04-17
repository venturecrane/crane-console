/**
 * Tests for crane-api.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mockVenturesResponse,
  mockVentures,
  mockSosResponse,
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

    it('handles API errors as ApiError', async () => {
      const { CraneApi } = await getModule()
      const { ApiError } = await import('./api-error.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '',
      })

      const api = new CraneApi('test-api-key', PROD_URL)

      await expect(api.getVentures()).rejects.toBeInstanceOf(ApiError)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '',
      })
      await expect(api.getVentures()).rejects.toMatchObject({
        status: 500,
        endpoint: '/ventures',
      })
    })
  })

  describe('CraneApi.startSession', () => {
    it('sends correct payload and headers', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSosResponse,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await api.startSession({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sos'),
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
        json: async () => mockSosResponse,
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

  describe('CraneApi.refreshHeartbeat', () => {
    it('POSTs to /heartbeat with session_id and resolves on 200', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session_id: 'sess_abc',
          last_heartbeat_at: '2026-04-11T00:10:00Z',
        }),
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await expect(api.refreshHeartbeat('sess_abc')).resolves.toBeUndefined()

      expect(mockFetch).toHaveBeenCalledWith(
        `${PROD_URL}/heartbeat`,
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
      expect(body).toEqual({ session_id: 'sess_abc' })
    })

    it('throws SessionNotActiveError with parsed status on 409', async () => {
      const { CraneApi, SessionNotActiveError } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Session is not active',
          details: {
            session_id: 'sess_abc',
            status: 'abandoned',
          },
        }),
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      const promise = api.refreshHeartbeat('sess_abc')

      await expect(promise).rejects.toBeInstanceOf(SessionNotActiveError)
      await expect(promise).rejects.toThrow('Session not active: abandoned')
    })

    it('throws SessionNotActiveError with "unknown" when 409 body is malformed', async () => {
      const { CraneApi, SessionNotActiveError } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => {
          throw new Error('invalid json')
        },
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await expect(api.refreshHeartbeat('sess_abc')).rejects.toMatchObject({
        name: 'SessionNotActiveError',
        sessionStatus: 'unknown',
      })
    })

    it('throws a generic error on 5xx', async () => {
      const { CraneApi } = await getModule()

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await expect(api.refreshHeartbeat('sess_abc')).rejects.toThrow(
        'Heartbeat refresh failed (500)'
      )
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
        expect.stringContaining('/eos'),
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

    it('throws ApiError with correlation and field details on /eos failure', async () => {
      const { CraneApi } = await getModule()
      const { ApiError } = await import('./api-error.js')

      const serverBody = JSON.stringify({
        error: 'validation_failed',
        details: [{ field: 'session_id', message: 'Required, must match pattern: sess_<ULID>' }],
        correlation_id: 'corr_test-1234',
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => serverBody,
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
      ).rejects.toSatisfy((e: unknown) => {
        if (!(e instanceof ApiError)) return false
        return (
          e.status === 400 &&
          e.endpoint === '/eos' &&
          e.errorCode === 'validation_failed' &&
          e.correlationId === 'corr_test-1234' &&
          e.fieldErrors.length === 1 &&
          e.fieldErrors[0].field === 'session_id'
        )
      })
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
        json: async () => mockSosResponse,
      })

      const api = new CraneApi('test-api-key', PROD_URL)
      await api.startSession({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
      })

      expect(mockFetch).toHaveBeenCalledWith(`${PROD_URL}/sos`, expect.any(Object))
    })
  })
})
