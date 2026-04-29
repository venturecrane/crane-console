/**
 * crane-context POST /sessions/:id/activity tests, via the harness.
 *
 * Drives the production code path end-to-end against an in-process D1.
 * The 2026-04-29 critical case: Claude Code's JSONL has activity entries
 * that pre-date /sos's recorded created_at by ~5-10 seconds (session-start
 * hook output, system messages). Pre-fix, the endpoint 422-rejected the
 * whole batch and crane_eos's best-effort try/catch silently dropped every
 * session's activity. Post-fix, out-of-window events are silently dropped
 * per-event and counted in `skipped_out_of_window`.
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
import { buildAgentName } from '@venturecrane/crane-contracts'
import worker from '../../src/index'
import type { Env } from '../../src/types'
import type { D1Database } from '@cloudflare/workers-types'

beforeAll(() => {
  installWorkerdPolyfills()
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'migrations')

interface SosResponse {
  session_id: string
}

interface ActivityResponse {
  recorded: number
  skipped: number
  skipped_out_of_window: number
  correlation_id: string
}

describe('POST /sessions/:id/activity — window filtering (via harness)', () => {
  let db: D1Database
  let env: Env
  let sessionId: string
  let createdAt: string
  const headers = { 'X-Relay-Key': 'test-relay-key' }

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

    // Seed an active session
    const sosRes = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers,
      body: {
        agent: buildAgentName('m16.local'),
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        track: 1,
      },
      env,
    })
    expect(sosRes.status).toBe(200)
    const sosJson = (await sosRes.json()) as SosResponse & { session: { created_at: string } }
    sessionId = sosJson.session_id
    createdAt = sosJson.session.created_at
  })

  it('records all in-window events and reports zero out-of-window', async () => {
    const ts1 = createdAt
    const ts2 = new Date(new Date(createdAt).getTime() + 60_000).toISOString()
    const ts3 = new Date(new Date(createdAt).getTime() + 120_000).toISOString()

    const res = await invoke(worker, {
      method: 'POST',
      path: `/sessions/${sessionId}/activity`,
      headers,
      body: { events: [{ ts: ts1 }, { ts: ts2 }, { ts: ts3 }] },
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ActivityResponse
    expect(json.recorded).toBe(3)
    expect(json.skipped).toBe(0)
    expect(json.skipped_out_of_window).toBe(0)
  })

  it('drops events strictly before created_at and counts them as out_of_window (the JSONL pre-sos slop case)', async () => {
    // 8 seconds before created_at — typical JSONL session-start hook entry
    const preWindow = new Date(new Date(createdAt).getTime() - 8_000).toISOString()
    const inWindow = new Date(new Date(createdAt).getTime() + 60_000).toISOString()

    const res = await invoke(worker, {
      method: 'POST',
      path: `/sessions/${sessionId}/activity`,
      headers,
      body: { events: [{ ts: preWindow }, { ts: inWindow }] },
      env,
    })
    expect(res.status).toBe(200) // not 422 anymore
    const json = (await res.json()) as ActivityResponse
    expect(json.recorded).toBe(1)
    expect(json.skipped_out_of_window).toBe(1)
  })

  it('drops events strictly after ended_at (post-/eos slop) without rejecting batch', async () => {
    // End the session. /eos sets ended_at = now, so we use a small window
    // (createdAt..ended_at is just milliseconds of test time).
    const eosRes = await invoke(worker, {
      method: 'POST',
      path: '/eos',
      headers,
      body: { session_id: sessionId, summary: 'test', status_label: 'done' },
      env,
    })
    expect(eosRes.status).toBe(200)

    const sessRow = await db
      .prepare('SELECT created_at, ended_at FROM sessions WHERE id = ?')
      .bind(sessionId)
      .first<{ created_at: string; ended_at: string }>()
    expect(sessRow).toBeTruthy()
    const endedAt = sessRow!.ended_at

    // ts exactly at created_at is inside the closed window; well after ended_at is outside
    const inWindow = createdAt
    const postWindow = new Date(new Date(endedAt).getTime() + 5_000).toISOString()

    const res = await invoke(worker, {
      method: 'POST',
      path: `/sessions/${sessionId}/activity`,
      headers,
      body: { events: [{ ts: inWindow }, { ts: postWindow }] },
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ActivityResponse
    expect(json.recorded).toBe(1)
    expect(json.skipped_out_of_window).toBe(1)
  })

  it('returns 200 with all-zero counts when every event is out-of-window (no rows persisted)', async () => {
    const before = new Date(new Date(createdAt).getTime() - 10_000).toISOString()
    const wayBefore = new Date(new Date(createdAt).getTime() - 60_000).toISOString()

    const res = await invoke(worker, {
      method: 'POST',
      path: `/sessions/${sessionId}/activity`,
      headers,
      body: { events: [{ ts: before }, { ts: wayBefore }] },
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ActivityResponse
    expect(json.recorded).toBe(0)
    expect(json.skipped).toBe(0)
    expect(json.skipped_out_of_window).toBe(2)

    // No rows landed
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM session_activity WHERE session_id = ?')
      .bind(sessionId)
      .first<{ n: number }>()
    expect(count?.n).toBe(0)
  })

  it('dedupes events to the same minute bucket within a single batch', async () => {
    // Floor to a minute so the three events stay inside one bucket regardless
    // of the millisecond offset of created_at.
    const baseMin = Math.floor((new Date(createdAt).getTime() + 60_000) / 60_000) * 60_000
    const ts1 = new Date(baseMin + 100).toISOString() // 0.1s past the minute
    const ts2 = new Date(baseMin + 30_000).toISOString() // 30s past
    const ts3 = new Date(baseMin + 59_999).toISOString() // 59.999s past — same minute

    const res = await invoke(worker, {
      method: 'POST',
      path: `/sessions/${sessionId}/activity`,
      headers,
      body: { events: [{ ts: ts1 }, { ts: ts2 }, { ts: ts3 }] },
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ActivityResponse
    expect(json.recorded).toBe(1)
  })

  it('reposting a previously-recorded minute counts as skipped (PK collision), not recorded', async () => {
    const ts = new Date(new Date(createdAt).getTime() + 60_000).toISOString()

    const first = await invoke(worker, {
      method: 'POST',
      path: `/sessions/${sessionId}/activity`,
      headers,
      body: { events: [{ ts }] },
      env,
    })
    expect(first.status).toBe(200)
    expect(((await first.json()) as ActivityResponse).recorded).toBe(1)

    const second = await invoke(worker, {
      method: 'POST',
      path: `/sessions/${sessionId}/activity`,
      headers,
      body: { events: [{ ts }] },
      env,
    })
    expect(second.status).toBe(200)
    const json = (await second.json()) as ActivityResponse
    expect(json.recorded).toBe(0)
    expect(json.skipped).toBe(1)
    expect(json.skipped_out_of_window).toBe(0)
  })

  it('returns 404 when session does not exist', async () => {
    const ts = new Date().toISOString()
    // Valid ULID format (Crockford base32: 0-9 A-H J K M N P-T V-Z), no such row in DB
    const res = await invoke(worker, {
      method: 'POST',
      path: '/sessions/sess_99999999999999999999999999/activity',
      headers,
      body: { events: [{ ts }] },
      env,
    })
    expect(res.status).toBe(404)
  })
})
