/**
 * Crane-context migration validation using the harness.
 *
 * This test asserts that:
 *   1. discoverNumericMigrations returns the crane-context migrations in the
 *      correct order: schema.sql first, then 0003-0022 in numeric order.
 *      Catches the lexicographic ordering bug where 'schema.sql' > '0022_*'.
 *   2. runMigrations applies all 20 files cleanly to a fresh in-memory DB.
 *      Catches the destructive table swap in 0011_drop_note_categories.sql
 *      and any future destructive migrations.
 *   3. The post-migration schema includes every table the worker handlers
 *      depend on. Catches schema drift if a migration is removed or renamed.
 *
 * This file lives in workers/crane-context/test/harness/, NOT inside the
 * harness package, so it can reference '../../migrations' without crossing
 * a published-package boundary.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
} from '@venturecrane/crane-test-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'migrations')

describe('crane-context migrations via harness', () => {
  it('discoverNumericMigrations returns schema.sql first then numeric order', () => {
    const files = discoverNumericMigrations(migrationsDir)

    // Schema must be first; otherwise lexicographic sort would put it after
    // 0022_* and migrations referencing tables from schema.sql would fail.
    expect(files[0]).toMatch(/schema\.sql$/)

    // The remaining files should be in 0003 → 0022 order.
    const numbered = files.slice(1)
    const numbers = numbered.map((f) => {
      const match = f.match(/(\d{4})_/)
      return match ? Number(match[1]) : -1
    })

    // Strictly increasing.
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]!)
    }

    // First numbered migration should be 0003 (per the migrations dir layout
    // where 0001/0002 were squashed into schema.sql).
    expect(numbers[0]).toBe(3)
  })

  it('runMigrations applies the full chain to a fresh DB cleanly', async () => {
    const db = createTestD1()
    const files = discoverNumericMigrations(migrationsDir)

    // Should not throw. If 0011_drop_note_categories.sql or any other
    // destructive migration breaks, this is where we'd find out.
    await runMigrations(db, { files })

    // Sanity: a basic table from schema.sql exists.
    const sessionsExists = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
      .first<{ name: string }>()
    expect(sessionsExists?.name).toBe('sessions')
  })

  it('post-migration schema includes every table the worker handlers use', async () => {
    const db = createTestD1()
    await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })

    // Tables that crane-context's source code reads from or writes to.
    // If a migration is accidentally dropped, one of these will be missing.
    const expectedTables = [
      'sessions', // from schema.sql
      'handoffs', // from schema.sql
      'idempotency_keys', // from schema.sql
      'context_docs', // from 0003
      'context_scripts', // from 0004
      'rate_limits', // from 0005
      'checkpoints', // from 0006
      'doc_requirements', // from 0008
      'machines', // from 0009
      'notes', // from 0010 (recreated by 0011)
      'schedule_items', // from 0012
      'notifications', // from 0015
      'planned_events', // from 0017
      'work_days', // from later migration
    ]

    const result = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all<{ name: string }>()
    const actualTables = result.results.map((r) => r.name)

    for (const expected of expectedTables) {
      expect(actualTables, `expected table ${expected} to exist post-migration`).toContain(expected)
    }
  })

  it('migration 0023 adds match-key columns to notifications', async () => {
    const db = createTestD1()
    await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })

    const result = await db
      .prepare(`SELECT name FROM pragma_table_info('notifications')`)
      .all<{ name: string }>()
    const columns = (result.results || []).map((r) => r.name)

    // Columns added in migration 0023 - the foundation for the auto-resolver
    const expectedNewColumns = [
      'workflow_id',
      'workflow_name',
      'run_id',
      'head_sha',
      'check_suite_id',
      'check_run_id',
      'app_id',
      'app_name',
      'deployment_id',
      'project_name',
      'target',
      'match_key',
      'match_key_version',
      'run_started_at',
      'auto_resolved_by_id',
      'auto_resolve_reason',
      'resolved_at',
    ]

    for (const expected of expectedNewColumns) {
      expect(columns, `expected column ${expected} to exist post-migration 0023`).toContain(
        expected
      )
    }
  })

  it('migration 0023 backfills match_key for legacy github workflow_run rows', async () => {
    const db = createTestD1()
    const allFiles = discoverNumericMigrations(migrationsDir)
    const idx0023 = allFiles.findIndex((f) => f.includes('0023_add_notification_match_keys'))
    expect(idx0023).toBeGreaterThan(0)

    // Run migrations up to but not including 0023.
    await runMigrations(db, { files: allFiles.slice(0, idx0023) })

    // Insert a legacy workflow_run.failure row with the v1 details_json shape.
    const detailsJson = JSON.stringify({
      workflow_name: 'CI',
      run_number: 42,
      run_id: 999999,
      conclusion: 'failure',
      branch: 'main',
      commit_sha: 'abc123def456',
      html_url: 'https://example.com',
      actor: 'SMDurgan',
      event: 'push',
    })
    await db
      .prepare(
        `INSERT INTO notifications
         (id, source, event_type, severity, status, summary, details_json,
          dedupe_hash, venture, repo, branch, environment,
          created_at, received_at, updated_at, actor_key_id)
         VALUES (?, 'github', 'workflow_run.failure', 'critical', 'new', ?, ?,
                 ?, 'vc', 'venturecrane/crane-console', 'main', 'production',
                 '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z', 'test-actor')`
      )
      .bind('notif_test_legacy_wf', 'CI #42 failure on main', detailsJson, 'dedupe-test-1')
      .run()

    // Now apply migration 0023.
    await runMigrations(db, { files: [allFiles[idx0023]] })

    // Verify the legacy row was backfilled.
    const row = await db
      .prepare(
        `SELECT workflow_name, run_id, head_sha, match_key, match_key_version
         FROM notifications WHERE id = ?`
      )
      .bind('notif_test_legacy_wf')
      .first<{
        workflow_name: string | null
        run_id: number | null
        head_sha: string | null
        match_key: string | null
        match_key_version: string | null
      }>()

    expect(row).not.toBeNull()
    expect(row?.workflow_name).toBe('CI')
    expect(row?.run_id).toBe(999999)
    expect(row?.head_sha).toBe('abc123def456')
    expect(row?.match_key).toBe('gh:wf:venturecrane/crane-console:main:CI')
    expect(row?.match_key_version).toBe('v1_name')
  })

  it('migration 0023 match_key includes owner/repo to prevent cross-org collision', async () => {
    // Critical correctness test: two repos in different orgs with the same
    // repo name (e.g. venturecrane/console vs siliconcrane/console) MUST
    // produce different match_keys. Otherwise a green in one org would
    // silently auto-resolve a red in another - exactly the class of silent
    // data corruption the auto-resolver is supposed to prevent.
    const db = createTestD1()
    const allFiles = discoverNumericMigrations(migrationsDir)
    const idx0023 = allFiles.findIndex((f) => f.includes('0023_add_notification_match_keys'))
    await runMigrations(db, { files: allFiles.slice(0, idx0023) })

    const detailsJson = (workflowName: string) =>
      JSON.stringify({
        workflow_name: workflowName,
        run_id: 1,
        commit_sha: 'sha-a',
      })

    // Two failures, same repo name, same workflow name, DIFFERENT orgs.
    await db
      .prepare(
        `INSERT INTO notifications
         (id, source, event_type, severity, status, summary, details_json,
          dedupe_hash, venture, repo, branch, environment,
          created_at, received_at, updated_at, actor_key_id)
         VALUES (?, 'github', 'workflow_run.failure', 'critical', 'new', ?, ?,
                 ?, 'vc', 'venturecrane/console', 'main', 'production',
                 '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z', 'test')`
      )
      .bind('notif_test_org_a', 'A', detailsJson('CI'), 'dedupe-org-a')
      .run()

    await db
      .prepare(
        `INSERT INTO notifications
         (id, source, event_type, severity, status, summary, details_json,
          dedupe_hash, venture, repo, branch, environment,
          created_at, received_at, updated_at, actor_key_id)
         VALUES (?, 'github', 'workflow_run.failure', 'critical', 'new', ?, ?,
                 ?, 'sc', 'siliconcrane/console', 'main', 'production',
                 '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z', 'test')`
      )
      .bind('notif_test_org_b', 'B', detailsJson('CI'), 'dedupe-org-b')
      .run()

    await runMigrations(db, { files: [allFiles[idx0023]] })

    const a = await db
      .prepare('SELECT match_key FROM notifications WHERE id = ?')
      .bind('notif_test_org_a')
      .first<{ match_key: string }>()
    const b = await db
      .prepare('SELECT match_key FROM notifications WHERE id = ?')
      .bind('notif_test_org_b')
      .first<{ match_key: string }>()

    expect(a?.match_key).toBe('gh:wf:venturecrane/console:main:CI')
    expect(b?.match_key).toBe('gh:wf:siliconcrane/console:main:CI')
    expect(a?.match_key).not.toBe(b?.match_key)
  })
})
