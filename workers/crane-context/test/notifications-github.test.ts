/**
 * Unit Tests: GitHub Event Normalizers
 *
 * Tests each event type x conclusion x branch combination.
 * Verifies severity rules and normalization output.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeWorkflowRun,
  normalizeCheckSuite,
  normalizeCheckRun,
  normalizeGitHubEvent,
} from '../src/notifications-github'

// ============================================================================
// Fixture Helpers
// ============================================================================

function workflowRunPayload(overrides: Record<string, unknown> = {}) {
  return {
    workflow_run: {
      id: 12345,
      name: 'CI',
      run_number: 42,
      conclusion: 'failure',
      head_branch: 'main',
      head_sha: 'abc123',
      html_url: 'https://github.com/venturecrane/crane-console/actions/runs/12345',
      actor: { login: 'github-actions[bot]' },
      event: 'push',
      ...overrides,
    },
    repository: { full_name: 'venturecrane/crane-console' },
  }
}

function checkSuitePayload(overrides: Record<string, unknown> = {}) {
  return {
    check_suite: {
      id: 67890,
      conclusion: 'failure',
      head_branch: 'main',
      head_sha: 'def456',
      app: { name: 'GitHub Actions' },
      latest_check_runs_count: 5,
      ...overrides,
    },
    repository: { full_name: 'venturecrane/crane-console' },
  }
}

function checkRunPayload(overrides: Record<string, unknown> = {}) {
  return {
    check_run: {
      id: 11111,
      name: 'build',
      status: 'completed',
      conclusion: 'failure',
      head_sha: 'ghi789',
      html_url: 'https://github.com/venturecrane/crane-console/runs/11111',
      app: { name: 'GitHub Actions' },
      check_suite: { head_branch: 'main' },
      ...overrides,
    },
    repository: { full_name: 'venturecrane/crane-console' },
  }
}

// ============================================================================
// Workflow Run Tests
// ============================================================================

describe('normalizeWorkflowRun', () => {
  it('returns critical for failure on main', () => {
    const result = normalizeWorkflowRun(workflowRunPayload())
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
    expect(result!.event_type).toBe('workflow_run.failure')
    expect(result!.summary).toContain('CI #42')
    expect(result!.summary).toContain('failure')
    expect(result!.repo).toBe('venturecrane/crane-console')
    expect(result!.branch).toBe('main')
    expect(result!.venture).toBe('vc')
  })

  it('returns info for failure on feature branch', () => {
    const result = normalizeWorkflowRun(
      workflowRunPayload({ conclusion: 'failure', head_branch: 'feat/notifications' })
    )
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('info')
  })

  it('returns warning for timed_out', () => {
    const result = normalizeWorkflowRun(workflowRunPayload({ conclusion: 'timed_out' }))
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('warning')
    expect(result!.event_type).toBe('workflow_run.timed_out')
  })

  it('returns info for cancelled', () => {
    const result = normalizeWorkflowRun(workflowRunPayload({ conclusion: 'cancelled' }))
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('info')
  })

  it('returns null for success', () => {
    const result = normalizeWorkflowRun(workflowRunPayload({ conclusion: 'success' }))
    expect(result).toBeNull()
  })

  it('returns null for neutral', () => {
    const result = normalizeWorkflowRun(workflowRunPayload({ conclusion: 'neutral' }))
    expect(result).toBeNull()
  })

  it('returns null for skipped', () => {
    const result = normalizeWorkflowRun(workflowRunPayload({ conclusion: 'skipped' }))
    expect(result).toBeNull()
  })

  it('returns critical for failure on master', () => {
    const result = normalizeWorkflowRun(workflowRunPayload({ head_branch: 'master' }))
    expect(result!.severity).toBe('critical')
  })

  it('returns critical for failure on production', () => {
    const result = normalizeWorkflowRun(workflowRunPayload({ head_branch: 'production' }))
    expect(result!.severity).toBe('critical')
  })

  it('returns null when workflow_run is missing', () => {
    const result = normalizeWorkflowRun({})
    expect(result).toBeNull()
  })

  it('includes content_key for deduplication', () => {
    const result = normalizeWorkflowRun(workflowRunPayload())
    expect(result!.content_key).toBe('workflow_run:12345:failure')
  })
})

// ============================================================================
// Check Suite Tests
// ============================================================================

describe('normalizeCheckSuite', () => {
  it('returns critical for failure on main', () => {
    const result = normalizeCheckSuite(checkSuitePayload())
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
    expect(result!.event_type).toBe('check_suite.failure')
    expect(result!.summary).toContain('GitHub Actions')
  })

  it('returns null for success', () => {
    const result = normalizeCheckSuite(checkSuitePayload({ conclusion: 'success' }))
    expect(result).toBeNull()
  })

  it('returns null when check_suite is missing', () => {
    const result = normalizeCheckSuite({})
    expect(result).toBeNull()
  })
})

// ============================================================================
// Check Run Tests
// ============================================================================

describe('normalizeCheckRun', () => {
  it('returns critical for failure on main', () => {
    const result = normalizeCheckRun(checkRunPayload())
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
    expect(result!.event_type).toBe('check_run.failure')
    expect(result!.summary).toContain('build')
  })

  it('returns null for success', () => {
    const result = normalizeCheckRun(checkRunPayload({ conclusion: 'success' }))
    expect(result).toBeNull()
  })

  it('returns null for in-progress check runs', () => {
    const result = normalizeCheckRun(checkRunPayload({ status: 'in_progress', conclusion: null }))
    expect(result).toBeNull()
  })

  it('returns null when check_run is missing', () => {
    const result = normalizeCheckRun({})
    expect(result).toBeNull()
  })
})

// ============================================================================
// Router Tests
// ============================================================================

describe('normalizeGitHubEvent', () => {
  it('routes workflow_run events', () => {
    const result = normalizeGitHubEvent('workflow_run', workflowRunPayload())
    expect(result).not.toBeNull()
    expect(result!.event_type).toBe('workflow_run.failure')
  })

  it('routes check_suite events', () => {
    const result = normalizeGitHubEvent('check_suite', checkSuitePayload())
    expect(result).not.toBeNull()
  })

  it('routes check_run events', () => {
    const result = normalizeGitHubEvent('check_run', checkRunPayload())
    expect(result).not.toBeNull()
  })

  it('returns null for unknown event types', () => {
    const result = normalizeGitHubEvent('push', {})
    expect(result).toBeNull()
  })

  it('returns null for issues events', () => {
    const result = normalizeGitHubEvent('issues', { issue: { number: 1 } })
    expect(result).toBeNull()
  })
})
