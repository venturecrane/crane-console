/**
 * Tests for fleet-status.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawnSync, execSync } from 'child_process'

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn().mockReturnThis(), kill: vi.fn() })),
}))

const getModule = async () => {
  vi.resetModules()
  return import('./fleet-status.js')
}

describe('fleet-status tool - task mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns success status with PR url from result.json', async () => {
    const { executeFleetStatus } = await getModule()

    // Read status.json
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          status: 'running',
          task_id: 'task_abc',
          issue: '42',
          started_at: '2026-02-20T10:00:00Z',
        }),
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      // Read result.json
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          status: 'success',
          pr_url: 'https://github.com/venturecrane/crane-console/pull/260',
          verify_attempts: 1,
          files_changed: ['src/index.ts'],
        }),
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      })

    const result = await executeFleetStatus({
      machine: 'm16',
      task_id: 'task_abc',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('success')
    expect(result.message).toContain('pull/260')
  })

  it('returns failed status with error from result.json', async () => {
    const { executeFleetStatus } = await getModule()

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ status: 'running', task_id: 'task_def' }),
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          status: 'failed',
          error: 'Tests failed after 3 attempts',
          verify_attempts: 3,
        }),
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      })

    const result = await executeFleetStatus({
      machine: 'm16',
      task_id: 'task_def',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('failed')
    expect(result.message).toContain('Tests failed after 3 attempts')
  })

  it('returns running status when PID is alive but no result.json', async () => {
    const { executeFleetStatus } = await getModule()

    vi.mocked(spawnSync)
      // status.json
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          status: 'running',
          task_id: 'task_ghi',
          started_at: new Date(Date.now() - 300_000).toISOString(),
        }),
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      // result.json - not found
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'No such file',
        pid: 2,
        output: [],
        signal: null,
      })
      // PID file
      .mockReturnValueOnce({
        status: 0,
        stdout: '12345',
        stderr: '',
        pid: 3,
        output: [],
        signal: null,
      })
      // kill -0 check - alive
      .mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 4,
        output: [],
        signal: null,
      })

    const result = await executeFleetStatus({
      machine: 'm16',
      task_id: 'task_ghi',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('running')
    expect(result.message).toContain('PID: 12345')
  })

  it('returns crashed status when PID is dead and no result.json', async () => {
    const { executeFleetStatus } = await getModule()

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ status: 'running', task_id: 'task_jkl' }),
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      // result.json - not found
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      })
      // PID file
      .mockReturnValueOnce({
        status: 0,
        stdout: '99999',
        stderr: '',
        pid: 3,
        output: [],
        signal: null,
      })
      // kill -0 check - dead
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'No such process',
        pid: 4,
        output: [],
        signal: null,
      })

    const result = await executeFleetStatus({
      machine: 'm16',
      task_id: 'task_jkl',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('crashed')
    expect(result.message).toContain('99999')
  })

  it('returns not_found when no status.json exists', async () => {
    const { executeFleetStatus } = await getModule()

    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'No such file or directory',
      pid: 1,
      output: [],
      signal: null,
    })

    const result = await executeFleetStatus({
      machine: 'm16',
      task_id: 'task_nonexistent',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('not_found')
  })
})

describe('fleet-status tool - PR mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('matches PRs to issues via Closes #N pattern', async () => {
    const { executeFleetStatus } = await getModule()

    // gh pr list
    vi.mocked(execSync)
      .mockReturnValueOnce(
        JSON.stringify([
          {
            number: 260,
            title: 'fix: resolve login issue',
            body: 'Fixes the auth flow.\n\nCloses #42',
            headRefName: '42-fix-login',
          },
          {
            number: 261,
            title: 'feat: add dashboard',
            body: 'New feature.\n\nCloses #45',
            headRefName: '45-add-dashboard',
          },
        ])
      )
      // gh pr checks for #42's PR
      .mockReturnValueOnce(
        JSON.stringify([{ name: 'CI', state: 'COMPLETED', conclusion: 'SUCCESS' }])
      )
      // gh pr view state for #42's PR
      .mockReturnValueOnce('OPEN')
      // gh pr checks for #45's PR
      .mockReturnValueOnce(
        JSON.stringify([{ name: 'CI', state: 'COMPLETED', conclusion: 'SUCCESS' }])
      )
      // gh pr view state for #45's PR
      .mockReturnValueOnce('MERGED')

    const result = await executeFleetStatus({
      repo: 'venturecrane/crane-console',
      issue_numbers: [42, 45],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('#42: PR #260')
    expect(result.message).toContain('open')
    expect(result.message).toContain('#45: PR #261')
    expect(result.message).toContain('merged')
  })

  it('reports no PR found for unmatched issues', async () => {
    const { executeFleetStatus } = await getModule()

    vi.mocked(execSync).mockReturnValueOnce(JSON.stringify([]))

    const result = await executeFleetStatus({
      repo: 'venturecrane/crane-console',
      issue_numbers: [99],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('#99: no PR found')
  })

  it('returns error when gh CLI fails', async () => {
    const { executeFleetStatus } = await getModule()

    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('gh: not found')
    })

    const result = await executeFleetStatus({
      repo: 'venturecrane/crane-console',
      issue_numbers: [42],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('Failed to list PRs')
  })

  it('matches PRs by branch name when body has no Closes', async () => {
    const { executeFleetStatus } = await getModule()

    vi.mocked(execSync)
      .mockReturnValueOnce(
        JSON.stringify([
          {
            number: 262,
            title: 'fix: something',
            body: 'No closes reference here',
            headRefName: '42-fix-something',
          },
        ])
      )
      .mockReturnValueOnce(JSON.stringify([]))
      .mockReturnValueOnce('OPEN')

    const result = await executeFleetStatus({
      repo: 'venturecrane/crane-console',
      issue_numbers: [42],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('#42: PR #262')
  })
})

describe('fleet-status tool - validation', () => {
  it('requires task mode or PR mode fields', async () => {
    const { fleetStatusInputSchema } = await getModule()

    expect(() => fleetStatusInputSchema.parse({})).toThrow()
    expect(() => fleetStatusInputSchema.parse({ machine: 'm16' })).toThrow()
    expect(() => fleetStatusInputSchema.parse({ repo: 'org/repo' })).toThrow()
  })
})
