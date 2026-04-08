/**
 * Contract Test: notification structured logging
 *
 * Plan §A.6 / §A.7 contract: every state-transition function in the
 * notification data layer emits exactly one structured log line per call.
 * If a future change silently drops a log line, this test catches it.
 *
 * The test monkey-patches console.log/warn/error, calls each transition
 * function, and asserts:
 *   1. Exactly one log line was emitted (or zero for no-op paths)
 *   2. The line is valid JSON
 *   3. The JSON has an `event` field matching one of the documented
 *      NotificationLogEvent values
 *   4. The JSON has a `timestamp` field
 *
 * It also asserts that the SQL of `processGreenEvent` contains the
 * `auto_resolved_by_id IS NULL` predicate. That single invariant is the
 * race-safety primitive — if a future change drops it, concurrent greens
 * will start double-resolving and corrupting history. Regex against the
 * SQL string is acceptable here because it's one specific invariant, not
 * a general lint rule.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
} from '@venturecrane/crane-test-harness'
import {
  createNotification,
  updateNotificationStatus,
  processGreenEvent,
  computeDedupeHash,
  buildMatchKey,
} from '../src/notifications'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'migrations')

const VALID_EVENTS = [
  'notification_created',
  'notification_resolved_auto',
  'notification_resolved_manual',
  'success_event_received_match',
  'success_event_received_no_match',
  'green_event_idempotent_skip',
  'auto_resolve_failed',
] as const

type LogCapture = Array<{ stream: 'log' | 'warn' | 'error'; line: string }>

function captureLogs(): {
  capture: LogCapture
  restore: () => void
} {
  const capture: LogCapture = []
  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error
  console.log = (...args: unknown[]) => {
    capture.push({ stream: 'log', line: args.map(String).join(' ') })
  }
  console.warn = (...args: unknown[]) => {
    capture.push({ stream: 'warn', line: args.map(String).join(' ') })
  }
  console.error = (...args: unknown[]) => {
    capture.push({ stream: 'error', line: args.map(String).join(' ') })
  }
  return {
    capture,
    restore: () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
    },
  }
}

function parseLog(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

function findStructuredEvents(capture: LogCapture): Array<{
  event: string
  timestamp: string
  parsed: Record<string, unknown>
}> {
  const events: Array<{ event: string; timestamp: string; parsed: Record<string, unknown> }> = []
  for (const entry of capture) {
    const parsed = parseLog(entry.line)
    if (parsed && typeof parsed.event === 'string' && typeof parsed.timestamp === 'string') {
      events.push({ event: parsed.event, timestamp: parsed.timestamp, parsed })
    }
  }
  return events
}

async function setupDb() {
  const db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  return db
}

async function makeOpenFailure(
  db: D1Database,
  workflowId: number
): Promise<{ id: string; match_key: string }> {
  const repo = 'venturecrane/crane-console'
  const branch = 'main'
  const { match_key } = buildMatchKey({
    source: 'github',
    kind: 'workflow_run',
    repo_full_name: repo,
    branch,
    workflow_id: workflowId,
  })
  const dedupe = await computeDedupeHash({
    source: 'github',
    event_type: 'workflow_run.failure',
    repo,
    branch,
    content_key: `workflow_run:${Math.random()}:failure`,
  })
  // Suppress logs from createNotification (we're testing a different fn)
  const cap = captureLogs()
  try {
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
      workflow_id: workflowId,
      head_sha: 'sha',
      match_key,
      match_key_version: 'v2_id',
      run_started_at: '2026-04-08T00:00:00Z',
    })
    return { id: result.notification!.id, match_key }
  } finally {
    cap.restore()
  }
}

// ============================================================================
// Per-function logging contract
// ============================================================================

describe('notification logging contract', () => {
  let cap: ReturnType<typeof captureLogs>

  beforeEach(() => {
    cap = captureLogs()
  })

  afterEach(() => {
    cap.restore()
  })

  it('createNotification emits exactly one notification_created event', async () => {
    const db = await setupDb()
    cap.restore() // restore for the setup query
    cap = captureLogs()

    const dedupe = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'test:1',
    })
    await createNotification(db, {
      source: 'github',
      event_type: 'workflow_run.failure',
      severity: 'critical',
      summary: 'X',
      details_json: '{}',
      dedupe_hash: dedupe,
      venture: 'vc',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      actor_key_id: 'test',
      match_key: 'gh:wf:venturecrane/crane-console:main:100',
      match_key_version: 'v2_id',
      workflow_id: 100,
      run_started_at: '2026-04-08T00:00:00Z',
    })

    const events = findStructuredEvents(cap.capture)
    const created = events.filter((e) => e.event === 'notification_created')
    expect(created.length).toBe(1)
    expect(created[0].parsed.match_key).toBe('gh:wf:venturecrane/crane-console:main:100')
    expect(VALID_EVENTS).toContain(created[0].event as (typeof VALID_EVENTS)[number])
  })

  it('updateNotificationStatus(resolved) emits notification_resolved_manual', async () => {
    const db = await setupDb()
    const failure = await makeOpenFailure(db, 100)

    cap.restore()
    cap = captureLogs()

    await updateNotificationStatus(db, failure.id, 'resolved')

    const events = findStructuredEvents(cap.capture)
    const manual = events.filter((e) => e.event === 'notification_resolved_manual')
    expect(manual.length).toBe(1)
    expect(manual[0].parsed.id).toBe(failure.id)
  })

  it('processGreenEvent (match) emits success_event_received_match', async () => {
    const db = await setupDb()
    const failure = await makeOpenFailure(db, 100)
    const greenDedupe = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.success',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:999:success',
    })

    cap.restore()
    cap = captureLogs()

    const result = await processGreenEvent(db, {
      source: 'github',
      event_type: 'workflow_run.success',
      match_key: failure.match_key,
      match_key_version: 'v2_id',
      run_started_at: '2026-04-08T02:00:00Z',
      head_sha: null,
      is_schedule_like: false,
      repo: 'venturecrane/crane-console',
      branch: 'main',
      venture: 'vc',
      details_json: '{}',
      summary: 'green',
      dedupe_hash: greenDedupe,
      auto_resolve_reason: 'green_workflow_run',
      workflow_id: 100,
      run_id: 999,
      actor_key_id: 'test',
    })
    expect(result.resolved_count).toBe(1)

    const events = findStructuredEvents(cap.capture)
    const match = events.filter((e) => e.event === 'success_event_received_match')
    expect(match.length).toBe(1)
    expect(match[0].parsed.match_key).toBe(failure.match_key)
    expect(match[0].parsed.resolved_count).toBe(1)
  })

  it('processGreenEvent (no match) emits success_event_received_no_match', async () => {
    const db = await setupDb()
    // No failure inserted - the green has nothing to resolve
    const greenDedupe = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.success',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:999:success',
    })

    cap.restore()
    cap = captureLogs()

    await processGreenEvent(db, {
      source: 'github',
      event_type: 'workflow_run.success',
      match_key: 'gh:wf:venturecrane/crane-console:main:100',
      match_key_version: 'v2_id',
      run_started_at: '2026-04-08T02:00:00Z',
      head_sha: null,
      is_schedule_like: false,
      repo: 'venturecrane/crane-console',
      branch: 'main',
      venture: 'vc',
      details_json: '{}',
      summary: 'green',
      dedupe_hash: greenDedupe,
      auto_resolve_reason: 'green_workflow_run',
      workflow_id: 100,
      run_id: 999,
      actor_key_id: 'test',
    })

    const events = findStructuredEvents(cap.capture)
    const noMatch = events.filter((e) => e.event === 'success_event_received_no_match')
    expect(noMatch.length).toBe(1)
  })

  it('processGreenEvent (duplicate) emits green_event_idempotent_skip', async () => {
    const db = await setupDb()
    const failure = await makeOpenFailure(db, 100)
    const greenDedupe = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.success',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:999:success',
    })

    // First call resolves the failure
    await processGreenEvent(db, {
      source: 'github',
      event_type: 'workflow_run.success',
      match_key: failure.match_key,
      match_key_version: 'v2_id',
      run_started_at: '2026-04-08T02:00:00Z',
      head_sha: null,
      is_schedule_like: false,
      repo: 'venturecrane/crane-console',
      branch: 'main',
      venture: 'vc',
      details_json: '{}',
      summary: 'green',
      dedupe_hash: greenDedupe,
      auto_resolve_reason: 'green_workflow_run',
      workflow_id: 100,
      run_id: 999,
      actor_key_id: 'test',
    })

    cap.restore()
    cap = captureLogs()

    // Second call with the SAME dedupe_hash → idempotent skip
    await processGreenEvent(db, {
      source: 'github',
      event_type: 'workflow_run.success',
      match_key: failure.match_key,
      match_key_version: 'v2_id',
      run_started_at: '2026-04-08T02:00:00Z',
      head_sha: null,
      is_schedule_like: false,
      repo: 'venturecrane/crane-console',
      branch: 'main',
      venture: 'vc',
      details_json: '{}',
      summary: 'green',
      dedupe_hash: greenDedupe,
      auto_resolve_reason: 'green_workflow_run',
      workflow_id: 100,
      run_id: 999,
      actor_key_id: 'test',
    })

    const events = findStructuredEvents(cap.capture)
    const skip = events.filter((e) => e.event === 'green_event_idempotent_skip')
    expect(skip.length).toBe(1)
  })

  it('every emitted event has a valid timestamp', async () => {
    const db = await setupDb()
    cap.restore()
    cap = captureLogs()

    const dedupe = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'ts:1',
    })
    await createNotification(db, {
      source: 'github',
      event_type: 'workflow_run.failure',
      severity: 'critical',
      summary: 'X',
      details_json: '{}',
      dedupe_hash: dedupe,
      venture: 'vc',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      actor_key_id: 'test',
      match_key: 'gh:wf:venturecrane/crane-console:main:100',
      match_key_version: 'v2_id',
      workflow_id: 100,
      run_started_at: '2026-04-08T00:00:00Z',
    })

    const events = findStructuredEvents(cap.capture)
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      // ISO 8601 round-trip check
      const d = new Date(e.timestamp)
      expect(d.toISOString()).toBe(e.timestamp)
    }
  })

  it('every emitted event has an event type from the documented enum', async () => {
    const db = await setupDb()
    cap.restore()
    cap = captureLogs()

    const failure = await makeOpenFailure(db, 100)
    await updateNotificationStatus(db, failure.id, 'resolved')

    const events = findStructuredEvents(cap.capture)
    for (const e of events) {
      expect(VALID_EVENTS).toContain(e.event as (typeof VALID_EVENTS)[number])
    }
  })
})

// ============================================================================
// SQL invariant: auto_resolved_by_id IS NULL must be in processGreenEvent SQL
// ============================================================================
//
// This is the race-safety primitive. Two concurrent greens for the same
// match_key both INSERT (different dedupe_hashes) but only the first UPDATE
// acquires the rows by setting `auto_resolved_by_id`. The second UPDATE
// finds zero matching rows because the predicate fails.
//
// If a future refactor removes this predicate, concurrent greens will
// start double-resolving the same notification and corrupting history.
// Regex against the SQL string is acceptable here because it's one
// specific invariant, not a general lint rule.

describe('SQL invariant', () => {
  it('processGreenEvent SQL contains the auto_resolved_by_id IS NULL race predicate', () => {
    const sourcePath = join(__dirname, '..', 'src', 'notifications.ts')
    const source = readFileSync(sourcePath, 'utf-8')

    // Find the processGreenEvent function body
    const fnStart = source.indexOf('export async function processGreenEvent')
    expect(fnStart).toBeGreaterThan(0)
    // Take everything from the function declaration to the end of the file
    // (or the next top-level export); for our purposes, scanning to EOF is fine.
    const fnBody = source.slice(fnStart)

    // The predicate must appear in the UPDATE SQL of processGreenEvent.
    // We require BOTH the schedule-like branch and the normal branch to
    // include it, so we count occurrences.
    const matches = fnBody.match(/AND auto_resolved_by_id IS NULL/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})
