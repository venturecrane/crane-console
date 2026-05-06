/**
 * Harness tests for GET /verify/lookup (PR 2 — verification gates).
 *
 * The other verify-ledger handlers (record / origin / session-count) shipped
 * in PR 1 (#832) and run in production. This file focuses on /verify/lookup,
 * the new endpoint pr-verify-check.mjs depends on.
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

interface VerifyLookupResponse {
  exists: Record<string, boolean>
  correlation_id: string
}

describe('GET /verify/lookup', () => {
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

  async function insertVerifyRow(id: string): Promise<void> {
    await db
      .prepare(
        `INSERT INTO verify_ledger
           (id, session_id, venture, repo, method, source, claim,
            output_scrubbed, output_hash, output_redacted, output_truncation,
            tool_used, command, command_hash, fresh_runtime,
            fresh_runtime_justification, actor_key_id)
         VALUES (?, NULL, NULL, NULL, 'live_state', 'tool', 'test claim',
                 'scrubbed output', 'deadbeef', 0, 'none',
                 'Bash', 'echo hi', 'feedface', NULL, NULL, 'test-actor')`
      )
      .bind(id)
      .run()
  }

  it('returns exists:true for IDs in the ledger and false for missing', async () => {
    const presentId = 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQX'
    const missingId = 'vfy_01HQXV3NK8YXM3G5ZXQXAAAAAA'
    await insertVerifyRow(presentId)

    const res = await invoke(worker, {
      method: 'GET',
      path: `/verify/lookup?ids=${presentId},${missingId}`,
      headers,
      env,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as VerifyLookupResponse
    expect(json.exists[presentId]).toBe(true)
    expect(json.exists[missingId]).toBe(false)
    expect(json.correlation_id).toBeDefined()
  })

  it('de-duplicates repeated IDs in the input', async () => {
    const id = 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQX'
    await insertVerifyRow(id)

    const res = await invoke(worker, {
      method: 'GET',
      path: `/verify/lookup?ids=${id},${id},${id}`,
      headers,
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as VerifyLookupResponse
    expect(Object.keys(json.exists)).toEqual([id])
    expect(json.exists[id]).toBe(true)
  })

  it('rejects missing ids param with 400', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: `/verify/lookup`,
      headers,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('rejects empty ids param with 400', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: `/verify/lookup?ids=`,
      headers,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('rejects malformed IDs with 400 and explains expected format', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: `/verify/lookup?ids=not-a-vfy-id`,
      headers,
      env,
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      details?: Array<{ message?: string }>
    }
    const message = body.details?.[0]?.message ?? ''
    expect(message).toMatch(/Invalid ID format/)
  })

  it('rejects > 50 IDs with 400', async () => {
    // 26 valid Crockford-ULID chars per ID, prefixed vfy_, unique per index.
    // Crockford alphabet excludes I, L, O, U so we don't trip the regex.
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    const ids = Array.from({ length: 51 }, (_, i) => {
      const a = alphabet.charAt(Math.floor(i / 32) % 32)
      const b = alphabet.charAt(i % 32)
      return `vfy_${a}${b}` + alphabet.charAt(0).repeat(24)
    })
    // Sanity: ensure unique
    expect(new Set(ids).size).toBe(51)

    const res = await invoke(worker, {
      method: 'GET',
      path: `/verify/lookup?ids=${ids.join(',')}`,
      headers,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 without X-Relay-Key', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: `/verify/lookup?ids=vfy_01HQXV3NK8YXM3G5ZXQXQXQXQX`,
      env,
    })
    expect(res.status).toBe(401)
  })
})
