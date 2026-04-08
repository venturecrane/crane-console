/**
 * Integration Test: notifications/ingest endpoint
 *
 * Plan §A.7 contract: 10 scenarios exercising the HTTP /notifications/ingest
 * dispatch path end-to-end. The unit tests for processGreenEvent and
 * classifyGreenEvent cover the underlying logic at a finer grain; THIS test
 * validates the wiring at the endpoint layer:
 *
 *   1. handleIngestNotification correctly routes failures to the failure
 *      path and greens to the green path
 *   2. The feature flag NOTIFICATIONS_AUTO_RESOLVE_ENABLED gates the green
 *      path correctly (off → ignored, on → processGreenEvent)
 *   3. The dispatch logic for github vs vercel is correct
 *   4. The response shape includes the right fields for each path
 *
 * The test calls handleIngestNotification(request, env) directly with a
 * constructed Request and Env (using the test harness D1). This exercises
 * the SAME code path as a real HTTP request without requiring a running
 * worker process.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
  installWorkerdPolyfills,
} from '@venturecrane/crane-test-harness'
import { handleIngestNotification } from '../../src/endpoints/notifications'
import type { Env } from '../../src/types'

beforeAll(() => {
  installWorkerdPolyfills()
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'migrations')

const TEST_RELAY_KEY = 'test-integration-relay-key'

async function setupEnv(autoResolveEnabled: boolean): Promise<Env> {
  const db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
  return {
    DB: db as unknown as D1Database,
    CONTEXT_SESSION_STALE_MINUTES: '45',
    IDEMPOTENCY_TTL_SECONDS: '3600',
    HEARTBEAT_INTERVAL_SECONDS: '600',
    HEARTBEAT_JITTER_SECONDS: '120',
    CONTEXT_RELAY_KEY: TEST_RELAY_KEY,
    CONTEXT_ADMIN_KEY: 'test-admin-key',
    NOTIFICATIONS_AUTO_RESOLVE_ENABLED: autoResolveEnabled ? 'true' : 'false',
  }
}

function buildRequest(body: unknown): Request {
  return new Request('https://test.local/notifications/ingest', {
    method: 'POST',
    headers: {
      'X-Relay-Key': TEST_RELAY_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function workflowRunPayload(opts: {
  conclusion: 'failure' | 'success'
  workflowId?: number
  runId?: number
  branch?: string
  headSha?: string
  runStartedAt?: string
  event?: string
  repo?: string
}) {
  return {
    workflow_run: {
      id: opts.runId ?? Math.floor(Math.random() * 1000000),
      workflow_id: opts.workflowId ?? 100,
      name: 'CI',
      run_number: 42,
      conclusion: opts.conclusion,
      head_branch: opts.branch ?? 'main',
      head_sha: opts.headSha ?? 'sha-test',
      run_started_at: opts.runStartedAt ?? '2026-04-08T01:00:00Z',
      created_at: opts.runStartedAt ?? '2026-04-08T01:00:00Z',
      html_url: 'https://github.com/x/y/actions/runs/1',
      actor: { login: 'test' },
      event: opts.event ?? 'push',
    },
    repository: { full_name: opts.repo ?? 'venturecrane/crane-console' },
  }
}

function vercelDeploymentPayload(opts: {
  type: 'error' | 'ready'
  projectName?: string
  target?: string
  branch?: string
  deploymentId?: string
  teamId?: string
  org?: string
  repo?: string
  commitSha?: string
}) {
  return {
    id: opts.deploymentId ?? `dpl_${Math.random().toString(36).slice(2)}`,
    name: opts.projectName ?? 'vc-web',
    target: opts.target ?? 'production',
    url: 'vc-web.vercel.app',
    createdAt: '2026-04-08T01:00:00Z',
    teamId: opts.teamId,
    errorMessage: opts.type === 'error' ? 'build failed' : null,
    meta: {
      githubOrg: opts.org ?? 'venturecrane',
      githubRepo: opts.repo ?? 'vc-web',
      githubCommitRef: opts.branch ?? 'main',
      githubCommitSha: opts.commitSha ?? 'sha-vercel',
    },
  }
}

async function ingest(env: Env, body: unknown): Promise<{ status: number; json: any }> {
  const res = await handleIngestNotification(buildRequest(body), env)
  const json = await res.json()
  return { status: res.status, json }
}

// ============================================================================
// Scenarios
// ============================================================================

describe('integration: /notifications/ingest', () => {
  // ----------------------------------------------------------------------
  // Scenario 1: red→green auto-resolve
  // ----------------------------------------------------------------------
  it('Scenario 1 — failure then success on same workflow auto-resolves', async () => {
    const env = await setupEnv(true)

    // Failure first
    const failRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 1,
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })
    expect(failRes.status).toBe(201)
    expect(failRes.json.notification.status).toBe('new')
    const failureId = failRes.json.notification.id

    // Green for the same workflow
    const greenRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'success',
        workflowId: 100,
        runId: 2,
        runStartedAt: '2026-04-08T02:00:00Z',
      }),
    })
    expect(greenRes.status).toBe(200)
    expect(greenRes.json.green_event).toBe(true)
    expect(greenRes.json.resolved_count).toBe(1)
    expect(greenRes.json.matched_ids).toContain(failureId)
  })

  // ----------------------------------------------------------------------
  // Scenario 2: out-of-order delivery
  // ----------------------------------------------------------------------
  it('Scenario 2 — green arriving before failure does NOT retroactively resolve', async () => {
    const env = await setupEnv(true)

    // Green first (run_started_at = T)
    const greenRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'success',
        workflowId: 100,
        runId: 1,
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })
    expect(greenRes.json.resolved_count).toBe(0)

    // Failure after (run_started_at = T+5min)
    const failRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 2,
        runStartedAt: '2026-04-08T01:05:00Z',
      }),
    })
    expect(failRes.status).toBe(201)
    expect(failRes.json.notification.status).toBe('new')
  })

  // ----------------------------------------------------------------------
  // Scenario 3: cron same-SHA-only matching
  // ----------------------------------------------------------------------
  it('Scenario 3 — schedule event with different SHA does NOT resolve', async () => {
    const env = await setupEnv(true)

    await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 1,
        runStartedAt: '2026-04-08T01:00:00Z',
        headSha: 'sha-aaa',
        event: 'schedule',
      }),
    })

    // Green cron with DIFFERENT sha
    const greenRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'success',
        workflowId: 100,
        runId: 2,
        runStartedAt: '2026-04-08T02:00:00Z',
        headSha: 'sha-bbb',
        event: 'schedule',
      }),
    })
    expect(greenRes.json.resolved_count).toBe(0)

    // Green cron with SAME sha
    const greenRes2 = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'success',
        workflowId: 100,
        runId: 3,
        runStartedAt: '2026-04-08T03:00:00Z',
        headSha: 'sha-aaa',
        event: 'schedule',
      }),
    })
    expect(greenRes2.json.resolved_count).toBe(1)
  })

  // ----------------------------------------------------------------------
  // Scenario 4: workflow file rename (matched by workflow_id)
  // ----------------------------------------------------------------------
  it('Scenario 4 — workflow file rename via workflow_id still matches', async () => {
    const env = await setupEnv(true)

    // Failure with one workflow_name
    await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: {
        ...workflowRunPayload({
          conclusion: 'failure',
          workflowId: 100,
          runId: 1,
          runStartedAt: '2026-04-08T01:00:00Z',
        }),
        workflow_run: {
          ...workflowRunPayload({
            conclusion: 'failure',
            workflowId: 100,
            runId: 1,
            runStartedAt: '2026-04-08T01:00:00Z',
          }).workflow_run,
          name: 'old-ci.yml',
        },
      },
    })

    // Green with renamed workflow_name but same workflow_id
    const greenRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: {
        ...workflowRunPayload({
          conclusion: 'success',
          workflowId: 100,
          runId: 2,
          runStartedAt: '2026-04-08T02:00:00Z',
        }),
        workflow_run: {
          ...workflowRunPayload({
            conclusion: 'success',
            workflowId: 100,
            runId: 2,
            runStartedAt: '2026-04-08T02:00:00Z',
          }).workflow_run,
          name: 'new-ci.yml',
        },
      },
    })
    expect(greenRes.json.resolved_count).toBe(1)
  })

  // ----------------------------------------------------------------------
  // Scenario 5: branch isolation
  // ----------------------------------------------------------------------
  it('Scenario 5 — green on main does NOT resolve a failure on a feature branch', async () => {
    const env = await setupEnv(true)

    const failRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 1,
        branch: 'feat/foo',
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })
    const featureFailureId = failRes.json.notification.id

    const greenRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'success',
        workflowId: 100,
        runId: 2,
        branch: 'main',
        runStartedAt: '2026-04-08T02:00:00Z',
      }),
    })
    expect(greenRes.json.resolved_count).toBe(0)
    expect(greenRes.json.matched_ids ?? []).not.toContain(featureFailureId)
  })

  // ----------------------------------------------------------------------
  // Scenario 6: cross-org isolation
  // ----------------------------------------------------------------------
  it('Scenario 6 — green from venturecrane/console does NOT resolve a red from siliconcrane/console', async () => {
    const env = await setupEnv(true)

    // Failure in venturecrane/console
    const ventureFail = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 1,
        repo: 'venturecrane/console',
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })

    // Failure in siliconcrane/console (note: not in venture map, so venture=null)
    const siliconFail = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 2,
        repo: 'siliconcrane/console',
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })

    // Green for venturecrane/console
    const greenRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'success',
        workflowId: 100,
        runId: 3,
        repo: 'venturecrane/console',
        runStartedAt: '2026-04-08T02:00:00Z',
      }),
    })

    expect(greenRes.json.resolved_count).toBe(1)
    expect(greenRes.json.matched_ids).toContain(ventureFail.json.notification.id)
    expect(greenRes.json.matched_ids).not.toContain(siliconFail.json.notification.id)
  })

  // ----------------------------------------------------------------------
  // Scenario 7: Vercel red → green
  // ----------------------------------------------------------------------
  it('Scenario 7 — Vercel deployment.error then deployment.ready auto-resolves', async () => {
    const env = await setupEnv(true)

    // Failure
    const failRes = await ingest(env, {
      source: 'vercel',
      event_type: 'deployment.error',
      payload: vercelDeploymentPayload({
        type: 'error',
        projectName: 'vc-web',
        teamId: 'team_alpha',
      }),
    })
    expect(failRes.status).toBe(201)

    // Green
    const greenRes = await ingest(env, {
      source: 'vercel',
      event_type: 'deployment.ready',
      payload: vercelDeploymentPayload({
        type: 'ready',
        projectName: 'vc-web',
        teamId: 'team_alpha',
      }),
    })
    expect(greenRes.json.green_event).toBe(true)
    expect(greenRes.json.resolved_count).toBe(1)
  })

  // ----------------------------------------------------------------------
  // Scenario 8: feature flag off → green is ignored, not processed
  // ----------------------------------------------------------------------
  it('Scenario 8 — feature flag off: green events are ignored, no auto-resolve', async () => {
    const env = await setupEnv(false) // flag OFF

    await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 1,
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })

    const greenRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'success',
        workflowId: 100,
        runId: 2,
        runStartedAt: '2026-04-08T02:00:00Z',
      }),
    })
    expect(greenRes.json.ignored).toBe(true)
    expect(greenRes.json.reason).toBe('event_not_actionable')
  })

  // ----------------------------------------------------------------------
  // Scenario 9: idempotent green delivery (same dedupe_hash)
  // ----------------------------------------------------------------------
  it('Scenario 9 — same green delivered twice produces exactly one resolution', async () => {
    const env = await setupEnv(true)

    await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 1,
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })

    const greenPayload = workflowRunPayload({
      conclusion: 'success',
      workflowId: 100,
      runId: 999,
      runStartedAt: '2026-04-08T02:00:00Z',
    })

    const r1 = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: greenPayload,
    })
    expect(r1.json.resolved_count).toBe(1)
    expect(r1.json.duplicate).toBe(false)

    // Same exact green again
    const r2 = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: greenPayload,
    })
    expect(r2.json.duplicate).toBe(true)
    expect(r2.json.resolved_count).toBe(0)
  })

  // ----------------------------------------------------------------------
  // Scenario 10: skipped event is ignored (not green)
  // ----------------------------------------------------------------------
  it('Scenario 10 — skipped workflow_run is ignored, not treated as green', async () => {
    const env = await setupEnv(true)

    await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: workflowRunPayload({
        conclusion: 'failure',
        workflowId: 100,
        runId: 1,
        runStartedAt: '2026-04-08T01:00:00Z',
      }),
    })

    // Skipped should be ignored entirely
    const skippedPayload = {
      workflow_run: {
        id: 999,
        workflow_id: 100,
        name: 'CI',
        run_number: 43,
        conclusion: 'skipped',
        head_branch: 'main',
        head_sha: 'sha-test',
        run_started_at: '2026-04-08T02:00:00Z',
        created_at: '2026-04-08T02:00:00Z',
        html_url: 'https://github.com/x/y/actions/runs/999',
        actor: { login: 'test' },
        event: 'push',
      },
      repository: { full_name: 'venturecrane/crane-console' },
    }

    const skipRes = await ingest(env, {
      source: 'github',
      event_type: 'workflow_run',
      payload: skippedPayload,
    })
    expect(skipRes.json.ignored).toBe(true)
  })
})
