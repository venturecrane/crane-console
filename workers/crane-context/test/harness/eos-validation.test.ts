/**
 * crane-context POST /eos validation tests, via the harness.
 *
 * Asserts that /eos validates `to_agent` when provided. Before the 2026-04
 * fix, /eos accepted any string for `to_agent`, so a malformed handoff
 * target could land in D1 and leak back through /handoffs endpoints.
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

interface ValidationErrorResponse {
  error: string
  details: Array<{ field: string; message: string }>
  correlation_id: string
}

describe('POST /eos — to_agent validation (via harness)', () => {
  let db: D1Database
  let env: Env
  let sessionId: string
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

    // Seed an active session for /eos to end
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
    const sosJson = (await sosRes.json()) as SosResponse
    sessionId = sosJson.session_id
  })

  it('rejects to_agent with dots', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/eos',
      headers,
      body: {
        session_id: sessionId,
        summary: 'test handoff',
        to_agent: 'crane-mcp-m16.local',
      },
      env,
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as ValidationErrorResponse
    expect(json.error).toBe('validation_failed')
    expect(json.details.some((d) => d.field === 'to_agent')).toBe(true)
  })

  it('rejects to_agent with whitespace', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/eos',
      headers,
      body: {
        session_id: sessionId,
        summary: 'test handoff',
        to_agent: 'has spaces',
      },
      env,
    })
    expect(res.status).toBe(400)
  })

  it('accepts a properly-formed to_agent', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/eos',
      headers,
      body: {
        session_id: sessionId,
        summary: 'test handoff',
        to_agent: buildAgentName('think'),
      },
      env,
    })
    expect(res.status).toBe(200)
  })

  it('accepts /eos without to_agent (field is optional)', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/eos',
      headers,
      body: {
        session_id: sessionId,
        summary: 'test handoff',
      },
      env,
    })
    expect(res.status).toBe(200)
  })
})
