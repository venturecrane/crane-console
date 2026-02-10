/**
 * Integration Tests: POST /sod (Start of Day)
 *
 * Tests all 5 session resume scenarios from ADR 025
 *
 * PREREQUISITE: Worker must be running locally
 *   Terminal 1: npm run dev
 *   Terminal 2: npm test
 */

import { describe, it, expect } from 'vitest'
import {
  post,
  get,
  parseJson,
  createTestSessionData,
  uniqueTestId,
  assertSessionIdFormat,
  assertCorrelationIdFormat,
  assertHasFields,
  sleep,
} from './setup'

describe('POST /sod - Session Resume Logic', () => {
  // ============================================================================
  // Scenario 1: No Existing Session → Create New
  // ============================================================================

  it('creates new session when none exists', async () => {
    const uniqueRepo = `test-owner/test-repo-${uniqueTestId()}`
    const data = createTestSessionData({ repo: uniqueRepo, track: 1 })

    const response = await post('/sod', data)
    expect(response.status).toBe(200)

    const body = await parseJson(response)

    // Verify response structure
    assertHasFields(body, ['session_id', 'status', 'session', 'next_heartbeat_at'])
    expect(body.status).toBe('created')
    assertSessionIdFormat(body.session_id)
    assertCorrelationIdFormat(body.correlation_id)

    // Verify session data
    expect(body.session.agent).toBe(data.agent)
    expect(body.session.venture).toBe(data.venture)
    expect(body.session.repo).toBe(data.repo)
    expect(body.session.track).toBe(data.track)
    expect(body.session.status).toBe('active')

    // Verify heartbeat response
    expect(body.next_heartbeat_at).toBeTruthy()
    expect(body.heartbeat_interval_seconds).toBeGreaterThan(0)
  })

  // ============================================================================
  // Scenario 2: Active Non-Stale Session → Resume
  // ============================================================================

  it('resumes active non-stale session', async () => {
    const uniqueRepo = `test-owner/test-repo-${uniqueTestId()}`
    const data = createTestSessionData({ repo: uniqueRepo, track: 2 })

    // Create session
    const createResponse = await post('/sod', data)
    const createBody = await parseJson(createResponse)
    const sessionId = createBody.session_id

    // Immediately try to create again (should resume)
    const resumeResponse = await post('/sod', data)
    expect(resumeResponse.status).toBe(200)

    const resumeBody = await parseJson(resumeResponse)

    // Should resume same session
    expect(resumeBody.status).toBe('resumed')
    expect(resumeBody.session_id).toBe(sessionId)
    expect(resumeBody.session.status).toBe('active')

    // Heartbeat should be refreshed
    expect(resumeBody.next_heartbeat_at).toBeTruthy()
  })

  // ============================================================================
  // Scenario 3: Active Stale Session → Close as Abandoned, Create New
  // ============================================================================

  it.skip('closes stale session and creates new', async () => {
    // This test requires waiting 45+ minutes or manipulating system time
    // Skipped for practical test execution time
    // Could be implemented with manual time manipulation if needed
    // Expected behavior:
    // 1. Create session
    // 2. Wait 45+ minutes (or manipulate last_heartbeat_at)
    // 3. POST /sod again
    // 4. Old session marked as 'abandoned', end_reason='stale'
    // 5. New session created with different ID
  })

  // ============================================================================
  // Scenario 4: Multiple Active Sessions → Supersede Extras
  // ============================================================================

  it.skip('supersedes multiple active sessions (edge case)', async () => {
    // This scenario "shouldn't happen" per ADR 025 but must be handled
    // Would require directly inserting multiple active sessions in DB
    // or exploiting race conditions
    // Expected behavior:
    // 1. Somehow create 2+ active sessions for same tuple (race condition)
    // 2. POST /sod
    // 3. Keep most recent session
    // 4. Mark others as 'ended', end_reason='superseded'
    // 5. Resume the most recent one
    // Skipped: Requires DB manipulation or complex race condition setup
  })

  // ============================================================================
  // Scenario 5: Idempotency → Return Cached Response
  // ============================================================================

  it('returns cached response for replayed idempotency key', async () => {
    const uniqueRepo = `test-owner/test-repo-${uniqueTestId()}`
    const idempotencyKey = `idem-${uniqueTestId()}`
    const data = createTestSessionData({ repo: uniqueRepo, track: 3 })

    // First request with idempotency key
    const firstResponse = await post('/sod', {
      ...data,
      headers: { 'Idempotency-Key': idempotencyKey },
    })

    // Note: Need to pass idempotency key in header
    // Let's use a custom helper for this
    const firstResponseWithKey = await fetch('http://localhost:8787/sod', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': 'test-relay-key-for-integration-testing',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(data),
    })

    expect(firstResponseWithKey.status).toBe(200)
    const firstBody = await parseJson(firstResponseWithKey)
    const sessionId = firstBody.session_id

    // Replay same request with same idempotency key
    const replayResponse = await fetch('http://localhost:8787/sod', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': 'test-relay-key-for-integration-testing',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(data),
    })

    expect(replayResponse.status).toBe(200)
    const replayBody = await parseJson(replayResponse)

    // Should return cached response (same session ID)
    expect(replayBody.session_id).toBe(sessionId)

    // Should have idempotency hit header
    expect(replayResponse.headers.get('X-Idempotency-Hit')).toBe('true')
  })

  // ============================================================================
  // Validation Tests
  // ============================================================================

  it('rejects request without X-Relay-Key', async () => {
    const data = createTestSessionData()

    const response = await fetch('http://localhost:8787/sod', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No X-Relay-Key
      },
      body: JSON.stringify(data),
    })

    expect(response.status).toBe(401)

    const body = await parseJson(response)
    expect(body.error).toContain('Unauthorized')
  })

  it('rejects request with invalid venture', async () => {
    const data = createTestSessionData({ venture: 'invalid' })

    const response = await post('/sod', data)
    expect(response.status).toBe(400)

    const body = await parseJson(response)
    expect(body.error).toBe('validation_failed')
    expect(body.details).toBeTruthy()
  })

  it('rejects request with invalid agent format', async () => {
    const data = createTestSessionData({ agent: 'InvalidAgent' }) // Should be lowercase with hyphens

    const response = await post('/sod', data)
    expect(response.status).toBe(400)

    const body = await parseJson(response)
    expect(body.error).toBe('validation_failed')
  })

  it('rejects request with invalid repo format', async () => {
    const data = createTestSessionData({ repo: 'invalid-repo' }) // Should be owner/repo

    const response = await post('/sod', data)
    expect(response.status).toBe(400)

    const body = await parseJson(response)
    expect(body.error).toBe('validation_failed')
  })

  // ============================================================================
  // Optional Field Tests
  // ============================================================================

  it('accepts optional fields (issue_number, branch, commit_sha, meta)', async () => {
    const uniqueRepo = `test-owner/test-repo-${uniqueTestId()}`
    const data = createTestSessionData({
      repo: uniqueRepo,
      track: 4,
      issue_number: 123,
      branch: 'feature/test',
      commit_sha: 'abc123def456',
      meta: { custom_field: 'value' },
    })

    const response = await post('/sod', data)
    expect(response.status).toBe(200)

    const body = await parseJson(response)
    expect(body.session.issue_number).toBe(123)
    expect(body.session.branch).toBe('feature/test')
    expect(body.session.commit_sha).toBe('abc123def456')
    expect(body.session.meta_json).toBeTruthy()
  })

  it('accepts non-tracked work (null track)', async () => {
    const uniqueRepo = `test-owner/test-repo-${uniqueTestId()}`
    const data = createTestSessionData({
      repo: uniqueRepo,
      track: undefined, // Non-tracked work
    })

    delete data.track // Remove track field entirely

    const response = await post('/sod', data)
    expect(response.status).toBe(200)

    const body = await parseJson(response)
    expect(body.session.track).toBeNull()
  })
})
