/**
 * Migration runner contract tests.
 *
 * Validates discoverNumericMigrations ordering and runMigrations rollback
 * behavior using self-contained fixtures in test/fixtures/. Does NOT
 * reference any other workspace's migration files — those are tested in
 * the consuming worker's own test suite (e.g.
 * workers/crane-context/test/harness/migrations.test.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createTestD1 } from '../src/d1.js'
import { runMigrations, discoverNumericMigrations } from '../src/migrate.js'
import type { D1Database } from '@cloudflare/workers-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, 'fixtures', 'migrations')
const brokenDir = join(__dirname, 'fixtures', 'broken')

describe('discoverNumericMigrations', () => {
  it('returns base file first then numbered files in numeric order', () => {
    const files = discoverNumericMigrations(fixturesDir)

    expect(files).toHaveLength(3)
    expect(files[0]).toMatch(/schema\.sql$/)
    expect(files[1]).toMatch(/0001_add_comments\.sql$/)
    expect(files[2]).toMatch(/0002_add_tags\.sql$/)
  })

  it('all returned paths are absolute', () => {
    const files = discoverNumericMigrations(fixturesDir)
    for (const file of files) {
      expect(file).toMatch(/^\//)
    }
  })

  it('throws on missing directory with helpful error', () => {
    expect(() => discoverNumericMigrations('/nonexistent/path/here')).toThrow(
      /directory not found/i
    )
  })

  it('respects custom baseFile option', () => {
    // The broken fixture dir has only schema.sql, no numbered files.
    const files = discoverNumericMigrations(brokenDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/schema\.sql$/)
  })

  it('respects custom pattern option', () => {
    // Custom pattern that matches nothing — only the base file should remain.
    const files = discoverNumericMigrations(fixturesDir, {
      pattern: /^\d{6}_.+\.sql$/, // 6-digit prefix, no fixture matches
    })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/schema\.sql$/)
  })
})

describe('runMigrations', () => {
  let db: D1Database

  beforeEach(() => {
    db = createTestD1()
  })

  it('applies all fixture migrations cleanly', async () => {
    const files = discoverNumericMigrations(fixturesDir)
    await runMigrations(db, { files })

    // schema.sql created users + posts
    const usersExists = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .first<{ name: string }>()
    expect(usersExists?.name).toBe('users')

    // 0001 added comments
    const commentsExists = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'comments'")
      .first<{ name: string }>()
    expect(commentsExists?.name).toBe('comments')

    // 0002 added tags column to posts
    const postsCols = await db.prepare('PRAGMA table_info(posts)').all<{ name: string }>()
    const colNames = postsCols.results.map((r) => r.name)
    expect(colNames).toContain('tags')
  })

  it('invokes beforeEach callback in order with index', async () => {
    const files = discoverNumericMigrations(fixturesDir)
    const calls: Array<{ file: string; index: number }> = []
    await runMigrations(db, {
      files,
      beforeEach: (file, index) => calls.push({ file, index }),
    })

    expect(calls).toHaveLength(3)
    expect(calls[0]!.index).toBe(0)
    expect(calls[1]!.index).toBe(1)
    expect(calls[2]!.index).toBe(2)
    expect(calls[0]!.file).toMatch(/schema\.sql$/)
  })

  it('rolls back the failing file and re-throws with file path', async () => {
    const brokenFile = join(brokenDir, 'schema.sql')
    await expect(runMigrations(db, { files: [brokenFile] })).rejects.toThrow(
      /migration file failed.*schema\.sql/i
    )

    // The valid INSERT in the broken file should NOT have persisted because
    // the file was wrapped in a transaction that rolled back.
    const tableExists = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rollback_test'")
      .first<{ name: string }>()
    expect(tableExists).toBeNull()
  })

  it('throws helpful error on missing file', async () => {
    await expect(runMigrations(db, { files: ['/nonexistent/migration.sql'] })).rejects.toThrow(
      /failed to read migration file/i
    )
  })
})
