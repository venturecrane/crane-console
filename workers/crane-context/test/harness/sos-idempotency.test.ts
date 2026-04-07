/**
 * crane-context POST /sos idempotency replay test, via the harness.
 *
 * This is the first migrated test from the legacy live-wrangler integration
 * suite. It exercises the full request → handler → D1 path:
 *
 *   1. POST /sos with an Idempotency-Key. Worker creates a session, stores
 *      the response in idempotency_keys with the key as part of the PK.
 *   2. POST /sos again with the same body and same Idempotency-Key. Worker
 *      reads the cached response from idempotency_keys, returns it with
 *      X-Idempotency-Hit: true.
 *
 * Replaces test/integration/sos.test.ts:121-167 (which hits live wrangler
 * dev on localhost:8787 and is opt-in only via the integration-legacy
 * vitest project). Phase 2 will delete the legacy file after all of its
 * tests have been migrated.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
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

describe('POST /sos — idempotency replay (via harness)', () => {
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

  it('returns cached response on idempotency replay', async () => {
    const body = {
      agent: 'cc-cli-host',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
      track: 1,
    }
    const headers = {
      'X-Relay-Key': 'test-relay-key',
      'Idempotency-Key': 'idem-replay-test-001',
    }

    // First call: creates a session, stores idempotency record.
    const first = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers,
      body,
      env,
    })
    if (first.status !== 200) {
      const text = await first.text()
      throw new Error(`POST /sos returned ${first.status}: ${text}`)
    }
    const firstJson = (await first.json()) as { session_id: string; status: string }
    expect(firstJson.session_id).toMatch(/^sess_/)

    // Second call with same body and same key: should return cached response.
    const replay = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers,
      body,
      env,
    })
    expect(replay.status).toBe(200)
    expect(replay.headers.get('X-Idempotency-Hit')).toBe('true')

    const replayJson = (await replay.json()) as { session_id: string }
    expect(replayJson.session_id).toBe(firstJson.session_id)

    // Sanity: only ONE session row should exist after both calls.
    const count = await db.prepare('SELECT COUNT(*) as c FROM sessions').first<{ c: number }>()
    expect(count?.c).toBe(1)

    // The idempotency cache should have the record.
    const idemRow = await db
      .prepare('SELECT key FROM idempotency_keys WHERE endpoint = ? AND key = ?')
      .bind('/sos', 'idem-replay-test-001')
      .first<{ key: string }>()
    expect(idemRow?.key).toBe('idem-replay-test-001')
  })

  it('different idempotency keys do NOT collide on replay', async () => {
    const body = {
      agent: 'cc-cli-host',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
      track: 1,
    }

    const keyA = 'idem-different-keys-test-aaaaaaaa'
    const keyB = 'idem-different-keys-test-bbbbbbbb'

    const a = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers: { 'X-Relay-Key': 'test-relay-key', 'Idempotency-Key': keyA },
      body,
      env,
    })
    expect(a.status).toBe(200)

    // Same body, DIFFERENT key — should NOT be a replay; should resume the
    // existing session because crane-context resumes on (agent, venture,
    // repo, track) tuple, not on idempotency key.
    const b = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers: { 'X-Relay-Key': 'test-relay-key', 'Idempotency-Key': keyB },
      body,
      env,
    })
    expect(b.status).toBe(200)
    // Different idem key, so the cached-response path should NOT fire.
    expect(b.headers.get('X-Idempotency-Hit')).toBeNull()

    // Both should have produced a stored idempotency record.
    const result = await db
      .prepare('SELECT key FROM idempotency_keys WHERE endpoint = ? ORDER BY key')
      .bind('/sos')
      .all<{ key: string }>()
    expect(result.results.map((r) => r.key)).toEqual([keyA, keyB])
  })

  it('rejects request without X-Relay-Key with 401', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers: { 'Idempotency-Key': 'idem-noauth' },
      body: {
        agent: 'cc-cli-host',
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        track: 1,
      },
      env,
    })
    expect(res.status).toBe(401)
  })
})
