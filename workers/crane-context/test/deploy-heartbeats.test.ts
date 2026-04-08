/**
 * Unit Tests: Deploy heartbeats data layer (Plan §B.6).
 *
 * Covers:
 *   - The cold-detection invariant (commits-without-deploy)
 *   - Per-venture threshold honoring
 *   - Suppression (T8: explicit, auditable, reversible)
 *   - Stale webhook detection
 *   - Idempotent commit/run upserts
 *   - Successive failures advance consecutive_failures
 *   - A success run resets consecutive_failures and advances last_success_at
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
  recordCommit,
  recordRun,
  listHeartbeats,
  findColdHeartbeats,
  findStaleWebhookHeartbeats,
  isHeartbeatCold,
  suppressHeartbeat,
  unsuppressHeartbeat,
  setColdThreshold,
  type DeployHeartbeat,
} from '../src/deploy-heartbeats'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

async function setupDb() {
  const db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  return db
}

const VC = 'vc'
const REPO = 'venturecrane/crane-console'
const WORKFLOW = 12345

function isoMinusDays(days: number, base: Date = new Date()): string {
  return new Date(base.getTime() - days * 86_400_000).toISOString()
}

function makeBaseHeartbeat(overrides: Partial<DeployHeartbeat> = {}): DeployHeartbeat {
  return {
    venture: VC,
    repo_full_name: REPO,
    workflow_id: WORKFLOW,
    branch: 'main',
    last_main_commit_at: null,
    last_main_commit_sha: null,
    last_success_at: null,
    last_success_sha: null,
    last_success_run_id: null,
    last_run_at: null,
    last_run_id: null,
    last_run_conclusion: null,
    consecutive_failures: 0,
    suppressed: 0,
    suppress_reason: null,
    suppress_until: null,
    cold_threshold_days: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================================================
// isHeartbeatCold — pure function tests
// ============================================================================

describe('isHeartbeatCold', () => {
  const NOW = new Date('2026-04-08T12:00:00Z')

  it('returns false when no commit has ever been recorded', () => {
    const hb = makeBaseHeartbeat()
    expect(isHeartbeatCold(hb, NOW)).toBe(false)
  })

  it('returns false when latest deploy is at or after latest commit', () => {
    const hb = makeBaseHeartbeat({
      last_main_commit_at: isoMinusDays(10, NOW),
      last_success_at: isoMinusDays(5, NOW),
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(false)
  })

  it('returns false when commit-without-deploy is within the threshold', () => {
    const hb = makeBaseHeartbeat({
      last_main_commit_at: isoMinusDays(2, NOW),
      cold_threshold_days: 3,
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(false)
  })

  it('returns true when commit-without-deploy exceeds the threshold (smd-web case)', () => {
    // The exact bug from the audit: 7 weeks of pushed commits with no
    // successful deploy. 49 days >> 2 days threshold for content ventures.
    const hb = makeBaseHeartbeat({
      last_main_commit_at: isoMinusDays(49, NOW),
      cold_threshold_days: 2,
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(true)
  })

  it('returns true when last deploy is OLDER than latest commit (regression after success)', () => {
    const hb = makeBaseHeartbeat({
      last_main_commit_at: isoMinusDays(5, NOW),
      last_success_at: isoMinusDays(10, NOW), // older — superseded by new commit
      cold_threshold_days: 3,
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(true)
  })

  it('returns false for suppressed heartbeats even if technically cold', () => {
    const hb = makeBaseHeartbeat({
      last_main_commit_at: isoMinusDays(49, NOW),
      cold_threshold_days: 2,
      suppressed: 1,
      suppress_reason: 'archived',
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(false)
  })

  it('honors suppress_until timestamps in the future', () => {
    const futureDate = new Date(NOW.getTime() + 7 * 86_400_000).toISOString()
    const hb = makeBaseHeartbeat({
      last_main_commit_at: isoMinusDays(49, NOW),
      cold_threshold_days: 2,
      suppress_until: futureDate,
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(false)
  })

  it('returns true after suppress_until expires', () => {
    const pastDate = new Date(NOW.getTime() - 86_400_000).toISOString()
    const hb = makeBaseHeartbeat({
      last_main_commit_at: isoMinusDays(49, NOW),
      cold_threshold_days: 2,
      suppress_until: pastDate,
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(true)
  })

  it('venture-template (no commits) is NEVER cold even with low threshold', () => {
    const hb = makeBaseHeartbeat({
      last_main_commit_at: null,
      cold_threshold_days: 1,
    })
    expect(isHeartbeatCold(hb, NOW)).toBe(false)
  })
})

// ============================================================================
// recordCommit / recordRun — D1 round-trip tests
// ============================================================================

describe('recordCommit', () => {
  it('inserts a new heartbeat row when none exists', async () => {
    const db = await setupDb()
    await recordCommit(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      commit_at: '2026-04-08T10:00:00Z',
      commit_sha: 'abc123',
    })
    const rows = await listHeartbeats(db, VC)
    expect(rows).toHaveLength(1)
    expect(rows[0].last_main_commit_sha).toBe('abc123')
    expect(rows[0].last_main_commit_at).toBe('2026-04-08T10:00:00Z')
  })

  it('updates only commit fields on subsequent commits, leaves deploy state alone', async () => {
    const db = await setupDb()
    await recordRun(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      run_id: 100,
      run_at: '2026-04-08T09:00:00Z',
      conclusion: 'success',
      head_sha: 'old_sha',
    })
    await recordCommit(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      commit_at: '2026-04-08T10:00:00Z',
      commit_sha: 'new_sha',
    })
    const rows = await listHeartbeats(db, VC)
    expect(rows[0].last_success_sha).toBe('old_sha') // preserved
    expect(rows[0].last_main_commit_sha).toBe('new_sha') // updated
  })
})

describe('recordRun', () => {
  it('a success run advances last_success_at and resets consecutive_failures', async () => {
    const db = await setupDb()
    await recordRun(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      run_id: 100,
      run_at: '2026-04-08T10:00:00Z',
      conclusion: 'failure',
      head_sha: 'sha1',
    })
    await recordRun(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      run_id: 101,
      run_at: '2026-04-08T11:00:00Z',
      conclusion: 'failure',
      head_sha: 'sha2',
    })
    let rows = await listHeartbeats(db, VC)
    expect(rows[0].consecutive_failures).toBe(2)
    expect(rows[0].last_success_at).toBeNull()

    await recordRun(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      run_id: 102,
      run_at: '2026-04-08T12:00:00Z',
      conclusion: 'success',
      head_sha: 'sha3',
    })
    rows = await listHeartbeats(db, VC)
    expect(rows[0].consecutive_failures).toBe(0)
    expect(rows[0].last_success_at).toBe('2026-04-08T12:00:00Z')
    expect(rows[0].last_success_sha).toBe('sha3')
    expect(rows[0].last_success_run_id).toBe(102)
  })

  it('a failure run does NOT advance last_success_at', async () => {
    const db = await setupDb()
    await recordRun(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      run_id: 100,
      run_at: '2026-04-08T10:00:00Z',
      conclusion: 'success',
      head_sha: 'sha1',
    })
    await recordRun(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      run_id: 101,
      run_at: '2026-04-08T11:00:00Z',
      conclusion: 'failure',
      head_sha: 'sha2',
    })
    const rows = await listHeartbeats(db, VC)
    expect(rows[0].last_success_sha).toBe('sha1') // preserved
    expect(rows[0].last_run_conclusion).toBe('failure')
    expect(rows[0].consecutive_failures).toBe(1)
  })
})

// ============================================================================
// findColdHeartbeats — integration test
// ============================================================================

describe('findColdHeartbeats', () => {
  it('returns smd-web-style stuck commits but NOT venture-template-style dormant repos', async () => {
    const db = await setupDb()
    const NOW = new Date('2026-04-08T12:00:00Z')

    // smd-web: 49 days of commits, no successful deploy. SHOULD be cold.
    await recordCommit(db, {
      venture: 'smd',
      repo_full_name: 'smdservices/smd-web',
      workflow_id: 1,
      commit_at: isoMinusDays(49, NOW),
      commit_sha: 'broken_sha',
    })
    await setColdThreshold(db, {
      venture: 'smd',
      repo_full_name: 'smdservices/smd-web',
      workflow_id: 1,
      cold_threshold_days: 2,
    })

    // venture-template: NO main commits. Should NOT be cold.
    // (We don't record any commits — the row simply doesn't exist.)

    // crane-console: recent commit AND recent success. NOT cold.
    await recordCommit(db, {
      venture: 'vc',
      repo_full_name: 'venturecrane/crane-console',
      workflow_id: 2,
      commit_at: isoMinusDays(1, NOW),
      commit_sha: 'happy_sha',
    })
    await recordRun(db, {
      venture: 'vc',
      repo_full_name: 'venturecrane/crane-console',
      workflow_id: 2,
      run_id: 200,
      run_at: isoMinusDays(0.5, NOW),
      conclusion: 'success',
      head_sha: 'happy_sha',
    })

    const smdCold = await findColdHeartbeats(db, 'smd', NOW)
    expect(smdCold).toHaveLength(1)
    expect(smdCold[0].repo_full_name).toBe('smdservices/smd-web')
    expect(smdCold[0].age_ms).toBeGreaterThan(48 * 86_400_000)

    const vcCold = await findColdHeartbeats(db, 'vc', NOW)
    expect(vcCold).toHaveLength(0)
  })
})

// ============================================================================
// findStaleWebhookHeartbeats
// ============================================================================

describe('findStaleWebhookHeartbeats', () => {
  it('flags recent commits with no run recorded since the commit', async () => {
    const db = await setupDb()
    const NOW = new Date('2026-04-08T12:00:00Z')

    // Recent commit but no run: webhook silence.
    await recordCommit(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      commit_at: isoMinusDays(0.25, NOW), // 6h ago
      commit_sha: 'recent',
    })

    const stale = await findStaleWebhookHeartbeats(db, VC, 12, NOW)
    expect(stale).toHaveLength(1)
  })

  it('does NOT flag when a run was recorded after the commit', async () => {
    const db = await setupDb()
    const NOW = new Date('2026-04-08T12:00:00Z')

    await recordCommit(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      commit_at: isoMinusDays(0.25, NOW),
      commit_sha: 'recent',
    })
    await recordRun(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      run_id: 1,
      run_at: isoMinusDays(0.2, NOW),
      conclusion: 'success',
      head_sha: 'recent',
    })

    const stale = await findStaleWebhookHeartbeats(db, VC, 12, NOW)
    expect(stale).toHaveLength(0)
  })
})

// ============================================================================
// Suppression (T8: explicit, auditable, reversible)
// ============================================================================

describe('suppressHeartbeat / unsuppressHeartbeat', () => {
  it('suppresses with reason and reverses cleanly', async () => {
    const db = await setupDb()

    await recordCommit(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      commit_at: '2026-04-08T10:00:00Z',
      commit_sha: 'sha',
    })

    await suppressHeartbeat(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
      reason: 'archived 2026-04-01',
    })

    let rows = await listHeartbeats(db, VC)
    expect(rows[0].suppressed).toBe(1)
    expect(rows[0].suppress_reason).toBe('archived 2026-04-01')

    await unsuppressHeartbeat(db, {
      venture: VC,
      repo_full_name: REPO,
      workflow_id: WORKFLOW,
    })

    rows = await listHeartbeats(db, VC)
    expect(rows[0].suppressed).toBe(0)
    expect(rows[0].suppress_reason).toBeNull()
  })
})
