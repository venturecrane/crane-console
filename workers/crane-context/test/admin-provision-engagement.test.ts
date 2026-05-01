/**
 * Unit Tests: SS Engagement Provisioning + Secrets Proxy
 *
 * Tests the auth, slug validation, ventures.json lookup, and Infisical
 * 409-as-success idempotency pathways. Does NOT exercise the real
 * Infisical API — global.fetch is mocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  handleProvisionEngagement,
  handleEngagementSecrets,
} from '../src/endpoints/admin-provision-engagement'
import type { Env } from '../src/types'

const ADMIN_KEY = 'test-admin-key'
const MGMT_TOKEN = 'test-mgmt-token'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    CONTEXT_SESSION_STALE_MINUTES: '45',
    IDEMPOTENCY_TTL_SECONDS: '3600',
    HEARTBEAT_INTERVAL_SECONDS: '600',
    HEARTBEAT_JITTER_SECONDS: '120',
    CONTEXT_RELAY_KEY: 'relay',
    CONTEXT_ADMIN_KEY: ADMIN_KEY,
    INFISICAL_MANAGEMENT_TOKEN: MGMT_TOKEN,
    ...overrides,
  }
}

function makeRequest(path: string, body: unknown, key = ADMIN_KEY): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-Admin-Key': key } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('admin-provision-engagement', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    // Cloudflare Workers extends `crypto.subtle` with `timingSafeEqual`.
    // Node's WebCrypto doesn't have it — polyfill for unit tests so
    // verifyAdminKey() (src/utils.ts:125) doesn't crash.
    if (!(globalThis.crypto?.subtle as unknown as { timingSafeEqual?: unknown })?.timingSafeEqual) {
      ;(
        globalThis.crypto.subtle as unknown as {
          timingSafeEqual: (a: ArrayBuffer | Uint8Array, b: ArrayBuffer | Uint8Array) => boolean
        }
      ).timingSafeEqual = (a, b) => {
        const aArr = a instanceof ArrayBuffer ? new Uint8Array(a) : a
        const bArr = b instanceof ArrayBuffer ? new Uint8Array(b) : b
        if (aArr.byteLength !== bArr.byteLength) return false
        let diff = 0
        for (let i = 0; i < aArr.byteLength; i++) diff |= aArr[i] ^ bArr[i]
        return diff === 0
      }
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('POST /admin/provision-engagement', () => {
    it('returns 401 when admin key missing', async () => {
      const req = makeRequest('/admin/provision-engagement', { client_slug: 'acme' }, '')
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(401)
    })

    it('returns 503 when INFISICAL_MANAGEMENT_TOKEN unset', async () => {
      const req = makeRequest('/admin/provision-engagement', { client_slug: 'acme' })
      const env = makeEnv({ INFISICAL_MANAGEMENT_TOKEN: undefined })
      const res = await handleProvisionEngagement(req, env)
      expect(res.status).toBe(503)
    })

    it('returns 400 on invalid client_slug', async () => {
      const req = makeRequest('/admin/provision-engagement', { client_slug: 'BAD SLUG' })
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(400)
    })

    it('returns 400 on invalid engagement_slug', async () => {
      const req = makeRequest('/admin/provision-engagement', {
        client_slug: 'acme',
        engagement_slug: '!bad',
      })
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(400)
    })

    it('creates client folder (engagement_slug omitted)', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
      const req = makeRequest('/admin/provision-engagement', { client_slug: 'acme' })
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(200)
      const body = (await res.json()) as { infisical_path: string }
      expect(body.infisical_path).toBe('/ss/clients/acme')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('creates parent client folder then engagement folder when both supplied', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
      const req = makeRequest('/admin/provision-engagement', {
        client_slug: 'acme',
        engagement_slug: 'website',
      })
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(200)
      const body = (await res.json()) as { infisical_path: string }
      expect(body.infisical_path).toBe('/ss/clients/acme/website')
      // Parent folder + engagement folder = 2 calls
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('treats Infisical 409 (folder exists) as success', async () => {
      fetchMock.mockResolvedValueOnce(new Response('already exists', { status: 409 }))
      const req = makeRequest('/admin/provision-engagement', { client_slug: 'acme' })
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(200)
    })

    it('treats Infisical 400 with "already exists" body as success', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Folder already exists at this path', { status: 400 })
      )
      const req = makeRequest('/admin/provision-engagement', { client_slug: 'acme' })
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(200)
    })

    it('returns 500 on Infisical 500 error', async () => {
      fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }))
      const req = makeRequest('/admin/provision-engagement', { client_slug: 'acme' })
      const res = await handleProvisionEngagement(req, makeEnv())
      expect(res.status).toBe(500)
    })
  })

  describe('POST /admin/engagement-secrets', () => {
    it('returns 401 when admin key missing', async () => {
      const req = makeRequest(
        '/admin/engagement-secrets',
        { client_slug: 'acme', engagement_slug: 'website' },
        ''
      )
      const res = await handleEngagementSecrets(req, makeEnv())
      expect(res.status).toBe(401)
    })

    it('returns 404 when client not in ventures.json', async () => {
      const req = makeRequest('/admin/engagement-secrets', {
        client_slug: 'nonexistent',
        engagement_slug: 'website',
      })
      const res = await handleEngagementSecrets(req, makeEnv())
      expect(res.status).toBe(404)
      // Must NOT have called Infisical — unknown client should short-circuit
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns 400 on invalid slug shape', async () => {
      const req = makeRequest('/admin/engagement-secrets', {
        client_slug: 'BadCase',
        engagement_slug: 'website',
      })
      const res = await handleEngagementSecrets(req, makeEnv())
      expect(res.status).toBe(400)
    })

    it('rejects missing engagement_slug (no defaulting)', async () => {
      const req = makeRequest('/admin/engagement-secrets', { client_slug: 'acme' })
      const res = await handleEngagementSecrets(req, makeEnv())
      expect(res.status).toBe(400)
    })
  })
})
