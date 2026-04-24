/**
 * In-process D1 shim built on Node 22's `node:sqlite`.
 *
 * Implements the subset of `@cloudflare/workers-types`' `D1Database` surface
 * that real-world Cloudflare Workers + D1 ventures actually use:
 *
 *   - prepare(sql) → PreparedStatement
 *   - .bind(...args) → new PreparedStatement (chainable, re-bindable)
 *   - .first<T>() / .first<T>(colName) → first row or single column value
 *   - .all<T>() → D1Result with rows array
 *   - .run<T>() → D1Result with changes/last_row_id meta
 *   - .raw<T>() → array of arrays (column values per row)
 *   - batch(statements) → atomic transaction (BEGIN/COMMIT, ROLLBACK on failure)
 *   - exec(sql) → multi-statement execution (used by the migration runner)
 *
 * Deliberately NOT implemented (throws if called):
 *   - dump()      — no use case for tests, would require full DB serialization
 *   - withSession — D1 read-replica session API, not relevant in-process
 *
 * Init runs `PRAGMA foreign_keys = ON` so FK enforcement matches D1's default.
 *
 * For known semantic divergences from real D1, see D1_SEMANTIC_DIFFERENCES.md.
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite'
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
} from '@cloudflare/workers-types'

/**
 * Create a fresh in-memory SQLite database that satisfies the `D1Database`
 * interface. Each call returns a new isolated database — share between tests
 * by passing the returned instance into multiple `invoke()` calls.
 */
export function createTestD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  // Match D1's default FK enforcement.
  db.exec('PRAGMA foreign_keys = ON')

  // Cache prepared statements by SQL text so re-binding the same query
  // doesn't re-parse on every call. Mirrors D1's prepared statement caching.
  const stmtCache = new Map<string, StatementSync>()

  function getStmt(sql: string): StatementSync {
    let stmt = stmtCache.get(sql)
    if (!stmt) {
      stmt = db.prepare(sql)
      stmtCache.set(sql, stmt)
    }
    return stmt
  }

  const shim: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      return new ShimPreparedStatement(getStmt(sql), sql, []) as unknown as D1PreparedStatement
    },

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      // D1.batch is atomic: all statements succeed or all roll back.
      db.exec('BEGIN')
      try {
        const results: D1Result<T>[] = []
        for (const stmt of statements) {
          // We can only batch statements created by THIS shim.
          if (!(stmt instanceof ShimPreparedStatement)) {
            throw new Error(
              'crane-test-harness: batch() received a statement from a foreign D1 implementation'
            )
          }
          results.push((await stmt._runForBatch()) as D1Result<T>)
        }
        db.exec('COMMIT')
        return results
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },

    async exec(sql: string): Promise<D1ExecResult> {
      // D1.exec runs raw multi-statement SQL. Used by migration runners.
      // Matches D1's no-binding contract: parameter substitution is not supported.
      const start = performance.now()
      db.exec(sql)
      // Approximate the statement count by counting non-empty lines ending in ';'.
      // D1's exec result includes count + duration; both are advisory.
      const count = (sql.match(/;\s*(?=\S|$)/g) ?? []).length
      return {
        count,
        duration: Math.max(0, performance.now() - start),
      }
    },

    async dump(): Promise<ArrayBuffer> {
      throw new Error(
        'crane-test-harness: dump() is not implemented. ' +
          'Tests should not need to serialize the entire database.'
      )
    },

    // withSession is optional in the D1Database interface; we omit it.
  } as unknown as D1Database

  return shim
}

/**
 * Bound prepared statement. Each `.bind(...)` call returns a NEW instance
 * with the new args, preserving the original statement so the same `prepare()`
 * result can be re-used with different bindings.
 */
class ShimPreparedStatement {
  constructor(
    private readonly stmt: StatementSync,
    private readonly sql: string,
    private readonly args: unknown[]
  ) {}

  bind(...args: unknown[]): ShimPreparedStatement {
    // Coerce JS values that node:sqlite refuses to bind to compatible types.
    const coerced = args.map(coerceForBind)
    return new ShimPreparedStatement(this.stmt, this.sql, coerced)
  }

  // first() — single row, optionally a single column value
  // Overloaded to match D1's surface: first<T>() or first<T>(colName)
  async first<T = unknown>(colName?: string): Promise<T | null> {
    const row = this.stmt.get(...(this.args as never[]))
    if (row === undefined || row === null) return null
    if (colName !== undefined) {
      const value = (row as Record<string, unknown>)[colName]
      return value === undefined ? null : (value as T)
    }
    return row as T
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const rows = this.stmt.all(...(this.args as never[]))
    return {
      results: rows as T[],
      success: true,
      meta: makeMeta(),
    } as unknown as D1Result<T>
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const result = this.stmt.run(...(this.args as never[]))
    return {
      results: [] as T[],
      success: true,
      meta: {
        ...makeMeta(),
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
        rows_written: Number(result.changes),
        changed_db: Number(result.changes) > 0,
      },
    } as unknown as D1Result<T>
  }

  async raw<T = unknown>(): Promise<T[]> {
    // raw() returns each row as an array of column values rather than an object.
    const rows = this.stmt.all(...(this.args as never[])) as Record<string, unknown>[]
    return rows.map((row) => Object.values(row)) as T[]
  }

  // Internal: used by batch() to run a statement and return its full result.
  // SELECT/WITH statements must use all() to return rows; DML uses run() for metadata.
  async _runForBatch<T = unknown>(): Promise<D1Result<T>> {
    const trimmed = this.sql.trimStart().toUpperCase()
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
      return this.all<T>()
    }
    return this.run<T>()
  }
}

/**
 * Coerce JS values that node:sqlite refuses to bind to types it accepts.
 *
 * Real D1 quietly converts booleans to 0/1; node:sqlite throws on them.
 * We do the same coercion here so SQL written for D1 doesn't need to be
 * altered for tests.
 */
function coerceForBind(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

/**
 * Stub meta object. D1 populates real numbers from the edge runtime; for
 * in-process tests, the only fields handlers actually consume are `changes`
 * and `last_row_id` (populated in `run()`). Everything else is advisory.
 */
function makeMeta() {
  return {
    duration: 0,
    last_row_id: 0,
    changes: 0,
    served_by: 'crane-test-harness',
    internal_stats: null,
    rows_read: 0,
    rows_written: 0,
    size_after: 0,
    changed_db: false,
  }
}
