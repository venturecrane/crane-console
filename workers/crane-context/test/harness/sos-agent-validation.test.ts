/**
 * crane-context POST /sos agent-validation tests, via the harness.
 *
 * Exercises the contract boundary: the crane-mcp client's buildAgentName()
 * output must always pass the crane-context server's isValidAgent() check.
 * This test is the canonical regression guard for the 2026-04 agent-identity
 * contract-drift bug (see docs/post-mortems or MEMORY.md).
 *
 * Asserts both directions:
 *   1. Every buildAgentName() output for the fleet-hostname matrix is accepted.
 *   2. The pre-fix value `crane-mcp-m16.local` (dotted) is rejected with
 *      HTTP 400 `validation_failed` — the exact error that hid the bug.
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
  status: string
}

interface ValidationErrorResponse {
  error: string
  details: Array<{ field: string; message: string }>
  correlation_id: string
}

describe('POST /sos — agent validation (via harness)', () => {
  let db: D1Database
  let env: Env

  const headers = { 'X-Relay-Key': 'test-relay-key' }
  const baseBody = {
    venture: 'vc',
    repo: 'venturecrane/crane-console',
    track: 1,
  }

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

  describe('happy path — fleet hostname matrix', () => {
    const fleetHostnames = [
      'm16.local',
      'mac23.local',
      'mbp27.local',
      'mini.local',
      'think',
      'DESKTOP-ABC123',
      'host_with_underscores',
      '', // empty
    ]

    it.each(fleetHostnames)('accepts buildAgentName(%j)', async (rawHost) => {
      const agent = buildAgentName(rawHost)
      const res = await invoke(worker, {
        method: 'POST',
        path: '/sos',
        headers,
        body: { ...baseBody, agent, host: rawHost },
        env,
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as SosResponse
      expect(json.session_id).toMatch(/^sess_/)
      // Row stored with the exact agent we sent
      const row = await db
        .prepare('SELECT agent FROM sessions WHERE id = ?')
        .bind(json.session_id)
        .first<{ agent: string }>()
      expect(row?.agent).toBe(agent)
    })
  })

  describe('regression guard — dotted agent names are rejected', () => {
    it.each(['crane-mcp-m16.local', 'crane-mcp-mac23.local', 'foo.bar'])(
      'rejects %s with HTTP 400',
      async (badAgent) => {
        const res = await invoke(worker, {
          method: 'POST',
          path: '/sos',
          headers,
          body: { ...baseBody, agent: badAgent },
          env,
        })
        expect(res.status).toBe(400)
        const json = (await res.json()) as ValidationErrorResponse
        expect(json.error).toBe('validation_failed')
        expect(json.details.some((d) => d.field === 'agent')).toBe(true)
        expect(json.correlation_id).toMatch(/^corr_/)
      }
    )
  })

  describe('miscellaneous known-good agents', () => {
    it.each(['claude-desktop', 'cc-cli', 'cc-cli-host'])(
      'accepts legacy agent %s',
      async (agent) => {
        const res = await invoke(worker, {
          method: 'POST',
          path: '/sos',
          headers,
          body: { ...baseBody, agent },
          env,
        })
        expect(res.status).toBe(200)
      }
    )
  })
})
