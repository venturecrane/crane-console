/**
 * Unit Tests: Green Event Classifier
 *
 * Tests classifyGreenEvent + each per-event-type classifier. Verifies:
 *   1. Green conclusions (success, neutral) are classified
 *   2. Skipped/in_progress/missing payloads return null
 *   3. Match keys use full owner/repo (cross-org collision safety)
 *   4. Schedule-like events are flagged for same-SHA matching
 *   5. Workflow file rename is handled via workflow_id (stable across renames)
 */

import { describe, it, expect } from 'vitest'
import {
  classifyGreenEvent,
  classifyGreenWorkflowRun,
  classifyGreenCheckSuite,
  classifyGreenCheckRun,
  classifyGreenDeployment,
} from '../src/notifications-green'

// ============================================================================
// Fixture helpers
// ============================================================================

function workflowRunSuccessPayload(overrides: Record<string, unknown> = {}) {
  return {
    workflow_run: {
      id: 99001,
      workflow_id: 88001,
      name: 'CI',
      run_number: 42,
      conclusion: 'success',
      head_branch: 'main',
      head_sha: 'abc123def456',
      run_started_at: '2026-04-08T01:00:00Z',
      created_at: '2026-04-08T01:00:00Z',
      html_url: 'https://github.com/venturecrane/crane-console/actions/runs/99001',
      actor: { login: 'github-actions[bot]' },
      event: 'push',
      ...overrides,
    },
    repository: { full_name: 'venturecrane/crane-console' },
  }
}

function checkSuiteSuccessPayload(overrides: Record<string, unknown> = {}) {
  return {
    check_suite: {
      id: 67890,
      conclusion: 'success',
      head_branch: 'main',
      head_sha: 'def456abc123',
      created_at: '2026-04-08T01:05:00Z',
      app: { id: 15368, name: 'GitHub Actions' },
      latest_check_runs_count: 5,
      ...overrides,
    },
    repository: { full_name: 'venturecrane/crane-console' },
  }
}

function checkRunSuccessPayload(overrides: Record<string, unknown> = {}) {
  return {
    check_run: {
      id: 11111,
      name: 'build',
      status: 'completed',
      conclusion: 'success',
      head_sha: 'ghi789',
      html_url: 'https://github.com/venturecrane/crane-console/runs/11111',
      app: { id: 15368, name: 'GitHub Actions' },
      check_suite: { head_branch: 'main' },
      started_at: '2026-04-08T01:10:00Z',
      completed_at: '2026-04-08T01:11:00Z',
      ...overrides,
    },
    repository: { full_name: 'venturecrane/crane-console' },
  }
}

function vercelDeploymentReadyPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dpl_abc123',
    name: 'vc-web',
    target: 'production',
    url: 'vc-web-abc.vercel.app',
    createdAt: '2026-04-08T01:15:00Z',
    meta: {
      githubOrg: 'venturecrane',
      githubRepo: 'vc-web',
      githubCommitRef: 'main',
      githubCommitSha: 'jkl012',
    },
    ...overrides,
  }
}

// ============================================================================
// classifyGreenWorkflowRun
// ============================================================================

