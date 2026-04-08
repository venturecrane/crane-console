/**
 * Unit Tests: processGreenEvent (the auto-resolver)
 *
 * Uses an in-memory D1 stub via the test harness. Verifies the race-safe
 * INSERT-then-UPDATE-with-`auto_resolved_by_id IS NULL` pattern correctly:
 *
 *   1. Resolves all matching open notifications when a green arrives
 *   2. Handles out-of-order delivery (green-before-failure does NOT resolve)
 *   3. Schedule-like events require same head_sha
 *   4. Concurrent greens for the same match_key produce exactly one resolution
 *      (the second sees no rows to update because auto_resolved_by_id IS NULL fails)
 *   5. Manual-resolved rows are not double-touched
 *   6. Idempotent re-execution (same green delivered twice)
 *   7. Cross-org isolation (greens from one org do not resolve reds in another)
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
  processGreenEvent,
  computeDedupeHash,
  buildMatchKey,
} from '../src/notifications'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

// ============================================================================
// Helpers
// ============================================================================

async function setupDb() {
  const db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  return db
}

interface InsertFailureOpts {
  workflowId: number
  branch?: string
  repo?: string
  runStartedAt?: string
  headSha?: string
  status?: 'new' | 'acked' | 'resolved'
  matchKey?: string // override
}

async function insertFailure(
  db: D1Database,
  opts: InsertFailureOpts
): Promise<{ id: string; match_key: string }> {
  const branch = opts.branch ?? 'main'
  const repo = opts.repo ?? 'venturecrane/crane-console'
  const matchKey =
    opts.matchKey ??
    buildMatchKey({
      source: 'github',
      kind: 'workflow_run',
      repo_full_name: repo,
      branch,
      workflow_id: opts.workflowId,
    }).match_key
  const dedupe = await computeDedupeHash({
    source: 'github',
    event_type: 'workflow_run.failure',
    repo,
    branch,
    content_key: `workflow_run:${Math.random()}:failure`,
  })
  const result = await createNotification(db, {
    source: 'github',
    event_type: 'workflow_run.failure',
    severity: 'critical',
    summary: 'CI failure',
    details_json: JSON.stringify({}),
    dedupe_hash: dedupe,
    venture: 'vc',
    repo,
    branch,
    environment: 'production',
    actor_key_id: 'test',
    workflow_id: opts.workflowId,
    workflow_name: 'CI',
    head_sha: opts.headSha ?? 'sha-failure',
    match_key: matchKey,
    match_key_version: 'v2_id',
    run_started_at: opts.runStartedAt ?? '2026-04-08T00:00:00Z',
  })
  if (opts.status === 'acked') {
    await db
      .prepare('UPDATE notifications SET status = ? WHERE id = ?')
      .bind('acked', result.notification!.id)
      .run()
  } else if (opts.status === 'resolved') {
    // Manual-resolve: stamp resolved_at and reason like the data layer would
    await db
      .prepare(
        `UPDATE notifications SET status = 'resolved', resolved_at = ?, auto_resolve_reason = 'manual' WHERE id = ?`
      )
      .bind('2026-04-08T00:30:00Z', result.notification!.id)
      .run()
  }
  return { id: result.notification!.id, match_key: matchKey }
}

async function fireGreen(
  db: D1Database,
  opts: {
    workflowId: number
    runId: number
    branch?: string
    repo?: string
    runStartedAt: string
    headSha?: string
    isScheduleLike?: boolean
  }
) {
  const branch = opts.branch ?? 'main'
  const repo = opts.repo ?? 'venturecrane/crane-console'
  const matchKey = buildMatchKey({
    source: 'github',
    kind: 'workflow_run',
    repo_full_name: repo,
    branch,
    workflow_id: opts.workflowId,
  }).match_key
  const dedupe = await computeDedupeHash({
    source: 'github',
    event_type: 'workflow_run.success',
    repo,
    branch,
    content_key: `workflow_run:${opts.runId}:success`,
  })
  return processGreenEvent(db, {
    source: 'github',
    event_type: 'workflow_run.success',
    match_key: matchKey,
    match_key_version: 'v2_id',
    run_started_at: opts.runStartedAt,
    head_sha: opts.headSha ?? null,
    is_schedule_like: opts.isScheduleLike ?? false,
    repo,
    branch,
    venture: 'vc',
    details_json: JSON.stringify({}),
    summary: `green run ${opts.runId}`,
    dedupe_hash: dedupe,
    auto_resolve_reason: 'green_workflow_run',
    workflow_id: opts.workflowId,
    workflow_name: 'CI',
    run_id: opts.runId,
    actor_key_id: 'test',
  })
}

// ============================================================================
// Happy path: red then green resolves
// ============================================================================

describe('processGreenEvent — happy path', () => {
  it('resolves all matching open failures when a green arrives', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, { workflowId: 100, runStartedAt: '2026-04-08T01:00:00Z' })
    const b = await insertFailure(db, { workflowId: 100, runStartedAt: '2026-04-08T01:05:00Z' })
    const c = await insertFailure(db, { workflowId: 100, runStartedAt: '2026-04-08T01:10:00Z' })

    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
    })

    expect(result.duplicate).toBe(false)
    expect(result.green_notification_id).not.toBeNull()
    expect(result.resolved_count).toBe(3)
    expect(result.matched_ids).toHaveLength(3)
    expect(result.matched_ids).toContain(a.id)
    expect(result.matched_ids).toContain(b.id)
    expect(result.matched_ids).toContain(c.id)

    // Verify all 3 are now resolved with auto_resolved_by_id pointing at green.
    for (const id of [a.id, b.id, c.id]) {
      const row = await db
        .prepare(
          'SELECT status, auto_resolved_by_id, auto_resolve_reason FROM notifications WHERE id = ?'
        )
        .bind(id)
        .first<{ status: string; auto_resolved_by_id: string; auto_resolve_reason: string }>()
      expect(row!.status).toBe('resolved')
      expect(row!.auto_resolved_by_id).toBe(result.green_notification_id)
      expect(row!.auto_resolve_reason).toBe('green_workflow_run')
    }
  })

  it('also resolves acked notifications', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
      status: 'acked',
    })

    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
    })

    expect(result.resolved_count).toBe(1)
    expect(result.matched_ids).toContain(a.id)
  })
})

// ============================================================================
// Out-of-order delivery
// ============================================================================

describe('processGreenEvent — out-of-order delivery', () => {
  it('does NOT resolve a failure that arrived AFTER the green', async () => {
    const db = await setupDb()
    // Green arrives first (run_started_at = T)
    const greenResult = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T01:00:00Z',
    })
    expect(greenResult.resolved_count).toBe(0)

    // Failure arrives after (run_started_at = T+5min)
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:05:00Z',
    })

    // Verify the failure is still 'new'
    const row = await db
      .prepare('SELECT status FROM notifications WHERE id = ?')
      .bind(a.id)
      .first<{ status: string }>()
    expect(row!.status).toBe('new')
  })

  it('resolves correctly when a later green arrives after the failure', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
    })

    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
    })

    expect(result.resolved_count).toBe(1)
    expect(result.matched_ids).toContain(a.id)
  })
})

// ============================================================================
// Schedule-like events: same-SHA only
// ============================================================================

describe('processGreenEvent — schedule-like (cron) events', () => {
  it('does NOT resolve a cron failure with a different head_sha', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
      headSha: 'sha-aaa',
    })

    // Cron green for the SAME workflow but DIFFERENT sha
    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
      headSha: 'sha-bbb',
      isScheduleLike: true,
    })

    expect(result.resolved_count).toBe(0)

    const row = await db
      .prepare('SELECT status FROM notifications WHERE id = ?')
      .bind(a.id)
      .first<{ status: string }>()
    expect(row!.status).toBe('new')
  })

  it('DOES resolve a cron failure when re-run on the same sha', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
      headSha: 'sha-aaa',
    })

    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
      headSha: 'sha-aaa',
      isScheduleLike: true,
    })

    expect(result.resolved_count).toBe(1)
    expect(result.matched_ids).toContain(a.id)
  })
})

// ============================================================================
// CRITICAL: concurrent green race
// ============================================================================

describe('processGreenEvent — concurrent green race safety', () => {
  it('two concurrent greens for the same match_key produce exactly one resolution', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
    })

    // Two greens for the same match_key but different run_ids (e.g. two
    // distinct successful runs that completed nearly simultaneously, or a
    // re-run + a new commit). They have different dedupe_hashes so both
    // INSERTs succeed. But only the first UPDATE acquires the row via
    // the `auto_resolved_by_id IS NULL` predicate; the second sees nothing.
    const [r1, r2] = await Promise.all([
      fireGreen(db, {
        workflowId: 100,
        runId: 999,
        runStartedAt: '2026-04-08T02:00:00Z',
      }),
      fireGreen(db, {
        workflowId: 100,
        runId: 1000,
        runStartedAt: '2026-04-08T02:01:00Z',
      }),
    ])

    // Total resolved across both calls is exactly 1 (the failure was only
    // resolved once). One of the calls saw resolved_count=1, the other saw 0.
    const total = r1.resolved_count + r2.resolved_count
    expect(total).toBe(1)

    // The failure has been resolved (verified independently)
    const row = await db
      .prepare('SELECT status, auto_resolved_by_id FROM notifications WHERE id = ?')
      .bind(a.id)
      .first<{ status: string; auto_resolved_by_id: string }>()
    expect(row!.status).toBe('resolved')
    // auto_resolved_by_id points at one of the two green rows (the winner)
    expect([r1.green_notification_id, r2.green_notification_id]).toContain(row!.auto_resolved_by_id)

    // Both green rows exist in the table (they have distinct dedupe_hashes
    // because run_id is part of the content_key). This is correct: both
    // are real successful runs and both deserve audit history.
    const greenRows = await db
      .prepare(
        `SELECT id FROM notifications WHERE source = 'github'
         AND event_type = 'workflow_run.success' AND status = 'resolved'`
      )
      .all<{ id: string }>()
    expect(greenRows.results!.length).toBe(2)
  })
})

// ============================================================================
// Idempotency: same green delivered twice
// ============================================================================

describe('processGreenEvent — idempotency', () => {
  it('the same green delivered twice produces exactly one INSERT and one UPDATE', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
    })

    const r1 = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
    })
    expect(r1.duplicate).toBe(false)
    expect(r1.resolved_count).toBe(1)

    // Same exact green again (same run_id → same dedupe_hash → INSERT OR IGNORE no-op)
    const r2 = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
    })
    expect(r2.duplicate).toBe(true)
    expect(r2.green_notification_id).toBeNull()
    expect(r2.resolved_count).toBe(0)

    // Failure is still resolved exactly once
    const row = await db
      .prepare('SELECT status, auto_resolved_by_id FROM notifications WHERE id = ?')
      .bind(a.id)
      .first<{ status: string; auto_resolved_by_id: string }>()
    expect(row!.status).toBe('resolved')

    // Only one green row in the database
    const greenRows = await db
      .prepare(
        `SELECT id FROM notifications WHERE source = 'github'
         AND event_type = 'workflow_run.success'`
      )
      .all<{ id: string }>()
    expect(greenRows.results!.length).toBe(1)
  })
})

// ============================================================================
// Manual-resolved rows are not double-touched
// ============================================================================

describe('processGreenEvent — manual resolutions are preserved', () => {
  it('does not auto-resolve a row that was already manually resolved', async () => {
    const db = await setupDb()
    const a = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
      status: 'resolved',
    })

    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
    })

    // The manual-resolved row is excluded by `status IN ('new','acked')`
    expect(result.resolved_count).toBe(0)

    const row = await db
      .prepare('SELECT auto_resolve_reason FROM notifications WHERE id = ?')
      .bind(a.id)
      .first<{ auto_resolve_reason: string }>()
    expect(row!.auto_resolve_reason).toBe('manual')
  })
})

// ============================================================================
// CRITICAL: cross-org isolation
// ============================================================================

describe('processGreenEvent — cross-org isolation', () => {
  it('a green from venturecrane/console does NOT resolve a red from siliconcrane/console', async () => {
    const db = await setupDb()
    const ventureRed = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
      repo: 'venturecrane/console',
    })
    const siliconRed = await insertFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
      repo: 'siliconcrane/console',
    })

    // Green for venturecrane/console only
    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
      repo: 'venturecrane/console',
    })

    expect(result.resolved_count).toBe(1)
    expect(result.matched_ids).toContain(ventureRed.id)
    expect(result.matched_ids).not.toContain(siliconRed.id)

    const siliconRow = await db
      .prepare('SELECT status FROM notifications WHERE id = ?')
      .bind(siliconRed.id)
      .first<{ status: string }>()
    expect(siliconRow!.status).toBe('new')
  })
})

// ============================================================================
// Different branches isolated
// ============================================================================

describe('processGreenEvent — branch isolation', () => {
  it('a green on main does not resolve a failure on a feature branch', async () => {
    const db = await setupDb()
    const featRed = await insertFailure(db, {
      workflowId: 100,
      branch: 'feat/foo',
      runStartedAt: '2026-04-08T01:00:00Z',
    })

    const result = await fireGreen(db, {
      workflowId: 100,
      runId: 999,
      branch: 'main',
      runStartedAt: '2026-04-08T02:00:00Z',
    })

    expect(result.resolved_count).toBe(0)

    const row = await db
      .prepare('SELECT status FROM notifications WHERE id = ?')
      .bind(featRed.id)
      .first<{ status: string }>()
    expect(row!.status).toBe('new')
  })
})
