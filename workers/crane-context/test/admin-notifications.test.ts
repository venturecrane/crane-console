/**
 * Unit Tests: Admin notifications data layer
 *
 * Covers the lock semantics, paginated pending-matches query, and the
 * single-notification auto-resolve admin path used by the backfill CLI.
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
  acquireNotificationLock,
  releaseNotificationLock,
  listPendingMatches,
  adminAutoResolveNotification,
} from '../src/admin-notifications'
import { createNotification, computeDedupeHash, buildMatchKey } from '../src/notifications'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

async function setupDb() {
  const db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  return db
}

async function insertOpenFailure(
  db: D1Database,
  opts: {
    workflowId: number
    branch?: string
    repo?: string
    runStartedAt?: string
  }
): Promise<{ id: string; match_key: string }> {
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
    head_sha: 'sha-failure',
    match_key: matchKey,
    match_key_version: 'v2_id',
    run_started_at: opts.runStartedAt ?? '2026-04-08T00:00:00Z',
  })
  return { id: result.notification!.id, match_key: matchKey }
}

// ============================================================================
// Lock acquisition
// ============================================================================

describe('acquireNotificationLock', () => {
  it('acquires a fresh lock', async () => {
    const db = await setupDb()
    const result = await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:12345',
      ttl_seconds: 3600,
    })
    expect(result.acquired).toBe(true)
    expect(result.lock).not.toBeNull()
    expect(result.lock!.holder).toBe('mac23:12345')
  })

  it('refuses second acquisition by a different holder', async () => {
    const db = await setupDb()
    const r1 = await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:12345',
      ttl_seconds: 3600,
    })
    expect(r1.acquired).toBe(true)

    const r2 = await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'm16:99999',
      ttl_seconds: 3600,
    })
    expect(r2.acquired).toBe(false)
    expect(r2.lock!.holder).toBe('mac23:12345')
    expect(r2.reason).toContain('held by mac23:12345')
  })

  it('allows re-acquisition by the same holder (heartbeat)', async () => {
    const db = await setupDb()
    const r1 = await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:12345',
      ttl_seconds: 3600,
    })
    const originalExpiresAt = r1.lock!.expires_at

    await new Promise((resolve) => setTimeout(resolve, 10))

    const r2 = await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:12345',
      ttl_seconds: 7200,
    })
    expect(r2.acquired).toBe(true)
    // expires_at extended
    expect(r2.lock!.expires_at).not.toBe(originalExpiresAt)
  })

  it('reclaims an expired lock from a different holder', async () => {
    const db = await setupDb()
    // Insert an expired lock directly
    const pastTime = new Date(Date.now() - 1000).toISOString()
    await db
      .prepare(
        `INSERT INTO notification_locks (name, holder, acquired_at, expires_at, metadata_json)
         VALUES (?, ?, ?, ?, NULL)`
      )
      .bind('backfill-auto-resolve', 'crashed-mac23:99', pastTime, pastTime)
      .run()

    const result = await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'm16:54321',
      ttl_seconds: 3600,
    })
    expect(result.acquired).toBe(true)
    expect(result.lock!.holder).toBe('m16:54321')
  })

  it('rejects re-acquisition while a different holder owns an unexpired lock', async () => {
    const db = await setupDb()
    await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:111',
      ttl_seconds: 3600,
    })
    const r2 = await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'm16:222',
      ttl_seconds: 3600,
    })
    expect(r2.acquired).toBe(false)
  })
})

describe('releaseNotificationLock', () => {
  it('releases a lock owned by the caller', async () => {
    const db = await setupDb()
    await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:12345',
      ttl_seconds: 3600,
    })
    const released = await releaseNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:12345',
    })
    expect(released).toBe(true)
  })

  it('refuses to release a lock owned by a different holder', async () => {
    const db = await setupDb()
    await acquireNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'mac23:12345',
      ttl_seconds: 3600,
    })
    const released = await releaseNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'someone-else',
    })
    expect(released).toBe(false)
  })

  it('returns false when no lock exists', async () => {
    const db = await setupDb()
    const released = await releaseNotificationLock(db, {
      name: 'backfill-auto-resolve',
      holder: 'anyone',
    })
    expect(released).toBe(false)
  })
})

// ============================================================================
// Pending matches (paginated)
// ============================================================================

describe('listPendingMatches', () => {
  it('returns one entry per distinct match_key', async () => {
    const db = await setupDb()
    // Two failures for workflow 100, one for workflow 200
    await insertOpenFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
    })
    await insertOpenFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:05:00Z',
    })
    await insertOpenFailure(db, {
      workflowId: 200,
      runStartedAt: '2026-04-08T01:10:00Z',
    })

    const result = await listPendingMatches(db, {})
    expect(result.matches).toHaveLength(2)
    const wf100 = result.matches.find((m) => m.workflow_id === 100)
    const wf200 = result.matches.find((m) => m.workflow_id === 200)
    expect(wf100).toBeDefined()
    expect(wf100!.count).toBe(2)
    expect(wf200).toBeDefined()
    expect(wf200!.count).toBe(1)
  })

  it('paginates with cursor', async () => {
    const db = await setupDb()
    // Insert 5 distinct workflows, each with one failure, with monotonic timestamps
    for (let i = 1; i <= 5; i++) {
      await insertOpenFailure(db, {
        workflowId: i,
        runStartedAt: `2026-04-08T01:0${i}:00Z`,
      })
    }

    const page1 = await listPendingMatches(db, { limit: 2 })
    expect(page1.matches).toHaveLength(2)
    expect(page1.next_cursor).not.toBeNull()

    const page2 = await listPendingMatches(db, {
      limit: 2,
      cursor: page1.next_cursor!,
    })
    expect(page2.matches).toHaveLength(2)
    expect(page2.next_cursor).not.toBeNull()

    // Page 1 and page 2 should not overlap
    const ids1 = page1.matches.map((m) => m.workflow_id)
    const ids2 = page2.matches.map((m) => m.workflow_id)
    for (const id of ids1) {
      expect(ids2).not.toContain(id)
    }

    const page3 = await listPendingMatches(db, {
      limit: 2,
      cursor: page2.next_cursor!,
    })
    expect(page3.matches.length).toBeLessThanOrEqual(1)
    expect(page3.next_cursor).toBeNull()
  })

  it('excludes resolved notifications', async () => {
    const db = await setupDb()
    const a = await insertOpenFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
    })
    await db
      .prepare("UPDATE notifications SET status = 'resolved', resolved_at = ? WHERE id = ?")
      .bind('2026-04-08T02:00:00Z', a.id)
      .run()

    const result = await listPendingMatches(db, {})
    expect(result.matches).toHaveLength(0)
  })

  it('excludes notifications with NULL match_key', async () => {
    const db = await setupDb()
    // Insert a row directly without match_key
    const dedupe = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:nullkey:failure',
    })
    await db
      .prepare(
        `INSERT INTO notifications
         (id, source, event_type, severity, status, summary, details_json,
          dedupe_hash, repo, branch, created_at, received_at, updated_at, actor_key_id)
         VALUES ('test_null', 'github', 'workflow_run.failure', 'critical', 'new', 'X', '{}',
                 ?, 'venturecrane/crane-console', 'main',
                 '2026-04-08T01:00:00Z', '2026-04-08T01:00:00Z', '2026-04-08T01:00:00Z', 'test')`
      )
      .bind(dedupe)
      .run()

    const result = await listPendingMatches(db, {})
    expect(result.matches).toHaveLength(0)
  })
})

// ============================================================================
// Admin auto-resolve
// ============================================================================

describe('adminAutoResolveNotification', () => {
  it('resolves an open notification with audit metadata', async () => {
    const db = await setupDb()
    const a = await insertOpenFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
    })

    const result = await adminAutoResolveNotification(db, {
      notification_id: a.id,
      matched_run_id: 555,
      matched_run_url: 'https://github.com/venturecrane/crane-console/actions/runs/555',
      matched_run_started_at: '2026-04-08T02:00:00Z',
      reason: 'github_api_backfill',
      actor_key_id: 'admin-backfill',
    })

    expect(result.ok).toBe(true)
    expect(result.already_resolved).toBe(false)
    expect(result.resolved_id).toBe(a.id)
    expect(result.green_notification_id).toBeDefined()

    // Verify the failure is now resolved with the right reason
    const row = await db
      .prepare(
        'SELECT status, auto_resolved_by_id, auto_resolve_reason FROM notifications WHERE id = ?'
      )
      .bind(a.id)
      .first<{ status: string; auto_resolved_by_id: string; auto_resolve_reason: string }>()
    expect(row!.status).toBe('resolved')
    expect(row!.auto_resolved_by_id).toBe(result.green_notification_id)
    expect(row!.auto_resolve_reason).toBe('github_api_backfill')

    // Verify a synthetic green notification row was inserted with the GitHub run URL
    const greenRow = await db
      .prepare('SELECT * FROM notifications WHERE id = ?')
      .bind(result.green_notification_id)
      .first<{ details_json: string; status: string; auto_resolve_reason: string }>()
    expect(greenRow!.status).toBe('resolved')
    expect(greenRow!.auto_resolve_reason).toBe('github_api_backfill')
    const details = JSON.parse(greenRow!.details_json)
    expect(details.matched_run_id).toBe(555)
    expect(details.matched_run_url).toContain('runs/555')
  })

  it('is idempotent (already-resolved returns ok with already_resolved=true)', async () => {
    const db = await setupDb()
    const a = await insertOpenFailure(db, {
      workflowId: 100,
      runStartedAt: '2026-04-08T01:00:00Z',
    })

    const r1 = await adminAutoResolveNotification(db, {
      notification_id: a.id,
      matched_run_id: 555,
      matched_run_url: 'https://github.com/venturecrane/crane-console/actions/runs/555',
      matched_run_started_at: '2026-04-08T02:00:00Z',
      reason: 'github_api_backfill',
      actor_key_id: 'admin-backfill',
    })
    expect(r1.ok).toBe(true)

    const r2 = await adminAutoResolveNotification(db, {
      notification_id: a.id,
      matched_run_id: 555,
      matched_run_url: 'https://github.com/venturecrane/crane-console/actions/runs/555',
      matched_run_started_at: '2026-04-08T02:00:00Z',
      reason: 'github_api_backfill',
      actor_key_id: 'admin-backfill',
    })
    expect(r2.ok).toBe(true)
    expect(r2.already_resolved).toBe(true)
  })

  it('rejects notification with no match_key', async () => {
    const db = await setupDb()
    const dedupe = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:nokey:failure',
    })
    await db
      .prepare(
        `INSERT INTO notifications
         (id, source, event_type, severity, status, summary, details_json,
          dedupe_hash, repo, branch, created_at, received_at, updated_at, actor_key_id)
         VALUES ('test_nokey', 'github', 'workflow_run.failure', 'critical', 'new', 'X', '{}',
                 ?, 'venturecrane/crane-console', 'main',
                 '2026-04-08T01:00:00Z', '2026-04-08T01:00:00Z', '2026-04-08T01:00:00Z', 'test')`
      )
      .bind(dedupe)
      .run()

    const result = await adminAutoResolveNotification(db, {
      notification_id: 'test_nokey',
      matched_run_id: 555,
      matched_run_url: 'https://example.com',
      matched_run_started_at: '2026-04-08T02:00:00Z',
      reason: 'github_api_backfill',
      actor_key_id: 'admin-backfill',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('match_key')
  })

  it('rejects nonexistent notification id', async () => {
    const db = await setupDb()
    const result = await adminAutoResolveNotification(db, {
      notification_id: 'nope_doesnt_exist',
      matched_run_id: 1,
      matched_run_url: 'https://example.com',
      matched_run_started_at: '2026-04-08T02:00:00Z',
      reason: 'github_api_backfill',
      actor_key_id: 'admin-backfill',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('not found')
  })
})

// ============================================================================
// Scalability test (synthetic 1000-row stress test)
// ============================================================================

describe('listPendingMatches scalability', () => {
  it('handles 1000 distinct match_keys with cursor pagination', async () => {
    const db = await setupDb()
    // Insert 1000 distinct workflows. (Full 27,000 takes too long for unit;
    // 1000 exercises the pagination path and the GROUP BY query.)
    const startMs = Date.now()
    for (let i = 1; i <= 1000; i++) {
      const minutes = i.toString().padStart(2, '0')
      await insertOpenFailure(db, {
        workflowId: i,
        runStartedAt: `2026-04-08T01:00:${minutes.slice(0, 2)}Z`,
      })
    }

    // Walk all pages and assert we see all 1000 workflows exactly once.
    const seen = new Set<number>()
    let cursor: string | undefined = undefined
    let pageCount = 0
    while (true) {
      const page: Awaited<ReturnType<typeof listPendingMatches>> = await listPendingMatches(db, {
        cursor,
        limit: 100,
      })
      pageCount++
      for (const m of page.matches) {
        if (m.workflow_id !== null) {
          expect(seen.has(m.workflow_id)).toBe(false)
          seen.add(m.workflow_id)
        }
      }
      if (!page.next_cursor) break
      cursor = page.next_cursor
      // Safety: bail after too many pages
      if (pageCount > 50) throw new Error('pagination loop did not terminate')
    }

    expect(seen.size).toBe(1000)
    expect(pageCount).toBeGreaterThanOrEqual(10) // 1000/100 pages
    const elapsedMs = Date.now() - startMs
    // Soft sanity: 1000 inserts + 10 paginated reads should complete in
    // well under 30 seconds even on a slow machine.
    expect(elapsedMs).toBeLessThan(30000)
  })
})
