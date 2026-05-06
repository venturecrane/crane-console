/**
 * Harness tests for GET /verify/audit (Prong 3).
 *
 * Seeds verify_ledger / verify_files / handoffs rows and asserts each report
 * section shape. Cache and summary paths covered separately. The (command_hash,
 * repo) grouping for memory_candidates is the load-bearing assertion — it
 * guards against the cross-package collision the critic flagged in the plan.
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

interface VerifyAuditResponse {
  window: { days: number; since_iso: string }
  cache: { age_seconds: number; served_from: 'cache' | 'fresh'; never_run?: boolean }
  coverage_gap: { file: string }[]
  unverified_surface_files: { file: string }[]
  override_audit: {
    pr_merge_gate: number
    verify_coverage_gate: number
    total_handoffs_done: number
  }
  integrity_samples: {
    verify_id: string
    scrubber_consistent: boolean
    truncation_consistent: boolean
  }[]
  truncation_drift: {
    verify_id: string
    output_truncation: string
    output_redacted: number
  }[]
  source_distribution: { manual: number; tool: number; hook: number }
  memory_candidates: {
    pattern: string
    command_hash: string
    repo: string | null
    occurrences: number
    verify_ids: string[]
    files_touched_union: string[]
    suggested_kind: string
  }[]
  memory_candidates_suppressed: number
  generated_at: string | null
  correlation_id: string
}

describe('GET /verify/audit', () => {
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

  async function insertVerifyRow(opts: {
    id: string
    method?: string
    source?: string
    repo?: string | null
    command?: string | null
    command_hash?: string | null
    output_scrubbed?: string
    output_redacted?: number
    output_truncation?: string
    files?: string[]
    created_at?: string
  }): Promise<void> {
    const created = opts.created_at ?? new Date().toISOString()
    await db
      .prepare(
        `INSERT INTO verify_ledger
           (id, session_id, venture, repo, method, source, claim,
            output_scrubbed, output_hash, output_redacted, output_truncation,
            tool_used, command, command_hash, fresh_runtime,
            fresh_runtime_justification, actor_key_id, created_at)
         VALUES (?, NULL, NULL, ?, ?, ?, 'test claim',
                 ?, 'deadbeef', ?, ?,
                 'Bash', ?, ?, NULL, NULL, 'test-actor', ?)`
      )
      .bind(
        opts.id,
        opts.repo ?? null,
        opts.method ?? 'fresh_process',
        opts.source ?? 'tool',
        opts.output_scrubbed ?? 'scrubbed output',
        opts.output_redacted ?? 0,
        opts.output_truncation ?? 'none',
        opts.command ?? null,
        opts.command_hash ?? null,
        created
      )
      .run()
    for (const f of opts.files ?? []) {
      await db
        .prepare(`INSERT INTO verify_files (verify_id, file_path) VALUES (?, ?)`)
        .bind(opts.id, f)
        .run()
    }
  }

  async function insertHandoff(opts: {
    id: string
    payload?: Record<string, unknown>
    status_label?: string
    created_at?: string
  }): Promise<void> {
    const payload = opts.payload ?? {}
    const payloadJson = JSON.stringify(payload)
    const created = opts.created_at ?? new Date().toISOString()
    // Insert a session row first so handoff has a valid FK target — required
    // by handoffs schema (session_id NOT NULL). Use unique ID per session.
    const sessionId = `sess_${opts.id.slice(3)}`
    await db
      .prepare(
        `INSERT INTO sessions
           (id, agent, venture, repo, status, created_at, started_at, last_heartbeat_at,
            actor_key_id, creation_correlation_id)
         VALUES (?, 'test-agent', 'vc', 'test/repo', 'ended', ?, ?, ?, 'test-actor', 'corr_test')`
      )
      .bind(sessionId, created, created, created)
      .run()
    await db
      .prepare(
        `INSERT INTO handoffs
           (id, session_id, venture, repo, from_agent, status_label,
            summary, payload_json, payload_hash, payload_size_bytes,
            schema_version, created_at, actor_key_id, creation_correlation_id)
         VALUES (?, ?, 'vc', 'test/repo', 'test-agent', ?,
                 'test summary', ?, 'hash', ?,
                 '1.0', ?, 'test-actor', 'corr_test')`
      )
      .bind(
        opts.id,
        sessionId,
        opts.status_label ?? 'ready',
        payloadJson,
        payloadJson.length,
        created
      )
      .run()
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  it('returns 401 without auth header', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit',
      headers: {},
      env,
    })
    expect(res.status).toBe(401)
  })

  // -------------------------------------------------------------------------
  // Window param
  // -------------------------------------------------------------------------

  it('rejects invalid window', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?window=abc',
      headers,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('rejects window > 90', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?window=120d',
      headers,
      env,
    })
    expect(res.status).toBe(400)
  })

  it('accepts both bare integer and Xd window forms', async () => {
    const res1 = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?window=14',
      headers,
      env,
    })
    expect(res1.status).toBe(200)
    const body1 = (await res1.json()) as VerifyAuditResponse
    expect(body1.window.days).toBe(14)

    const res2 = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?window=14d&fresh=1',
      headers,
      env,
    })
    expect(res2.status).toBe(200)
    const body2 = (await res2.json()) as VerifyAuditResponse
    expect(body2.window.days).toBe(14)
  })

  // -------------------------------------------------------------------------
  // Default (empty ledger)
  // -------------------------------------------------------------------------

  it('returns empty sections on a fresh DB', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit',
      headers,
      env,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.window.days).toBe(7)
    expect(body.coverage_gap).toEqual([])
    expect(body.unverified_surface_files).toEqual([])
    expect(body.override_audit).toEqual({
      pr_merge_gate: 0,
      verify_coverage_gate: 0,
      total_handoffs_done: 0,
    })
    expect(body.integrity_samples).toEqual([])
    expect(body.truncation_drift).toEqual([])
    expect(body.source_distribution).toEqual({ manual: 0, tool: 0, hook: 0 })
    expect(body.memory_candidates).toEqual([])
    expect(body.memory_candidates_suppressed).toBe(0)
    expect(body.cache.served_from).toBe('fresh')
  })

  // -------------------------------------------------------------------------
  // Coverage gap
  // -------------------------------------------------------------------------

  it('computes coverage_gap as caller_files minus verified-in-window', async () => {
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQA',
      files: ['packages/foo.ts'],
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?files=packages%2Ffoo.ts,packages%2Fbar.ts&fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.coverage_gap).toEqual([{ file: 'packages/bar.ts' }])
  })

  // -------------------------------------------------------------------------
  // Unverified surface files
  // -------------------------------------------------------------------------

  it('lists surface files with zero verify_files rows ever', async () => {
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQB',
      files: ['packages/verified.ts'],
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?surface_files=packages%2Fverified.ts,packages%2Funverified.ts&fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.unverified_surface_files).toEqual([{ file: 'packages/unverified.ts' }])
  })

  // -------------------------------------------------------------------------
  // Override audit
  // -------------------------------------------------------------------------

  it('counts override_pr_merge_gate and override_verify_coverage_gate flags from handoff payload', async () => {
    await insertHandoff({ id: 'ho_a', payload: { override_pr_merge_gate: true } })
    await insertHandoff({ id: 'ho_b', payload: { override_verify_coverage_gate: true } })
    await insertHandoff({
      id: 'ho_c',
      payload: { override_pr_merge_gate: true, override_verify_coverage_gate: true },
    })
    await insertHandoff({ id: 'ho_d', payload: {} })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.override_audit.pr_merge_gate).toBe(2)
    expect(body.override_audit.verify_coverage_gate).toBe(2)
    expect(body.override_audit.total_handoffs_done).toBe(4)
  })

  // -------------------------------------------------------------------------
  // Source distribution
  // -------------------------------------------------------------------------

  it('breaks source_distribution by source enum', async () => {
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQC',
      source: 'manual',
    })
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQD',
      source: 'tool',
    })
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQE',
      source: 'tool',
    })
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQF',
      source: 'hook',
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.source_distribution).toEqual({ manual: 1, tool: 2, hook: 1 })
  })

  // -------------------------------------------------------------------------
  // Memory candidates: (command_hash, repo) grouping
  // -------------------------------------------------------------------------

  it('groups memory candidates by (command_hash, repo); same hash across repos is separated', async () => {
    // Same command_hash 'shared_hash' appears 3 times in repo-A, 3 times in repo-B
    // Each repo should produce its own candidate row, not a single merged one.
    for (let i = 0; i < 3; i++) {
      await insertVerifyRow({
        id: `vfy_01HQXV3NK8YXM3G5ZXQXAAAAA${i}`,
        repo: 'venturecrane/repo-A',
        command: 'npm test',
        command_hash: 'shared_hash',
        method: 'fresh_process',
        files: [`packages/a-${i}.ts`],
      })
    }
    for (let i = 0; i < 3; i++) {
      await insertVerifyRow({
        id: `vfy_01HQXV3NK8YXM3G5ZXQXBBBBB${i}`,
        repo: 'venturecrane/repo-B',
        command: 'npm test',
        command_hash: 'shared_hash',
        method: 'fresh_process',
        files: [`packages/b-${i}.ts`],
      })
    }

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.memory_candidates).toHaveLength(2)
    const repos = body.memory_candidates.map((c) => c.repo).sort()
    expect(repos).toEqual(['venturecrane/repo-A', 'venturecrane/repo-B'])
    for (const c of body.memory_candidates) {
      expect(c.occurrences).toBe(3)
      expect(c.verify_ids).toHaveLength(3)
      expect(c.files_touched_union).toHaveLength(3)
      expect(c.suggested_kind).toBe('lesson')
    }
  })

  it('does not surface candidates below the 3-occurrence threshold', async () => {
    for (let i = 0; i < 2; i++) {
      await insertVerifyRow({
        id: `vfy_01HQXV3NK8YXM3G5ZXQXCCCCC${i}`,
        repo: 'venturecrane/repo',
        command: 'wrangler deploy',
        command_hash: 'rare_hash',
        method: 'fresh_process',
      })
    }

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.memory_candidates).toEqual([])
  })

  it('only counts method=fresh_process for memory candidates', async () => {
    for (let i = 0; i < 4; i++) {
      await insertVerifyRow({
        id: `vfy_01HQXV3NK8YXM3G5ZXQXDDDDD${i}`,
        repo: 'venturecrane/repo',
        command: 'curl https://api',
        command_hash: 'live_hash',
        method: 'live_state',
      })
    }

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.memory_candidates).toEqual([])
  })

  it('caps memory candidates at max_memory_candidates and surfaces suppressed count', async () => {
    // Create 4 distinct (command_hash, repo) groups, each with 3 rows
    for (let g = 0; g < 4; g++) {
      for (let i = 0; i < 3; i++) {
        await insertVerifyRow({
          id: `vfy_01HQXV3NK8YXM3G5ZXQXG${g}EEE${i}`,
          repo: `venturecrane/repo-${g}`,
          command: `cmd-${g}`,
          command_hash: `hash_${g}`,
          method: 'fresh_process',
        })
      }
    }

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1&max_memory_candidates=2',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.memory_candidates).toHaveLength(2)
    expect(body.memory_candidates_suppressed).toBe(2)
  })

  it('caps max_memory_candidates at the server ceiling regardless of caller request', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1&max_memory_candidates=999',
      headers,
      env,
    })
    expect(res.status).toBe(200)
    // No assertion on count (empty DB), just that the request didn't 400.
  })

  // -------------------------------------------------------------------------
  // Truncation drift
  // -------------------------------------------------------------------------

  it('flags rows with output_truncation != none AND output_redacted = 1', async () => {
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXFFFFFA',
      output_truncation: 'head_tail',
      output_redacted: 1,
      output_scrubbed: 'head\n[REDACTED]\n[truncated]\ntail',
    })
    // Not flagged: no truncation
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXFFFFFB',
      output_truncation: 'none',
      output_redacted: 1,
    })
    // Not flagged: not redacted
    await insertVerifyRow({
      id: 'vfy_01HQXV3NK8YXM3G5ZXQXFFFFFC',
      output_truncation: 'head',
      output_redacted: 0,
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    const body = (await res.json()) as VerifyAuditResponse
    expect(body.truncation_drift).toHaveLength(1)
    expect(body.truncation_drift[0].verify_id).toBe('vfy_01HQXV3NK8YXM3G5ZXQXFFFFFA')
  })

  // -------------------------------------------------------------------------
  // Cache + summary
  // -------------------------------------------------------------------------

  it('summary=1 returns never_run shape on empty cache', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?summary=1',
      headers,
      env,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as VerifyAuditResponse & { cache: { never_run?: boolean } }
    expect(body.cache.never_run).toBe(true)
    expect(body.generated_at).toBeNull()
  })

  it('writes cache on fresh=1, then summary=1 reads it without recomputing', async () => {
    await insertVerifyRow({ id: 'vfy_01HQXV3NK8YXM3G5ZXQXGGGGGA', source: 'tool' })

    // Compute fresh (writes cache)
    const freshRes = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    expect(freshRes.status).toBe(200)
    const fresh = (await freshRes.json()) as VerifyAuditResponse
    expect(fresh.cache.served_from).toBe('fresh')
    expect(fresh.source_distribution.tool).toBe(1)

    // Read summary
    const summaryRes = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?summary=1',
      headers,
      env,
    })
    const summary = (await summaryRes.json()) as VerifyAuditResponse
    expect(summary.cache.served_from).toBe('cache')
    expect(summary.source_distribution.tool).toBe(1)
    expect(summary.generated_at).not.toBeNull()
  })

  it('default (no fresh) serves from cache when present and within TTL', async () => {
    await insertVerifyRow({ id: 'vfy_01HQXV3NK8YXM3G5ZXQXHHHHHA', source: 'manual' })

    // Prime cache
    await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })

    // Add another row; cache should NOT be invalidated by data writes
    await insertVerifyRow({ id: 'vfy_01HQXV3NK8YXM3G5ZXQXHHHHHB', source: 'hook' })

    const cachedRes = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit',
      headers,
      env,
    })
    const cached = (await cachedRes.json()) as VerifyAuditResponse
    expect(cached.cache.served_from).toBe('cache')
    expect(cached.source_distribution.manual).toBe(1)
    expect(cached.source_distribution.hook).toBe(0) // newly-added row not in cache yet

    // fresh=1 forces recompute and picks up the new row
    const freshRes = await invoke(worker, {
      method: 'GET',
      path: '/verify/audit?fresh=1',
      headers,
      env,
    })
    const fresh = (await freshRes.json()) as VerifyAuditResponse
    expect(fresh.cache.served_from).toBe('fresh')
    expect(fresh.source_distribution.hook).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Schedule item seeded
  // -------------------------------------------------------------------------

  it('seeds verify-audit-weekly schedule item from migration 0052', async () => {
    const result = await db
      .prepare(`SELECT name, cadence_days, scope, priority FROM schedule_items WHERE name = ?`)
      .bind('verify-audit-weekly')
      .first<{ name: string; cadence_days: number; scope: string; priority: number }>()
    expect(result?.cadence_days).toBe(7)
    expect(result?.scope).toBe('enterprise')
    expect(result?.priority).toBe(2)
  })
})
