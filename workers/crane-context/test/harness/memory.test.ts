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

interface MemoryInvocationRecord {
  id: string
  memory_id: string
  event: string
  created_at: string
}

interface MemoryInvocationResponse {
  invocation: MemoryInvocationRecord
  correlation_id: string
}

interface MemoryInvocationsQueryResponse {
  memory_id: string
  since: string
  totals: {
    total_surfaced: number
    total_cited: number
    total_parse_error: number
  }
  recent_events: Array<{
    id: string
    event: string
    session_id: string | null
    venture: string | null
    repo: string | null
    created_at: string
  }>
  correlation_id: string
}

interface MemoryInvocationsAllResponse {
  since: string
  stats: Array<{
    memory_id: string
    total_surfaced: number
    total_cited: number
    total_parse_error: number
    total_events: number
    last_event_at: string
  }>
  correlation_id: string
}

describe('Memory Invocation endpoints (via harness)', () => {
  let db: D1Database
  let env: Env

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
  })

  // ============================================================
  // POST /memory/invocations — happy paths for each event type
  // ============================================================

  it('POST /memory/invocations: records a surfaced event', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: {
        memory_id: 'note_abc123',
        event: 'surfaced',
        session_id: 'sess_test',
        venture: 'vc',
        repo: 'venturecrane/crane-console',
      },
      env,
    })

    expect(res.status).toBe(201)
    const json = (await res.json()) as MemoryInvocationResponse
    expect(json.invocation.id).toMatch(/^minv_/)
    expect(json.invocation.created_at).toBeDefined()
    expect(json.invocation.memory_id).toBe('note_abc123')
    expect(json.correlation_id).toBeDefined()

    const row = await db
      .prepare('SELECT * FROM memory_invocations WHERE id = ?')
      .bind(json.invocation.id)
      .first<{ memory_id: string; event: string; venture: string }>()
    expect(row).not.toBeNull()
    expect(row!.memory_id).toBe('note_abc123')
    expect(row!.event).toBe('surfaced')
    expect(row!.venture).toBe('vc')
  })

  it('POST /memory/invocations: records a cited event', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: { memory_id: 'note_cited1', event: 'cited' },
      env,
    })

    expect(res.status).toBe(201)
    const json = (await res.json()) as MemoryInvocationResponse
    expect(json.invocation.id).toMatch(/^minv_/)

    const row = await db
      .prepare('SELECT event FROM memory_invocations WHERE id = ?')
      .bind(json.invocation.id)
      .first<{ event: string }>()
    expect(row!.event).toBe('cited')
  })

  it('POST /memory/invocations: records a parse_error event', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: { memory_id: 'note_broken', event: 'parse_error' },
      env,
    })

    expect(res.status).toBe(201)
    const json = (await res.json()) as MemoryInvocationResponse
    expect(json.invocation.id).toMatch(/^minv_/)

    const row = await db
      .prepare('SELECT event FROM memory_invocations WHERE id = ?')
      .bind(json.invocation.id)
      .first<{ event: string }>()
    expect(row!.event).toBe('parse_error')
  })

  // ============================================================
  // POST /memory/invocations — validation errors
  // ============================================================

  it('POST /memory/invocations: rejects invalid event type', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: { memory_id: 'note_x', event: 'unknown_event' },
      env,
    })
    expect(res.status).toBe(400)
  })

  it('POST /memory/invocations: rejects missing memory_id', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: { event: 'surfaced' },
      env,
    })
    expect(res.status).toBe(400)
  })

  it('POST /memory/invocations: returns 401 without bearer', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers: {},
      body: { memory_id: 'note_x', event: 'surfaced' },
      env,
    })
    expect(res.status).toBe(401)
  })

  it('POST /memory/invocations: returns 401 with wrong key', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers: { 'X-Relay-Key': 'wrong-key' },
      body: { memory_id: 'note_x', event: 'surfaced' },
      env,
    })
    expect(res.status).toBe(401)
  })

  // ============================================================
  // GET /memory/invocations?memory_id=X — usage query
  // ============================================================

  it('GET /memory/invocations: returns correct counts after seeding', async () => {
    const memId = 'note_query_test'

    // Seed: 2 surfaced, 1 cited, 1 parse_error
    for (const event of ['surfaced', 'surfaced', 'cited', 'parse_error']) {
      await invoke(worker, {
        method: 'POST',
        path: '/memory/invocations',
        headers,
        body: { memory_id: memId, event },
        env,
      })
    }

    const res = await invoke(worker, {
      method: 'GET',
      path: `/memory/invocations?memory_id=${memId}`,
      headers,
      env,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as MemoryInvocationsQueryResponse
    expect(json.memory_id).toBe(memId)
    expect(json.totals.total_surfaced).toBe(2)
    expect(json.totals.total_cited).toBe(1)
    expect(json.totals.total_parse_error).toBe(1)
    expect(json.recent_events.length).toBe(4)
  })

  it('GET /memory/invocations: returns 400 without memory_id', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/memory/invocations',
      headers,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('GET /memory/invocations: returns 401 without bearer', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/memory/invocations?memory_id=note_x',
      headers: {},
      env,
    })
    expect(res.status).toBe(401)
  })

  // ============================================================
  // GET /memory/invocations/all — fleet-wide usage
  // ============================================================

  it('GET /memory/invocations/all: returns aggregated shape', async () => {
    // Seed two different memories
    await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: { memory_id: 'note_alpha', event: 'surfaced' },
      env,
    })
    await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: { memory_id: 'note_alpha', event: 'cited' },
      env,
    })
    await invoke(worker, {
      method: 'POST',
      path: '/memory/invocations',
      headers,
      body: { memory_id: 'note_beta', event: 'parse_error' },
      env,
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/memory/invocations/all',
      headers,
      env,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as MemoryInvocationsAllResponse
    expect(json.stats).toHaveLength(2)

    const alpha = json.stats.find((m) => m.memory_id === 'note_alpha')
    expect(alpha).toBeDefined()
    expect(alpha!.total_surfaced).toBe(1)
    expect(alpha!.total_cited).toBe(1)
    expect(alpha!.total_events).toBe(2)

    const beta = json.stats.find((m) => m.memory_id === 'note_beta')
    expect(beta).toBeDefined()
    expect(beta!.total_parse_error).toBe(1)
  })

  it('GET /memory/invocations/all: returns 401 without bearer', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/memory/invocations/all',
      headers: {},
      env,
    })
    expect(res.status).toBe(401)
  })
})
