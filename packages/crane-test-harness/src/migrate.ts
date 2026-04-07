/**
 * Migration runner.
 *
 * Applies an ordered list of `.sql` files against an in-process D1 shim.
 * Each file runs inside its own `BEGIN; ... COMMIT;` transaction so partial
 * failures roll back cleanly. This matches `wrangler d1 migrations apply`
 * semantics: a migration file is atomic.
 *
 * The runner does NOT glob or sort. The caller passes an explicit ordered
 * list. This is the single mitigation against the lexicographic ordering
 * trap where `'schema.sql' > '0022_*.sql'` because `'s' > '0'` in ASCII.
 *
 * For ventures whose migration layout matches the common pattern of
 * `schema.sql` (base) plus numbered incremental files (`0NNN_name.sql`),
 * use `discoverNumericMigrations(dir)` as the file list source.
 *
 * Migration files MUST NOT contain their own transaction control
 * (BEGIN/COMMIT/ROLLBACK). The runner wraps each file in one transaction;
 * nested transactions are not supported.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { D1Database } from '@cloudflare/workers-types'

export interface RunMigrationsOptions {
  /**
   * Absolute paths to migration files, in the exact order they should be applied.
   * Use `discoverNumericMigrations()` to build this for the common base+numbered layout.
   */
  files: string[]

  /**
   * Optional callback invoked just before each file is applied. Useful for
   * test logging or progress reporting.
   */
  beforeEach?: (file: string, index: number) => void
}

/**
 * Apply each file in `files` to `db` in order. Each file runs inside its own
 * BEGIN/COMMIT transaction. If any file fails, that file's changes are rolled
 * back and the error is re-thrown with the failing file path attached.
 *
 * Earlier successfully-applied files are NOT rolled back — fix the broken
 * migration and re-run against a fresh `createTestD1()` instance.
 */
export async function runMigrations(db: D1Database, options: RunMigrationsOptions): Promise<void> {
  for (const [index, file] of options.files.entries()) {
    options.beforeEach?.(file, index)
    let sql: string
    try {
      sql = readFileSync(file, 'utf8')
    } catch (err) {
      throw new Error(
        `crane-test-harness: failed to read migration file ${file}: ${(err as Error).message}`
      )
    }

    // Wrap each file in its own transaction. node:sqlite's exec() runs
    // multiple statements but does not implicitly transactionalize them.
    try {
      await db.exec(`BEGIN; ${sql}; COMMIT;`)
    } catch (err) {
      // Best-effort rollback. If exec() failed mid-statement, the transaction
      // may already be in an aborted state; the rollback either succeeds or
      // is a no-op.
      try {
        await db.exec('ROLLBACK')
      } catch {
        // Swallow — the original error is what matters.
      }
      throw new Error(
        `crane-test-harness: migration file failed: ${file}\n` +
          `  underlying error: ${(err as Error).message}`
      )
    }
  }
}

export interface DiscoverNumericMigrationsOptions {
  /**
   * Filename of the base schema file. This file (if it exists) is always
   * applied first, before any numbered migrations.
   * @default 'schema.sql'
   */
  baseFile?: string

  /**
   * Regex matched against filenames in `dir`. Files matching this pattern
   * are sorted lexicographically — which is correct ONLY when filenames
   * use a fixed-width zero-padded numeric prefix (e.g. `0001_*`, `0022_*`).
   * @default /^\d{4}_.+\.sql$/
   */
  pattern?: RegExp
}

/**
 * Discover migration files in a directory using the common
 * "base schema + numbered incremental" layout.
 *
 * Returns a list with the base file first (if present), followed by all
 * files matching the numbered pattern in lexicographic order. Because the
 * default pattern requires a 4-digit prefix, lexicographic sort is
 * equivalent to numeric sort within the matching set.
 *
 * The base file is special-cased because in many real codebases its
 * filename (e.g. `schema.sql`) sorts AFTER all the numbered files in plain
 * lexicographic order, which would apply the base last and break.
 *
 * Domain-agnostic: this function does not know about any specific venture's
 * migration conventions beyond the base+numbered shape.
 */
export function discoverNumericMigrations(
  dir: string,
  options: DiscoverNumericMigrationsOptions = {}
): string[] {
  const baseFile = options.baseFile ?? 'schema.sql'
  const pattern = options.pattern ?? /^\d{4}_.+\.sql$/

  if (!existsSync(dir)) {
    throw new Error(`crane-test-harness: discoverNumericMigrations: directory not found: ${dir}`)
  }

  const all = readdirSync(dir)
  const numbered = all.filter((f) => pattern.test(f)).sort()
  const result: string[] = []

  const baseFilePath = join(dir, baseFile)
  if (existsSync(baseFilePath)) {
    result.push(baseFilePath)
  }
  for (const f of numbered) {
    result.push(join(dir, f))
  }

  return result
}
