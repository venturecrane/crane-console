import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
} from '@venturecrane/crane-test-harness'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleAdminSessionsIngest } from '../src/endpoints/admin-sessions-ingest'
import type { Env } from '../src/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const migrationsDir = join(__dirname, '..', 'migrations')

let db: Env['DB']

const ADMIN_KEY = 'test-admin-key'

function makeEnv(): Env {
  return {
    DB: db,
    CONTEXT_SESSION_STALE_MINUTES: '45',
    IDEMPOTENCY_TTL_SECONDS: '3600',
    HEARTBEAT_INTERVAL_SECONDS: '600',
    HEARTBEAT_JITTER_SECONDS: '120',
    CONTEXT_RELAY_KEY: 'test-relay-key',
    CONTEXT_ADMIN_KEY: ADMIN_KEY,
  } as Env
}

function makeRequest(body: Record<string, unknown>, opts: { auth?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth !== undefined) headers['X-Admin-Key'] = opts.auth
  return new Request('https://test/admin/sessions/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const validBody = {
  machine: 'mac23',
  project: '-Users-scottdurgan-dev-crane-console',
  claude_session_id: '975d2d11-4c28-494e-a92d-dc97cae2fad4',
  // base64 of literal "hello\n" gzipped, decoded server-side
  content_jsonl_gz_base64: 'H4sIAAAAAAAAA8tIzcnJBwCGphA2BgAAAA==',
  line_count: 1,
  source_size_bytes: 6,
}

beforeAll(async () => {
  db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  // Cloudflare Workers extends crypto.subtle with timingSafeEqual; Node's
  // WebCrypto doesn't. Polyfill so verifyAdminKey() doesn't crash.
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

beforeEach(async () => {
  await db.prepare('DELETE FROM session_transcripts').run()
})

describe('POST /admin/sessions/ingest', () => {
  it('rejects missing X-Admin-Key', async () => {
    const env = makeEnv()
    const res = await handleAdminSessionsIngest(makeRequest(validBody), env)
    expect(res.status).toBe(401)
  })

  it('rejects wrong X-Admin-Key', async () => {
    const env = makeEnv()
    const res = await handleAdminSessionsIngest(makeRequest(validBody, { auth: 'wrong-key' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects missing required fields', async () => {
    const env = makeEnv()
    const { machine: _machine, ...incomplete } = validBody
    const res = await handleAdminSessionsIngest(makeRequest(incomplete, { auth: ADMIN_KEY }), env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { details?: { field: string }[] }
    expect(body.details?.some((e) => e.field === 'machine')).toBe(true)
  })

  it('accepts a valid payload and returns 201 with id', async () => {
    const env = makeEnv()
    const res = await handleAdminSessionsIngest(makeRequest(validBody, { auth: ADMIN_KEY }), env)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; claude_session_id: string }
    expect(body.id).toMatch(/^sxt_/)
    expect(body.claude_session_id).toBe(validBody.claude_session_id)

    // Confirm the row landed
    const row = await db
      .prepare('SELECT * FROM session_transcripts WHERE id = ?')
      .bind(body.id)
      .first()
    expect(row).toBeTruthy()
  })

  it('UPSERTs on claude_session_id (re-push overwrites)', async () => {
    const env = makeEnv()

    const res1 = await handleAdminSessionsIngest(makeRequest(validBody, { auth: ADMIN_KEY }), env)
    expect(res1.status).toBe(201)
    const body1 = (await res1.json()) as { id: string }

    // Re-push with different machine/line_count
    const updated = { ...validBody, machine: 'm16', line_count: 99 }
    const res2 = await handleAdminSessionsIngest(makeRequest(updated, { auth: ADMIN_KEY }), env)
    expect(res2.status).toBe(201)
    const body2 = (await res2.json()) as { id: string }
    expect(body2.id).toBe(body1.id) // same id - UPSERT

    const count = await db
      .prepare('SELECT COUNT(*) as n FROM session_transcripts')
      .first<{ n: number }>()
    expect(count?.n).toBe(1)

    const row = await db
      .prepare('SELECT machine, line_count FROM session_transcripts WHERE claude_session_id = ?')
      .bind(validBody.claude_session_id)
      .first<{ machine: string; line_count: number }>()
    expect(row?.machine).toBe('m16')
    expect(row?.line_count).toBe(99)
  })

  it('rejects oversized payload', async () => {
    const env = makeEnv()
    const huge = 'A'.repeat(6 * 1024 * 1024)
    const res = await handleAdminSessionsIngest(
      makeRequest({ ...validBody, content_jsonl_gz_base64: huge }, { auth: ADMIN_KEY }),
      env
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/5 MB/)
  })

  it('rejects non-base64 content', async () => {
    const env = makeEnv()
    const res = await handleAdminSessionsIngest(
      makeRequest(
        { ...validBody, content_jsonl_gz_base64: 'this is not @valid! base64??' },
        { auth: ADMIN_KEY }
      ),
      env
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/base64/)
  })
})
