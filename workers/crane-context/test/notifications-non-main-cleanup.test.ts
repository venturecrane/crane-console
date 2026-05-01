/**
 * Unit tests: runNonMainCleanup
 *
 * One-shot drain of any open notifications on non-protected branches.
 * Used post-deploy of the protected-branch ingestion gate to clear rows
 * that were ingested before the policy took effect.
 */

import { describe, it, expect } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
} from '@venturecrane/crane-test-harness'
import { createNotification, runNonMainCleanup, computeDedupeHash } from '../src/notifications'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

async function setupDb() {
  const db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  return db
}

async function insertOpenFailure(
  db: D1Database,
  opts: { branch: string; repo?: string; venture?: string }
): Promise<string> {
  const repo = opts.repo ?? 'venturecrane/sc-console'
  const dedupe = await computeDedupeHash({
    source: 'github',
    event_type: 'workflow_run.failure',
    repo,
    branch: opts.branch,
    content_key: `wr:${Math.random()}`,
  })
  const result = await createNotification(db, {
    source: 'github',
    event_type: 'workflow_run.failure',
    severity: 'critical',
    summary: `failure on ${opts.branch}`,
    details_json: '{}',
    dedupe_hash: dedupe,
    venture: opts.venture ?? 'sc',
    repo,
    branch: opts.branch,
    environment: 'production',
    actor_key_id: 'test',
  })
  return result.notification!.id
}

async function getStatus(db: D1Database, id: string): Promise<string> {
  const row = await db
    .prepare('SELECT status, auto_resolve_reason, resolved_at FROM notifications WHERE id = ?')
    .bind(id)
    .first<{ status: string; auto_resolve_reason: string | null; resolved_at: string | null }>()
  return row?.status ?? 'missing'
}

describe('runNonMainCleanup', () => {
  it('resolves all status=new rows on non-protected branches regardless of age', async () => {
    const db = await setupDb()
    const dependabotId = await insertOpenFailure(db, {
      branch: 'dependabot/npm_and_yarn/clerk/shared-3.47.5',
    })
    const featureId = await insertOpenFailure(db, { branch: 'feat/x' })

    const result = await runNonMainCleanup(db)

    expect(result.resolved_count).toBe(2)
    expect(await getStatus(db, dependabotId)).toBe('resolved')
    expect(await getStatus(db, featureId)).toBe('resolved')
  })

  it('leaves protected-branch rows untouched', async () => {
    const db = await setupDb()
    const mainId = await insertOpenFailure(db, { branch: 'main' })
    const masterId = await insertOpenFailure(db, { branch: 'master' })
    const productionId = await insertOpenFailure(db, { branch: 'production' })
    const dependabotId = await insertOpenFailure(db, { branch: 'dependabot/foo' })

    const result = await runNonMainCleanup(db)

    expect(result.resolved_count).toBe(1)
    expect(await getStatus(db, mainId)).toBe('new')
    expect(await getStatus(db, masterId)).toBe('new')
    expect(await getStatus(db, productionId)).toBe('new')
    expect(await getStatus(db, dependabotId)).toBe('resolved')
  })

  it('is idempotent — second call resolves zero rows', async () => {
    const db = await setupDb()
    await insertOpenFailure(db, { branch: 'feat/x' })
    await insertOpenFailure(db, { branch: 'dependabot/foo' })

    const first = await runNonMainCleanup(db)
    expect(first.resolved_count).toBe(2)

    const second = await runNonMainCleanup(db)
    expect(second.resolved_count).toBe(0)
  })

  it('sets auto_resolve_reason and resolved_at on cleaned rows', async () => {
    const db = await setupDb()
    const id = await insertOpenFailure(db, { branch: 'dependabot/foo' })

    await runNonMainCleanup(db)

    const row = await db
      .prepare(
        'SELECT status, auto_resolve_reason, resolved_at, updated_at FROM notifications WHERE id = ?'
      )
      .bind(id)
      .first<{
        status: string
        auto_resolve_reason: string | null
        resolved_at: string | null
        updated_at: string
      }>()

    expect(row?.status).toBe('resolved')
    expect(row?.auto_resolve_reason).toBe('aged_out_non_main')
    expect(row?.resolved_at).toBeTruthy()
    expect(row?.updated_at).toBeTruthy()
  })

  it('returns cutoff_days: 0 to distinguish from runStaleBranchSweep', async () => {
    const db = await setupDb()
    const result = await runNonMainCleanup(db)
    expect(result.cutoff_days).toBe(0)
  })
})
