/**
 * GET /sessions/history regression — D1 bound-parameter limit.
 *
 * Cloudflare D1 caps a single statement at 100 bound parameters. The
 * handler used to fetch session_activity rows with `id IN (?,?,?,...)`,
 * binding one parameter per ended session in the window. Once >100 ended
 * sessions fell inside the window, D1 returned an internal error and the
 * endpoint responded 500 ("API error: 500" surfaced through crane-mcp).
 *
 * This test seeds 150 ended sessions inside the window and asserts the
 * endpoint returns 200 with all sessions accounted for. The fix routes
 * the id list through json_each(?1), collapsing the N-param IN list into
 * a single JSON-array bind.
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

interface SessionHistoryResponse {
  entries: Array<{
    venture: string
    work_date: string
    blocks: Array<{ start: string; end: string; session_count: number }>
    total_sessions: number
  }>
  count: number
}

describe('GET /sessions/history — D1 bound-parameter limit (via harness)', () => {
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

  it('returns 200 when the window contains >100 ended sessions', async () => {
    const auth = { 'X-Relay-Key': 'test-relay-key' }

    // Seed 150 ended sessions inside a 7-day window. We insert directly
    // rather than POST /sos + /eos because we only care about the SELECT
    // path here — not the full lifecycle.
    const SESSION_COUNT = 150
    const baseTime = Date.now() - 3 * 86400000 // 3 days ago
    const stmts = []
    for (let i = 0; i < SESSION_COUNT; i++) {
      const created = new Date(baseTime + i * 60_000).toISOString()
      const ended = new Date(baseTime + i * 60_000 + 5 * 60_000).toISOString()
      stmts.push(
        db
          .prepare(
            `INSERT INTO sessions
             (id, agent, venture, repo, status, created_at, started_at, last_heartbeat_at,
              ended_at, end_reason, actor_key_id, creation_correlation_id)
             VALUES (?, 'cc-cli-host', 'vc', 'venturecrane/crane-console', 'ended',
                     ?, ?, ?, ?, 'manual', 'test_actor_key_id', 'corr_test_regression')`
          )
          .bind(`sess_test_${i.toString().padStart(4, '0')}`, created, created, ended, ended)
      )
    }
    await db.batch(stmts)

    // Sanity: the seed landed.
    const seedCount = await db
      .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'ended'")
      .first<{ c: number }>()
    expect(seedCount?.c).toBe(SESSION_COUNT)

    // The pre-fix endpoint would 500 here once it hit the IN clause.
    const res = await invoke(worker, {
      method: 'GET',
      path: '/sessions/history?days=7',
      headers: auth,
      env,
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as SessionHistoryResponse
    // All seeded sessions share venture=vc, so they collapse into 1+ venture-day
    // groups depending on how the timestamps fall across the Arizona-time
    // workday boundary. The sum of total_sessions across all groups must
    // equal the number we inserted.
    const summed = body.entries.reduce((acc, e) => acc + e.total_sessions, 0)
    expect(summed).toBe(SESSION_COUNT)
  })
})
