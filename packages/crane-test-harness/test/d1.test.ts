/**
 * D1 shim contract tests.
 *
 * These verify that `createTestD1()` returns an object that behaves like
 * Cloudflare D1 for the subset of the API we care about. Each test isolates
 * one behavior the shim has to get right; if any of these regress, the
 * Miniflare canary in workers/crane-context/test/canary will likely also
 * fail at PR time, but these run cheaper and pinpoint the broken primitive.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createTestD1 } from '../src/d1.js'
import type { D1Database } from '@cloudflare/workers-types'

describe('createTestD1', () => {
  let db: D1Database

  beforeEach(async () => {
    db = createTestD1()
    await db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        bio TEXT
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `)
  })

  describe('prepare + first', () => {
    it('returns the row when found', async () => {
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice').run()
      const row = await db
        .prepare('SELECT id, name, active FROM users WHERE id = ?')
        .bind(1)
        .first<{ id: number; name: string; active: number }>()
      expect(row).toEqual({ id: 1, name: 'Alice', active: 1 })
    })

    it('returns null when no row matches', async () => {
      const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(999).first()
      expect(row).toBeNull()
    })

    it('first(colName) returns just the named column', async () => {
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice').run()
      const name = await db
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(1)
        .first<string>('name')
      expect(name).toBe('Alice')
    })
  })

  describe('prepare + all', () => {
    it('returns multiple rows', async () => {
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice').run()
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(2, 'Bob').run()
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(3, 'Carol').run()

      const result = await db
        .prepare('SELECT id, name FROM users ORDER BY id')
        .all<{ id: number; name: string }>()

      expect(result.success).toBe(true)
      expect(result.results).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Carol' },
      ])
    })

    it('returns empty results array for no matches', async () => {
      const result = await db.prepare('SELECT * FROM users WHERE name = ?').bind('nobody').all()
      expect(result.success).toBe(true)
      expect(result.results).toEqual([])
    })
  })

  describe('prepare + run', () => {
    it('reports changes count and last_row_id in meta', async () => {
      const result = await db
        .prepare('INSERT INTO users (id, name) VALUES (?, ?)')
        .bind(42, 'Dave')
        .run()

      expect(result.success).toBe(true)
      expect(result.meta.changes).toBe(1)
      // SQLite uses the explicit id 42 as the rowid for INTEGER PRIMARY KEY.
      expect(result.meta.last_row_id).toBe(42)
    })

    it('updates report changes count', async () => {
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice').run()
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(2, 'Bob').run()

      const result = await db.prepare('UPDATE users SET active = 0').run()
      expect(result.meta.changes).toBe(2)
    })
  })

  describe('bind', () => {
    it('returns a NEW statement; original can be re-bound', async () => {
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice').run()
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(2, 'Bob').run()

      const stmt = db.prepare('SELECT name FROM users WHERE id = ?')
      const u1 = await stmt.bind(1).first<{ name: string }>()
      const u2 = await stmt.bind(2).first<{ name: string }>()

      expect(u1?.name).toBe('Alice')
      expect(u2?.name).toBe('Bob')
    })

    it('coerces booleans to 0/1 (D1 compatibility)', async () => {
      await db
        .prepare('INSERT INTO users (id, name, active) VALUES (?, ?, ?)')
        .bind(1, 'Alice', true)
        .run()
      await db
        .prepare('INSERT INTO users (id, name, active) VALUES (?, ?, ?)')
        .bind(2, 'Bob', false)
        .run()

      const alice = await db
        .prepare('SELECT active FROM users WHERE id = 1')
        .first<{ active: number }>()
      const bob = await db
        .prepare('SELECT active FROM users WHERE id = 2')
        .first<{ active: number }>()

      expect(alice?.active).toBe(1)
      expect(bob?.active).toBe(0)
    })

    it('coerces undefined to null', async () => {
      // INSERT into a nullable column with bound undefined should store NULL.
      // node:sqlite throws on undefined directly; the shim coerces it to null.
      await db
        .prepare('INSERT INTO users (id, name, bio) VALUES (?, ?, ?)')
        .bind(1, 'Alice', undefined)
        .run()
      const row = await db
        .prepare('SELECT bio FROM users WHERE id = 1')
        .first<{ bio: string | null }>()
      expect(row?.bio).toBeNull()
    })
  })

  describe('foreign key enforcement', () => {
    it('rejects inserting a child with a missing parent', async () => {
      await expect(
        db.prepare('INSERT INTO posts (user_id, title) VALUES (?, ?)').bind(999, 'Orphan').run()
      ).rejects.toThrow(/FOREIGN KEY/i)
    })

    it('allows inserting a child with a valid parent', async () => {
      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice').run()
      const result = await db
        .prepare('INSERT INTO posts (user_id, title) VALUES (?, ?)')
        .bind(1, 'Hello')
        .run()
      expect(result.success).toBe(true)
    })
  })

  describe('batch', () => {
    it('runs all statements atomically on success', async () => {
      const result = await db.batch([
        db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice'),
        db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(2, 'Bob'),
      ])

      expect(result).toHaveLength(2)
      expect(result[0]!.success).toBe(true)
      expect(result[1]!.success).toBe(true)

      const count = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>()
      expect(count?.c).toBe(2)
    })

    it('rolls back all statements when one fails', async () => {
      // First statement is valid; second references a missing FK parent.
      await expect(
        db.batch([
          db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice'),
          db.prepare('INSERT INTO posts (user_id, title) VALUES (?, ?)').bind(999, 'Orphan'),
        ])
      ).rejects.toThrow(/FOREIGN KEY/i)

      // Alice should NOT be in the DB — the whole batch was rolled back.
      const count = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>()
      expect(count?.c).toBe(0)
    })
  })

  describe('exec', () => {
    it('runs multi-statement SQL', async () => {
      await db.exec(`
        INSERT INTO users (id, name) VALUES (1, 'Alice');
        INSERT INTO users (id, name) VALUES (2, 'Bob');
        INSERT INTO users (id, name) VALUES (3, 'Carol');
      `)
      const count = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>()
      expect(count?.c).toBe(3)
    })

    it('returns count and duration', async () => {
      const result = await db.exec(`
        INSERT INTO users (id, name) VALUES (1, 'Alice');
        INSERT INTO users (id, name) VALUES (2, 'Bob');
      `)
      expect(result.count).toBeGreaterThanOrEqual(2)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('isolation', () => {
    it('two separate createTestD1 calls return independent databases', async () => {
      const db2 = createTestD1()
      await db2.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')

      await db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Alice').run()
      await db2.prepare('INSERT INTO users (id, name) VALUES (?, ?)').bind(1, 'Bob').run()

      const fromDb1 = await db
        .prepare('SELECT name FROM users WHERE id = 1')
        .first<{ name: string }>()
      const fromDb2 = await db2
        .prepare('SELECT name FROM users WHERE id = 1')
        .first<{ name: string }>()

      expect(fromDb1?.name).toBe('Alice')
      expect(fromDb2?.name).toBe('Bob')
    })
  })

  describe('not implemented', () => {
    it('dump() throws', async () => {
      await expect(db.dump()).rejects.toThrow(/not implemented/i)
    })
  })
})
