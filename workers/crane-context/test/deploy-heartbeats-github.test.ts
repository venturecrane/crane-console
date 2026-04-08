/**
 * Unit tests for deploy-heartbeats GitHub payload adapters (Plan §B.6).
 *
 * These adapters live in crane-context (not crane-watch) so they can use
 * the canonical VENTURE_CONFIG. The tests verify:
 *   - venture lookup from repository.full_name
 *   - per-venture-class default cold thresholds
 *   - default-branch filtering (main only)
 *   - completed-only filtering for workflow_run
 *   - graceful null returns for unknown / malformed payloads
 */

import { describe, it, expect } from 'vitest'
import {
  ventureForRepo,
  defaultColdThresholdDays,
  adaptPushPayload,
  adaptWorkflowRunPayload,
} from '../src/deploy-heartbeats-github'

// ============================================================================
// ventureForRepo
// ============================================================================

describe('ventureForRepo', () => {
  it('returns the venture code for a known repo', () => {
    expect(ventureForRepo('venturecrane/crane-console')).toBe('vc')
  })

  it('returns null for unknown org', () => {
    expect(ventureForRepo('thirdparty/some-repo')).toBe(null)
  })

  it('returns null for unknown repo in known org', () => {
    expect(ventureForRepo('venturecrane/random-fork')).toBe(null)
  })

  it('returns null for malformed input', () => {
    expect(ventureForRepo('no-slash')).toBe(null)
    expect(ventureForRepo('')).toBe(null)
    expect(ventureForRepo('/leading-slash')).toBe(null)
  })

  it('does not cross-org collide (different orgs, same repo name)', () => {
    // Cross-org test: a repo named 'console' in two different orgs must
    // resolve independently. This is the same defense-in-depth as the
    // notification match_key cross-org test.
    expect(ventureForRepo('venturecrane/crane-console')).toBe('vc')
    expect(ventureForRepo('siliconcrane/crane-console')).toBe(null)
  })
})

// ============================================================================
// defaultColdThresholdDays
// ============================================================================

describe('defaultColdThresholdDays', () => {
  it('returns 7 days for infrastructure repos (crane-console)', () => {
    expect(defaultColdThresholdDays('venturecrane/crane-console')).toBe(7)
  })

  it('returns 2 days for content/marketing repos', () => {
    expect(defaultColdThresholdDays('venturecrane/vc-web')).toBe(2)
    expect(defaultColdThresholdDays('venturecrane/dc-marketing')).toBe(2)
  })

  it('returns 3 days for app/console repos by default', () => {
    expect(defaultColdThresholdDays('venturecrane/ke-console')).toBe(3)
    expect(defaultColdThresholdDays('venturecrane/sc-console')).toBe(3)
  })

  it('returns 3 days for unknown repos (safe default)', () => {
    expect(defaultColdThresholdDays('thirdparty/unknown')).toBe(3)
  })
})

// ============================================================================
// adaptPushPayload
// ============================================================================

describe('adaptPushPayload', () => {
  it('extracts venture, branch, sha, and timestamp from a main-branch push', () => {
    const result = adaptPushPayload({
      ref: 'refs/heads/main',
      after: 'abc123',
      head_commit: {
        id: 'abc123',
        timestamp: '2026-04-08T10:00:00Z',
      },
      repository: { full_name: 'venturecrane/crane-console' },
    })
    expect(result).toEqual({
      venture: 'vc',
      repo_full_name: 'venturecrane/crane-console',
      branch: 'main',
      commit_at: '2026-04-08T10:00:00Z',
      commit_sha: 'abc123',
    })
  })

  it('returns null for non-default-branch pushes (we only track main)', () => {
    expect(
      adaptPushPayload({
        ref: 'refs/heads/feature/foo',
        after: 'sha',
        head_commit: { id: 'sha', timestamp: '2026-04-08T10:00:00Z' },
        repository: { full_name: 'venturecrane/crane-console' },
      })
    ).toBeNull()
  })

  it('returns null for unknown repos (gracefully ignored)', () => {
    expect(
      adaptPushPayload({
        ref: 'refs/heads/main',
        after: 'sha',
        head_commit: { id: 'sha', timestamp: '2026-04-08T10:00:00Z' },
        repository: { full_name: 'thirdparty/random' },
      })
    ).toBeNull()
  })

  it('returns null for missing fields', () => {
    expect(adaptPushPayload(null)).toBeNull()
    expect(adaptPushPayload({})).toBeNull()
    expect(
      adaptPushPayload({
        ref: 'refs/heads/main',
        repository: { full_name: 'venturecrane/crane-console' },
        // missing head_commit + after
      })
    ).toBeNull()
  })
})

// ============================================================================
// adaptWorkflowRunPayload
// ============================================================================

describe('adaptWorkflowRunPayload', () => {
  function makeRun(overrides: Record<string, unknown> = {}) {
    return {
      action: 'completed',
      workflow_run: {
        id: 100,
        workflow_id: 12345,
        head_sha: 'abc123',
        head_branch: 'main',
        status: 'completed',
        conclusion: 'success',
        run_started_at: '2026-04-08T10:00:00Z',
        ...overrides,
      },
      repository: { full_name: 'venturecrane/crane-console' },
    }
  }

  it('extracts a typed RunObservation from a completed success run', () => {
    const result = adaptWorkflowRunPayload(makeRun())
    expect(result).toEqual({
      venture: 'vc',
      repo_full_name: 'venturecrane/crane-console',
      workflow_id: 12345,
      branch: 'main',
      run_id: 100,
      run_at: '2026-04-08T10:00:00Z',
      conclusion: 'success',
      head_sha: 'abc123',
    })
  })

  it('preserves the failure conclusion (so the heartbeat advances consecutive_failures)', () => {
    const result = adaptWorkflowRunPayload(makeRun({ conclusion: 'failure' }))
    expect(result?.conclusion).toBe('failure')
  })

  it('returns null for non-completed actions (in_progress / requested)', () => {
    expect(adaptWorkflowRunPayload({ ...makeRun(), action: 'in_progress' })).toBeNull()
    expect(adaptWorkflowRunPayload({ ...makeRun(), action: 'requested' })).toBeNull()
  })

  it('returns null for non-default-branch runs', () => {
    expect(
      adaptWorkflowRunPayload({
        ...makeRun(),
        workflow_run: { ...makeRun().workflow_run, head_branch: 'feature/foo' },
      })
    ).toBeNull()
  })

  it('returns null for unknown ventures', () => {
    expect(
      adaptWorkflowRunPayload({
        ...makeRun(),
        repository: { full_name: 'thirdparty/random' },
      })
    ).toBeNull()
  })

  it('returns null for missing workflow_id (legacy webhook payloads)', () => {
    expect(
      adaptWorkflowRunPayload({
        ...makeRun(),
        workflow_run: { ...makeRun().workflow_run, workflow_id: undefined },
      })
    ).toBeNull()
  })

  it('returns null for missing conclusion', () => {
    expect(
      adaptWorkflowRunPayload({
        ...makeRun(),
        workflow_run: { ...makeRun().workflow_run, conclusion: null },
      })
    ).toBeNull()
  })

  it('falls back to updated_at when run_started_at is missing', () => {
    const result = adaptWorkflowRunPayload({
      ...makeRun(),
      workflow_run: {
        ...makeRun().workflow_run,
        run_started_at: undefined,
        updated_at: '2026-04-08T11:30:00Z',
      },
    })
    expect(result?.run_at).toBe('2026-04-08T11:30:00Z')
  })
})
