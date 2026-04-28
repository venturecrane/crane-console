/**
 * Harness Test: schedule completion accepts slug or display title
 *
 * #761 — the /sos briefing renders cadence items by display title (e.g.
 * "Code Review (ke)") while the API key is the slug ("code-review-ke"). Agents
 * reading the briefing reasonably guessed the display form and got 404s with
 * no hint at the canonical key. Verify the endpoint now accepts either form
 * and surfaces near-matches on a true miss.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
  invoke,
  installWorkerdPolyfills,
} from '@venturecrane/crane-test-harness'
import worker from '../../src/index'
import type { Env } from '../../src/types'
import type { D1Database } from '@cloudflare/workers-types'

beforeAll(() => {
  installWorkerdPolyfills()
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'migrations')

const headers = { 'X-Relay-Key': 'test-relay-key' }

interface CompleteResponse {
  name: string
  result: string
  completed_at: string
  next_due_date: string
  gcal_event_id: string | null
  correlation_id: string
}

interface LinkCalendarResponse {
  name: string
  gcal_event_id: string | null
  updated_at: string
  correlation_id: string
}

interface NotFoundResponse {
  error: string
  available_names: string[]
  correlation_id: string
}

describe('Schedule endpoints (via harness)', () => {
  let db: D1Database
  let env: Env

  beforeEach(async () => {
    db = createTestD1()
    await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
    env = {
      DB: db,
      CONTEXT_RELAY_KEY: 'test-relay-key',
      CONTEXT_ADMIN_KEY: 'test-admin-key',
      CONTEXT_SESSION_STALE_MINUTES: '45',
      IDEMPOTENCY_TTL_SECONDS: '3600',
      HEARTBEAT_INTERVAL_SECONDS: '600',
      HEARTBEAT_JITTER_SECONDS: '120',
    }
  })

  describe('POST /schedule/:name/complete — name resolution', () => {
    it('accepts the canonical slug', async () => {
      const res = await invoke(worker, {
        method: 'POST',
        path: '/schedule/code-review-ke/complete',
        headers,
        body: { result: 'success', summary: 'test', completed_by: 'test-suite' },
        env,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as CompleteResponse
      expect(body.name).toBe('code-review-ke')
      expect(body.result).toBe('success')
    })

    it('accepts the display title and returns the canonical slug', async () => {
      const res = await invoke(worker, {
        method: 'POST',
        path: `/schedule/${encodeURIComponent('Code Review (ke)')}/complete`,
        headers,
        body: { result: 'success', completed_by: 'test-suite' },
        env,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as CompleteResponse
      // Caller passed the display form — response surfaces the canonical slug
      // so they learn what to use next time.
      expect(body.name).toBe('code-review-ke')
    })

    it('returns 404 with available_names suggestions on a true miss', async () => {
      const res = await invoke(worker, {
        method: 'POST',
        path: '/schedule/code-review/complete',
        headers,
        body: { result: 'success', completed_by: 'test-suite' },
        env,
      })

      expect(res.status).toBe(404)
      const body = (await res.json()) as NotFoundResponse
      expect(body.error).toContain('Schedule item not found')
      expect(body.error).toContain('Did you mean')
      // The seed data has multiple code-review-* slugs; substring match should
      // surface them.
      expect(body.available_names).toEqual(
        expect.arrayContaining(['code-review-vc', 'code-review-ke'])
      )
    })

    it('returns 404 with a fallback list when nothing matches', async () => {
      const res = await invoke(worker, {
        method: 'POST',
        path: '/schedule/totally-unknown-zzz/complete',
        headers,
        body: { result: 'success', completed_by: 'test-suite' },
        env,
      })

      expect(res.status).toBe(404)
      const body = (await res.json()) as NotFoundResponse
      // Nothing matches "totally-unknown-zzz"; suggester returns the
      // highest-priority items so the caller at least sees the registry shape.
      expect(body.available_names.length).toBeGreaterThan(0)
    })

    it('updates last_completed_at on the canonical row regardless of input form', async () => {
      const res = await invoke(worker, {
        method: 'POST',
        path: `/schedule/${encodeURIComponent('Code Review (ke)')}/complete`,
        headers,
        body: { result: 'success', completed_by: 'display-test' },
        env,
      })
      expect(res.status).toBe(200)

      const row = await db
        .prepare('SELECT name, last_completed_by, last_result FROM schedule_items WHERE name = ?')
        .bind('code-review-ke')
        .first<{ name: string; last_completed_by: string; last_result: string }>()

      expect(row?.name).toBe('code-review-ke')
      expect(row?.last_completed_by).toBe('display-test')
      expect(row?.last_result).toBe('success')
    })
  })

  describe('POST /schedule/:name/link-calendar — name resolution', () => {
    it('accepts the display title and updates the canonical row', async () => {
      const res = await invoke(worker, {
        method: 'POST',
        path: `/schedule/${encodeURIComponent('Code Review (ke)')}/link-calendar`,
        headers,
        body: { gcal_event_id: 'event_test_123' },
        env,
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as LinkCalendarResponse
      expect(body.name).toBe('code-review-ke')
      expect(body.gcal_event_id).toBe('event_test_123')
    })

    it('returns 404 with suggestions on miss', async () => {
      const res = await invoke(worker, {
        method: 'POST',
        path: '/schedule/no-such-thing/link-calendar',
        headers,
        body: { gcal_event_id: null },
        env,
      })

      expect(res.status).toBe(404)
      const body = (await res.json()) as NotFoundResponse
      expect(Array.isArray(body.available_names)).toBe(true)
    })
  })
})