describe('classifyGreenWorkflowRun', () => {
  it('classifies workflow_run.success on main', () => {
    const result = classifyGreenWorkflowRun(workflowRunSuccessPayload())
    expect(result).not.toBeNull()
    expect(result!.event_type).toBe('workflow_run.success')
    expect(result!.match_key).toBe('gh:wf:venturecrane/crane-console:main:88001')
    expect(result!.match_key_version).toBe('v2_id')
    expect(result!.workflow_id).toBe(88001)
    expect(result!.run_id).toBe(99001)
    expect(result!.head_sha).toBe('abc123def456')
    expect(result!.is_schedule_like).toBe(false)
    expect(result!.auto_resolve_reason).toBe('green_workflow_run')
    expect(result!.venture).toBe('vc')
  })

  it('classifies workflow_run.neutral as green', () => {
    const result = classifyGreenWorkflowRun(workflowRunSuccessPayload({ conclusion: 'neutral' }))
    expect(result).not.toBeNull()
    expect(result!.event_type).toBe('workflow_run.neutral')
  })

  it('returns null for skipped (skipped does not prove a fix)', () => {
    const result = classifyGreenWorkflowRun(workflowRunSuccessPayload({ conclusion: 'skipped' }))
    expect(result).toBeNull()
  })

  it('returns null for failure', () => {
    const result = classifyGreenWorkflowRun(workflowRunSuccessPayload({ conclusion: 'failure' }))
    expect(result).toBeNull()
  })

  it('returns null for missing workflow_run', () => {
    const result = classifyGreenWorkflowRun({})
    expect(result).toBeNull()
  })

  it('returns null when workflow_id is missing (cannot build v2_id match key)', () => {
    const result = classifyGreenWorkflowRun(workflowRunSuccessPayload({ workflow_id: undefined }))
    expect(result).toBeNull()
  })

  it('returns null when branch is missing', () => {
    const result = classifyGreenWorkflowRun(
      workflowRunSuccessPayload({ head_branch: undefined as unknown as string })
    )
    expect(result).toBeNull()
  })

  it('flags schedule-like event for same-SHA matching', () => {
    const result = classifyGreenWorkflowRun(workflowRunSuccessPayload({ event: 'schedule' }))
    expect(result).not.toBeNull()
    expect(result!.is_schedule_like).toBe(true)
  })

  it('flags repository_dispatch as schedule-like', () => {
    const result = classifyGreenWorkflowRun(
      workflowRunSuccessPayload({ event: 'repository_dispatch' })
    )
    expect(result).not.toBeNull()
    expect(result!.is_schedule_like).toBe(true)
  })

  it('match_key uses workflow_id (stable across file renames)', () => {
    // Workflow files can be renamed; workflow_id is permanent. Two payloads
    // with the same workflow_id but different names produce the same key.
    const a = classifyGreenWorkflowRun(workflowRunSuccessPayload({ name: 'old-ci.yml' }))
    const b = classifyGreenWorkflowRun(workflowRunSuccessPayload({ name: 'new-ci.yml' }))
    expect(a!.match_key).toBe(b!.match_key)
  })
})

// ============================================================================
// CRITICAL: cross-org collision safety
// ============================================================================

describe('classifyGreenWorkflowRun — cross-org collision safety', () => {
  it('match_key includes owner/repo, NOT bare repo name', () => {
    // Two repos in different orgs with the same name, same workflow_id,
    // same branch must produce DIFFERENT match keys. Otherwise a green
    // in one org would silently auto-resolve a red in another org —
    // exactly the silent data corruption the auto-resolver exists to prevent.
    const a = classifyGreenWorkflowRun({
      workflow_run: {
        id: 1,
        workflow_id: 100,
        name: 'CI',
        conclusion: 'success',
        head_branch: 'main',
        head_sha: 'sha-a',
        run_started_at: '2026-04-08T00:00:00Z',
        event: 'push',
      },
      repository: { full_name: 'venturecrane/console' },
    })
    const b = classifyGreenWorkflowRun({
      workflow_run: {
        id: 1,
        workflow_id: 100,
        name: 'CI',
        conclusion: 'success',
        head_branch: 'main',
        head_sha: 'sha-b',
        run_started_at: '2026-04-08T00:00:00Z',
        event: 'push',
      },
      repository: { full_name: 'siliconcrane/console' },
    })
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.match_key).toBe('gh:wf:venturecrane/console:main:100')
    expect(b!.match_key).toBe('gh:wf:siliconcrane/console:main:100')
    expect(a!.match_key).not.toBe(b!.match_key)
  })
})

// ============================================================================
// classifyGreenCheckSuite
// ============================================================================

describe('classifyGreenCheckSuite', () => {
  it('classifies check_suite.success on main', () => {
    const result = classifyGreenCheckSuite(checkSuiteSuccessPayload())
    expect(result).not.toBeNull()
    expect(result!.event_type).toBe('check_suite.success')
    expect(result!.match_key).toBe('gh:cs:venturecrane/crane-console:main:15368')
    expect(result!.check_suite_id).toBe(67890)
    expect(result!.app_id).toBe(15368)
    expect(result!.auto_resolve_reason).toBe('green_check_suite')
  })

  it('returns null for failure conclusion', () => {
    const result = classifyGreenCheckSuite(checkSuiteSuccessPayload({ conclusion: 'failure' }))
    expect(result).toBeNull()
  })

  it('returns null when app_id is missing', () => {
    const result = classifyGreenCheckSuite(
      checkSuiteSuccessPayload({ app: { name: 'GitHub Actions' } })
    )
    expect(result).toBeNull()
  })
})

