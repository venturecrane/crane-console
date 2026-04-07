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
      'request_log', // from schema.sql
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
})
