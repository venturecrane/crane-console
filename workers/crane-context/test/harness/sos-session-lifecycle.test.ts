/**
 * crane-context POST /sos session lifecycle tests, via the harness.
 *
 * Covers two scenarios that were skipped in the legacy integration suite
 * because they required time manipulation or direct DB seeding:
 *
 *   1. Stale session detection: When a session's last_heartbeat_at is older
 *      than CONTEXT_SESSION_STALE_MINUTES, the next /sos marks it abandoned
 *      and creates a new session.
 *
 *   2. Multiple active session supersession: When multiple active sessions
 *      exist for the same (agent, venture, repo, track) tuple (e.g., from
 *      a race condition), /sos resumes the most recent and supersedes
 *      the others.
 *
 * The harness gives us direct D1 access, making both scenarios testable
 * without waiting 45 minutes or exploiting race conditions.
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

interface SosResponse {
  session_id: string
  status: string
}

describe('POST /sos — session lifecycle (via harness)', () => {
  let db: D1Database
  let env: Env

  const baseBody = {
    agent: 'cc-cli-host',
    venture: 'vc',
    repo: 'venturecrane/crane-console',
    track: 1,
  }
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

  it('marks stale session as abandoned and creates new session', async () => {
    // 1. Create an initial session
    const first = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers,
      body: baseBody,
      env,
    })
    expect(first.status).toBe(200)
    const firstJson = (await first.json()) as SosResponse
    expect(firstJson.session_id).toMatch(/^sess_/)
    const oldSessionId = firstJson.session_id

    // 2. Backdate the session's last_heartbeat_at to 46 minutes ago (past the 45-min threshold)
    const staleTimestamp = new Date(Date.now() - 46 * 60 * 1000).toISOString()
    await db
      .prepare('UPDATE sessions SET last_heartbeat_at = ? WHERE id = ?')
      .bind(staleTimestamp, oldSessionId)
      .run()

    // 3. POST /sos again with the same tuple — should detect staleness
    const second = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers,
      body: baseBody,
      env,
    })
    expect(second.status).toBe(200)
    const secondJson = (await second.json()) as SosResponse

    // New session should be created, not the old one resumed
    expect(secondJson.session_id).not.toBe(oldSessionId)
    expect(secondJson.status).toBe('created')

    // Old session should be marked abandoned with end_reason='stale'
    const oldSession = await db
      .prepare('SELECT status, end_reason FROM sessions WHERE id = ?')
      .bind(oldSessionId)
      .first<{ status: string; end_reason: string }>()
    expect(oldSession?.status).toBe('abandoned')
    expect(oldSession?.end_reason).toBe('stale')

    // Exactly one active session should remain
    const activeCount = await db
      .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'")
      .first<{ c: number }>()
    expect(activeCount?.c).toBe(1)
  })

  it('supersedes extra active sessions and resumes the most recent', async () => {
    // 1. Create a session via /sos — this will be the most recent
    const first = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers,
      body: baseBody,
      env,
    })
    expect(first.status).toBe(200)
    const firstJson = (await first.json()) as SosResponse
    const newestSessionId = firstJson.session_id

    // 2. Directly INSERT a second active session with the same tuple but older timestamps.
    //    This simulates a race condition that shouldn't happen but must be handled.
    const olderTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const rogueSessionId = 'sess_00000000000000ROGUE000000'
    await db
      .prepare(
        `INSERT INTO sessions
         (id, agent, venture, repo, track, status, created_at, started_at,
          last_heartbeat_at, schema_version, actor_key_id, creation_correlation_id)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, '1.0', 'deadbeef01234567', 'corr_rogue')`
      )
      .bind(
        rogueSessionId,
        baseBody.agent,
        baseBody.venture,
        baseBody.repo,
        baseBody.track,
        olderTimestamp,
        olderTimestamp,
        olderTimestamp
      )
      .run()

    // Verify: two active sessions now exist
    const beforeCount = await db
      .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'")
      .first<{ c: number }>()
    expect(beforeCount?.c).toBe(2)

    // 3. POST /sos again — should supersede the rogue and resume the newest
    const third = await invoke(worker, {
      method: 'POST',
      path: '/sos',
      headers,
      body: baseBody,
      env,
    })
    expect(third.status).toBe(200)
    const thirdJson = (await third.json()) as SosResponse

    // Should resume the most recent session (the first one we created)
    expect(thirdJson.session_id).toBe(newestSessionId)
    expect(thirdJson.status).toBe('resumed')

    // Rogue session should be superseded
    const rogueSession = await db
      .prepare('SELECT status, end_reason FROM sessions WHERE id = ?')
      .bind(rogueSessionId)
      .first<{ status: string; end_reason: string }>()
    expect(rogueSession?.status).toBe('ended')
    expect(rogueSession?.end_reason).toBe('superseded')

    // Only one active session remains
    const afterCount = await db
      .prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'")
      .first<{ c: number }>()
    expect(afterCount?.c).toBe(1)
  })
})