// ============================================================================
// classifyGreenCheckRun
// ============================================================================

describe('classifyGreenCheckRun', () => {
  it('classifies check_run.success on completed check', () => {
    const result = classifyGreenCheckRun(checkRunSuccessPayload())
    expect(result).not.toBeNull()
    expect(result!.event_type).toBe('check_run.success')
    expect(result!.match_key).toBe('gh:cr:venturecrane/crane-console:main:15368:build')
    expect(result!.check_run_id).toBe(11111)
    expect(result!.app_id).toBe(15368)
    expect(result!.auto_resolve_reason).toBe('green_check_run')
  })

  it('returns null for in_progress check_run', () => {
    const result = classifyGreenCheckRun(
      checkRunSuccessPayload({ status: 'in_progress', conclusion: null })
    )
    expect(result).toBeNull()
  })

  it('returns null for failure check_run', () => {
    const result = classifyGreenCheckRun(checkRunSuccessPayload({ conclusion: 'failure' }))
    expect(result).toBeNull()
  })

  it('match_key includes check name (matrix legs do not collide)', () => {
    const node18 = classifyGreenCheckRun(checkRunSuccessPayload({ name: 'build (node-18)' }))
    const node20 = classifyGreenCheckRun(checkRunSuccessPayload({ name: 'build (node-20)' }))
    expect(node18!.match_key).not.toBe(node20!.match_key)
  })
})

// ============================================================================
// classifyGreenDeployment (Vercel)
// ============================================================================

describe('classifyGreenDeployment', () => {
  it('classifies deployment.ready on production', () => {
    const result = classifyGreenDeployment('deployment.ready', vercelDeploymentReadyPayload())
    expect(result).not.toBeNull()
    expect(result!.event_type).toBe('deployment.ready')
    expect(result!.match_key).toBe('vc:dpl:venturecrane/vc-web:main:vc-web:production')
    expect(result!.deployment_id).toBe('dpl_abc123')
    expect(result!.target).toBe('production')
    expect(result!.auto_resolve_reason).toBe('green_deployment')
    expect(result!.venture).toBe('vc')
  })

  it('classifies deployment.succeeded as green', () => {
    const result = classifyGreenDeployment('deployment.succeeded', vercelDeploymentReadyPayload())
    expect(result).not.toBeNull()
  })

  it('returns null for deployment.error (failure path handles that)', () => {
    const result = classifyGreenDeployment('deployment.error', vercelDeploymentReadyPayload())
    expect(result).toBeNull()
  })

  it('preview target produces different match_key from production', () => {
    const prod = classifyGreenDeployment('deployment.ready', vercelDeploymentReadyPayload())
    const preview = classifyGreenDeployment(
      'deployment.ready',
      vercelDeploymentReadyPayload({ target: 'preview' })
    )
    expect(prod!.match_key).not.toBe(preview!.match_key)
  })
})

// ============================================================================
// Top-level classifyGreenEvent dispatcher
// ============================================================================

describe('classifyGreenEvent', () => {
  it('routes github workflow_run', () => {
    const result = classifyGreenEvent('github', 'workflow_run', workflowRunSuccessPayload())
    expect(result).not.toBeNull()
    expect(result!.source_event).toBe('workflow_run')
  })

  it('routes github check_suite', () => {
    const result = classifyGreenEvent('github', 'check_suite', checkSuiteSuccessPayload())
    expect(result).not.toBeNull()
    expect(result!.source_event).toBe('check_suite')
  })

  it('routes github check_run', () => {
    const result = classifyGreenEvent('github', 'check_run', checkRunSuccessPayload())
    expect(result).not.toBeNull()
    expect(result!.source_event).toBe('check_run')
  })

  it('routes vercel deployment.ready', () => {
    const result = classifyGreenEvent('vercel', 'deployment.ready', vercelDeploymentReadyPayload())
    expect(result).not.toBeNull()
    expect(result!.source_event).toBe('deployment')
  })

  it('returns null for unknown github event type', () => {
    const result = classifyGreenEvent('github', 'unknown_event', {})
    expect(result).toBeNull()
  })
})
