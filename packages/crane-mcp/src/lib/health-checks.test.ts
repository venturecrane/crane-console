/**
 * Unit tests for the System Health framework (Plan §B.7).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  type HealthCheck,
  type HealthCheckContext,
  type HealthCheckResult,
  notificationsTruthWindowCheck,
  notificationRetentionWindowCheck,
  deployPipelineHeartbeatCheck,
  STANDARD_CHECKS,
  runHealthChecks,
  formatHealthCheckSection,
} from './health-checks'
import type { CraneApi, NotificationCountsResponse } from './crane-api'

// ============================================================================
// Test fixtures
// ============================================================================

function makeCountsResponse(
  overrides: Partial<NotificationCountsResponse> = {}
): NotificationCountsResponse {
  return {
    total: 0,
    by_severity: { critical: 0, warning: 0, info: 0 },
    by_status: { new: 0, acked: 0, resolved: 0 },
    window: { retention_days: 30, filters: {} },
    ...overrides,
  }
}

function makeContext(
  overrides: { ciCountsTotal?: number; counts?: NotificationCountsResponse } = {}
): HealthCheckContext {
  const counts = overrides.counts ?? makeCountsResponse()
  const api = {
    getNotificationCounts: vi.fn().mockResolvedValue(counts),
  } as unknown as CraneApi
  return {
    api,
    venture: 'vc',
    ciCountsTotal: overrides.ciCountsTotal,
  }
}

// ============================================================================
// notifications-truth-window
// ============================================================================

describe('notifications-truth-window check', () => {
  it('passes when displayed count matches server', async () => {
    const ctx = makeContext({
      ciCountsTotal: 42,
      counts: makeCountsResponse({ total: 42 }),
    })
    const result = await notificationsTruthWindowCheck.run(ctx)
    expect(result.status).toBe('pass')
    expect(result.message).toContain('42')
  })

  it('fails P0 when server reports a higher count than displayed (the loud bug)', async () => {
    const ctx = makeContext({
      ciCountsTotal: 10,
      counts: makeCountsResponse({ total: 270 }),
    })
    const result = await notificationsTruthWindowCheck.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('10')
    expect(result.message).toContain('270')
    expect(result.diagnostic).toEqual({
      displayed: 10,
      server: 270,
      delta: 260,
    })
  })

  it('skips when no displayed count was passed (no false positives)', async () => {
    const ctx = makeContext({}) // no ciCountsTotal
    const result = await notificationsTruthWindowCheck.run(ctx)
    expect(result.status).toBe('skipped')
  })

  it('has zero failure budget (any divergence escalates)', () => {
    expect(notificationsTruthWindowCheck.failureBudgetPerWeek).toBe(0)
  })
})

// ============================================================================
// notification-retention-window
// ============================================================================

describe('notification-retention-window check', () => {
  it('passes with empty open queue', async () => {
    const ctx = makeContext({
      counts: makeCountsResponse({ total: 0, window: { retention_days: 30, filters: {} } }),
    })
    const result = await notificationRetentionWindowCheck.run(ctx)
    expect(result.status).toBe('pass')
    expect(result.message).toContain('30')
  })

  it('passes when notifications exist within retention window', async () => {
    const ctx = makeContext({
      counts: makeCountsResponse({ total: 5, window: { retention_days: 30, filters: {} } }),
    })
    const result = await notificationRetentionWindowCheck.run(ctx)
    expect(result.status).toBe('pass')
    expect(result.diagnostic).toEqual({
      total_open: 5,
      retention_days: 30,
    })
  })
})

// ============================================================================
// deploy-pipeline-heartbeat
// ============================================================================

describe('deploy-pipeline-heartbeat check', () => {
  function makeHeartbeatCtx(
    overrides: { cold?: unknown[]; stale?: unknown[]; tracked?: number; throws?: boolean } = {}
  ): HealthCheckContext {
    const tracked = overrides.tracked ?? 5
    const heartbeats = Array.from({ length: tracked }, (_, i) => ({
      venture: 'vc',
      repo_full_name: `venturecrane/repo-${i}`,
      workflow_id: i,
      branch: 'main',
      last_main_commit_at: '2026-04-08T10:00:00Z',
      last_main_commit_sha: 'sha',
      last_success_at: '2026-04-08T10:30:00Z',
      last_success_sha: 'sha',
      last_success_run_id: 100,
      last_run_at: '2026-04-08T10:30:00Z',
      last_run_id: 100,
      last_run_conclusion: 'success',
      consecutive_failures: 0,
      suppressed: 0,
      suppress_reason: null,
      suppress_until: null,
      cold_threshold_days: 3,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-08T10:30:00Z',
    }))
    const api = {
      getDeployHeartbeats: vi.fn(async () => {
        if (overrides.throws) throw new Error('endpoint not deployed')
        return {
          venture: 'vc',
          heartbeats,
          cold: overrides.cold ?? [],
          stale_webhooks: overrides.stale ?? [],
          suppressed: [],
          window: { stale_webhook_hours: 12 },
        }
      }),
    } as unknown as CraneApi
    return { api, venture: 'vc' }
  }

  it('passes when no cold or stale-webhook pipelines', async () => {
    const ctx = makeHeartbeatCtx({ tracked: 5 })
    const result = await deployPipelineHeartbeatCheck.run(ctx)
    expect(result.status).toBe('pass')
    expect(result.message).toContain('5 pipeline')
    expect(result.message).toContain('0 cold')
  })

  it('fails P0 when one or more pipelines are cold (smd-web case)', async () => {
    const ctx = makeHeartbeatCtx({
      cold: [
        {
          repo_full_name: 'smdservices/smd-web',
          workflow_id: 1,
          age_ms: 49 * 86_400_000,
          cold_threshold_days: 2,
        },
      ],
    })
    const result = await deployPipelineHeartbeatCheck.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('smd-web')
    expect(result.diagnostic).toMatchObject({
      cold_count: 1,
      stale_webhook_count: 0,
    })
  })

  it('fails when only stale webhooks, no cold pipelines', async () => {
    const ctx = makeHeartbeatCtx({
      stale: [{ repo_full_name: 'venturecrane/foo', workflow_id: 1 }],
    })
    const result = await deployPipelineHeartbeatCheck.run(ctx)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('stale-webhook')
  })

  it('skips (not fails) when the deploy-heartbeats endpoint is unreachable', async () => {
    const ctx = makeHeartbeatCtx({ throws: true })
    const result = await deployPipelineHeartbeatCheck.run(ctx)
    expect(result.status).toBe('skipped')
    expect(result.message).toContain('Endpoint unreachable')
  })
})

// ============================================================================
// Standard checks list
// ============================================================================

describe('STANDARD_CHECKS', () => {
  it('contains exactly the 3 v1 checks', () => {
    expect(STANDARD_CHECKS).toHaveLength(3)
    expect(STANDARD_CHECKS.map((c) => c.name)).toEqual([
      'notifications-truth-window',
      'notification-retention-window',
      'deploy-pipeline-heartbeat',
    ])
  })
})

// ============================================================================
// runHealthChecks
// ============================================================================

describe('runHealthChecks', () => {
  function makeCheck(
    name: string,
    overrides: Partial<HealthCheck> & { runFn?: HealthCheck['run'] } = {}
  ): HealthCheck {
    return {
      name,
      description: 'test',
      severity: 'P1',
      failureBudgetPerWeek: 3,
      run: overrides.runFn ?? (async () => ({ status: 'pass' as const, message: 'ok' })),
      ...overrides,
    } as HealthCheck
  }

  it('runs all checks in parallel and returns results in order', async () => {
    const ctx = makeContext({})
    const results = await runHealthChecks([makeCheck('a'), makeCheck('b'), makeCheck('c')], ctx)
    expect(results.map((r) => r.name)).toEqual(['a', 'b', 'c'])
    expect(results.every((r) => r.status === 'pass')).toBe(true)
  })

  it('captures errors per-check and reports as P1 (never silently swallowed)', async () => {
    const ctx = makeContext({})
    const results = await runHealthChecks(
      [
        makeCheck('boom', {
          runFn: async () => {
            throw new Error('database down')
          },
        }),
      ],
      ctx
    )
    expect(results[0].status).toBe('error')
    expect(results[0].severity).toBe('P1')
    expect(results[0].message).toContain('database down')
  })

  it('times out individual checks at the configured threshold', async () => {
    const ctx = makeContext({})
    const slowCheck = makeCheck('slow', {
      runFn: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: 'pass', message: 'ok' }), 200)
        }),
    })
    const results = await runHealthChecks([slowCheck], ctx, { timeoutMs: 50 })
    expect(results[0].status).toBe('timeout')
    expect(results[0].message).toContain('50ms')
    // CI hardware jitter: Promise.race + setTimeout resolves a few ms
    // early on busy runners (observed 49ms on GitHub Actions). Tolerance
    // of 45ms gives us headroom without losing the "it actually timed
    // out and not passed instantly" signal.
    expect(results[0].duration_ms).toBeGreaterThanOrEqual(45)
  })

  it('records duration_ms for every result', async () => {
    const ctx = makeContext({})
    const results = await runHealthChecks([makeCheck('a')], ctx)
    expect(typeof results[0].duration_ms).toBe('number')
    expect(results[0].duration_ms).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================================
// formatHealthCheckSection
// ============================================================================

describe('formatHealthCheckSection', () => {
  function makeResult(overrides: Partial<HealthCheckResult>): HealthCheckResult {
    return {
      name: 'test-check',
      severity: 'P1',
      status: 'pass',
      message: 'ok',
      duration_ms: 0,
      ...overrides,
    }
  }

  it('renders a one-liner when all checks pass', () => {
    const section = formatHealthCheckSection([
      makeResult({ name: 'a' }),
      makeResult({ name: 'b' }),
      makeResult({ name: 'c' }),
    ])
    expect(section).toContain('## System Health')
    expect(section).toContain('All clear (3/3 checks passed')
  })

  it('lists failed checks with severity and message (never hides)', () => {
    const section = formatHealthCheckSection([
      makeResult({ name: 'a', status: 'pass' }),
      makeResult({
        name: 'truth-window',
        status: 'fail',
        severity: 'P0',
        message: 'Displayed 10 vs server 270 (delta: 260)',
      }),
    ])
    expect(section).toContain('[P0] truth-window')
    expect(section).toContain('Displayed 10 vs server 270')
    expect(section).toContain('1 of 2 checks passing')
  })

  it('renders errored and timed-out checks distinctly', () => {
    const section = formatHealthCheckSection([
      makeResult({ name: 'broken', status: 'error', message: 'database down' }),
      makeResult({ name: 'slow', status: 'timeout', message: 'Check timed out after 3000ms' }),
    ])
    expect(section).toContain('error: database down')
    expect(section).toContain('timeout:')
    expect(section).toContain('3000ms')
  })

  it('renders an "all skipped" message when every check skips', () => {
    const section = formatHealthCheckSection([
      makeResult({ name: 'a', status: 'skipped' }),
      makeResult({ name: 'b', status: 'skipped' }),
    ])
    expect(section).toContain('All 2 checks skipped')
  })
})
