/**
 * crane-context GET /active query test, via the harness.
 *
 * The second migrated test in PR #1. Its purpose is to broaden harness API
 * surface coverage beyond the idempotency replay path. Where idempotency
 * replay exercises prepare/bind/first/run, this exercises:
 *
 *   - Multiple POST /sos calls that create distinct sessions
 *   - GET /active with query parameters
 *   - The handler's underlying SELECT ... ORDER BY ... that returns multiple rows
 *   - The all() result shape with arrays in the JSON response body
 *
 * Crane-context resumes sessions on (agent, venture, repo, track), so to
 * create three distinct sessions we vary the venture. Each call should
 * produce its own session_id and the GET /active query should return only
 * the matching one.
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

describe('GET /active — query active sessions (via harness)', () => {
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

  it('returns only sessions matching the venture filter', async () => {
    const auth = { 'X-Relay-Key': 'test-relay-key' }

    // Create three sessions in three different ventures.
    for (const venture of ['vc', 'sc', 'dfg']) {
      const res = await invoke(worker, {
        method: 'POST',
        path: '/sos',
        headers: auth,
        body: {
          agent: 'cc-cli-host',
          venture,
          repo: 'venturecrane/crane-console',
          track: 1,
        },
        env,
      })
      expect(res.status).toBe(200)
    }

    // Sanity: 3 rows in sessions.
    const allCount = await db.prepare('SELECT COUNT(*) as c FROM sessions').first<{ c: number }>()
    expect(allCount?.c).toBe(3)

    // Query for vc only.
    const queryRes = await invoke(worker, {
      method: 'GET',
      path: '/active?agent=cc-cli-host&venture=vc&repo=venturecrane/crane-console&track=1',
      headers: auth,
      env,
    })
    expect(queryRes.status).toBe(200)

    const json = (await queryRes.json()) as {
      sessions: Array<{ id: string; venture: string }>
      count: number
    }
    expect(json.count).toBe(1)
    expect(json.sessions).toHaveLength(1)
    expect(json.sessions[0]!.venture).toBe('vc')
  })

  it('returns empty array when no sessions match', async () => {
    const auth = { 'X-Relay-Key': 'test-relay-key' }

    // No sessions created. Query should return an empty results array.
    const queryRes = await invoke(worker, {
      method: 'GET',
      path: '/active?agent=cc-cli-host&venture=vc&repo=venturecrane/crane-console&track=1',
      headers: auth,
      env,
    })
    expect(queryRes.status).toBe(200)

    const json = (await queryRes.json()) as { sessions: unknown[]; count: number }
    expect(json.count).toBe(0)
    expect(json.sessions).toEqual([])
  })

  it('rejects invalid track parameter with 400', async () => {
    const queryRes = await invoke(worker, {
      method: 'GET',
      path: '/active?agent=cc-cli-host&venture=vc&repo=venturecrane/crane-console&track=not-a-number',
      headers: { 'X-Relay-Key': 'test-relay-key' },
      env,
    })
    expect(queryRes.status).toBe(400)
  })
})
