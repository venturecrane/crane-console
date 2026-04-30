/**
 * Unit tests: countNotifications group_by=venture + listNotifications column round-trip.
 *
 * Covers:
 * - by_venture map appears only when group_by==='venture'
 * - Σ by_venture[v].total ≤ total (NULL-venture rows count toward total only)
 * - Per-venture severity buckets sum to per-venture total
 * - listNotifications preserves run_id/app_name/match_key/event_type on returned rows
 *   (regression guard for the SELECT * contract that the SOS collapse helper depends on)
 */

import { describe, it, expect } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
} from '@venturecrane/crane-test-harness'
import {
  createNotification,
  countNotifications,
  listNotifications,
  computeDedupeHash,
  buildMatchKey,
} from '../src/notifications'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

async function setupDb() {
  const db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  return db
}

interface InsertOpts {
  venture: string | null
  repo: string
  severity?: 'critical' | 'warning' | 'info'
  workflowId?: number
  runId?: number | null
  appName?: string | null
  eventType?: string
  matchKey?: string | null
}

async function insertFailure(db: D1Database, opts: InsertOpts) {
  const branch = 'main'
  const eventType = opts.eventType ?? 'workflow_run.failure'
  const matchKey =
    opts.matchKey ??
    buildMatchKey({
      source: 'github',
      kind: 'workflow_run',
      repo_full_name: opts.repo,
      branch,
      workflow_id: opts.workflowId ?? 100,
    }).match_key
  const dedupe = await computeDedupeHash({
    source: 'github',
    event_type: eventType,
    repo: opts.repo,
    branch,
    content_key: `n:${Math.random()}`,
  })
  return createNotification(db, {
    source: 'github',
    event_type: eventType,
    severity: opts.severity ?? 'critical',
    summary: 'failure',
    details_json: '{}',
    dedupe_hash: dedupe,
    venture: opts.venture ?? undefined,
    repo: opts.repo,
    branch,
    environment: 'production',
    actor_key_id: 'test',
    workflow_id: opts.workflowId ?? 100,
    workflow_name: 'CI',
    run_id: opts.runId === undefined ? 555 : opts.runId,
    head_sha: 'sha',
    app_name: opts.appName === undefined ? 'GitHub Actions' : opts.appName,
    match_key: matchKey,
    match_key_version: 'v2_id',
    run_started_at: '2026-04-30T00:00:00Z',
  })
}

describe('countNotifications group_by=venture', () => {
  it('omits by_venture when group_by is not set (back-compat)', async () => {
    const db = await setupDb()
    await insertFailure(db, { venture: 'sc', repo: 'venturecrane/sc-console' })

    const result = await countNotifications(db, { status: 'new' })
    expect(result.by_venture).toBeUndefined()
    expect(result.total).toBe(1)
    expect(result.by_severity.critical).toBe(1)
  })

  it('returns by_venture keyed by venture code with severity buckets and total', async () => {
    const db = await setupDb()
    await insertFailure(db, {
      venture: 'sc',
      repo: 'venturecrane/sc-console',
      severity: 'critical',
      workflowId: 1,
    })
    await insertFailure(db, {
      venture: 'sc',
      repo: 'venturecrane/sc-console',
      severity: 'critical',
      workflowId: 2,
    })
    await insertFailure(db, {
      venture: 'sc',
      repo: 'venturecrane/sc-console',
      severity: 'warning',
      workflowId: 3,
    })
    await insertFailure(db, {
      venture: 'dc',
      repo: 'venturecrane/dc-console',
      severity: 'critical',
      workflowId: 4,
    })

    const result = await countNotifications(db, {
      status: 'new',
      group_by: 'venture',
    })

    expect(result.by_venture).toBeDefined()
    expect(result.by_venture!.sc).toEqual({
      critical: 2,
      warning: 1,
      info: 0,
      total: 3,
    })
    expect(result.by_venture!.dc).toEqual({
      critical: 1,
      warning: 0,
      info: 0,
      total: 1,
    })
    // Per-venture totals reconcile to per-severity bucket sums.
    for (const v of Object.values(result.by_venture!)) {
      expect(v.total).toBe(v.critical + v.warning + v.info)
    }
  })

  it('rows with venture IS NULL count toward total but not by_venture', async () => {
    const db = await setupDb()
    await insertFailure(db, {
      venture: 'sc',
      repo: 'venturecrane/sc-console',
      workflowId: 1,
    })
    await insertFailure(db, {
      venture: null,
      repo: 'venturecrane/legacy-repo',
      workflowId: 2,
    })

    const result = await countNotifications(db, {
      status: 'new',
      group_by: 'venture',
    })

    expect(result.total).toBe(2)
    expect(result.by_venture!.sc.total).toBe(1)
    expect(Object.keys(result.by_venture!)).not.toContain(null)
    expect(Object.keys(result.by_venture!)).not.toContain('null')

    // Invariant: Σ by_venture[v].total ≤ total
    const ventureSum = Object.values(result.by_venture!).reduce((acc, v) => acc + v.total, 0)
    expect(ventureSum).toBeLessThanOrEqual(result.total)
    expect(ventureSum).toBe(1)
  })
})

describe('listNotifications column round-trip', () => {
  it('preserves run_id, app_name, match_key, event_type on returned rows', async () => {
    const db = await setupDb()
    await insertFailure(db, {
      venture: 'sc',
      repo: 'venturecrane/sc-console',
      workflowId: 7,
      runId: 99999,
      appName: 'Security Checks',
      eventType: 'check_run.failure',
    })

    const result = await listNotifications(db, { status: 'new' })

    expect(result.notifications.length).toBe(1)
    const row = result.notifications[0]
    expect(row.run_id).toBe(99999)
    expect(row.app_name).toBe('Security Checks')
    expect(row.event_type).toBe('check_run.failure')
    expect(row.match_key).toBeTruthy()
  })
})
