/**
 * Tests for fleet-dispatch.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn().mockReturnThis(), kill: vi.fn() })),
}))

const getModule = async () => {
  vi.resetModules()
  return import('./fleet-dispatch.js')
}

describe('fleet-dispatch tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const baseInput = {
    machine: 'm16',
    venture: 'vc',
    repo: 'venturecrane/crane-console',
    issue_number: 42,
    branch_name: '42-fix-login',
  }

  it('dispatches successfully when machine is healthy', async () => {
    const { executeFleetDispatch } = await getModule()

    // Health check: SSH ping succeeds
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'ok',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      // Health check: disk space OK
      .mockReturnValueOnce({
        status: 0,
        stdout: '50G',
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      })
      // SSH dispatch: fleet-exec.sh succeeds
      .mockReturnValueOnce({
        status: 0,
        stdout: 'Dispatched task task_abc123 (PID 1234) for issue #42',
        stderr: '',
        pid: 3,
        output: [],
        signal: null,
      })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(true)
    expect(result.message).toContain('Task dispatched successfully')
    expect(result.message).toContain('task_')
    expect(result.message).toContain('m16')
    expect(result.message).toContain('#42')
    expect(result.message).toContain('42-fix-login')
  })

  it('fails when SSH is unreachable', async () => {
    const { executeFleetDispatch } = await getModule()

    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 255,
      stdout: '',
      stderr: 'ssh: connect to host m16 port 22: Connection refused',
      pid: 1,
      output: [],
      signal: null,
    })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(false)
    expect(result.message).toContain('unhealthy')
    expect(result.message).toContain('SSH unreachable')
  })

  it('fails when disk space is low', async () => {
    const { executeFleetDispatch } = await getModule()

    // SSH ping succeeds
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'ok',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      // Disk space: only 1GB free
      .mockReturnValueOnce({
        status: 0,
        stdout: '1G',
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(false)
    expect(result.message).toContain('unhealthy')
    expect(result.message).toContain('Low disk space')
  })

  it('fails when fleet-exec.sh returns error', async () => {
    const { executeFleetDispatch } = await getModule()

    // Health checks pass
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'ok',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: '50G',
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      })
      // fleet-exec.sh fails
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'Error: /home/user/dev/crane-console is not a git repo',
        pid: 3,
        output: [],
        signal: null,
      })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(false)
    expect(result.message).toContain('Fleet dispatch failed')
    expect(result.message).toContain('not a git repo')
  })

  it('uses structured SSH args for defense against injection', async () => {
    const { executeFleetDispatch } = await getModule()

    // Health checks pass
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'ok',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: '50G',
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'ok',
        stderr: '',
        pid: 3,
        output: [],
        signal: null,
      })

    await executeFleetDispatch({
      ...baseInput,
      branch_name: "42-fix'; rm -rf /; echo '",
    })

    // The SSH dispatch call (3rd call) should have shell-escaped args
    const dispatchCall = vi.mocked(spawnSync).mock.calls[2]
    expect(dispatchCall[0]).toBe('ssh')
    const sshCommand = dispatchCall[1]![dispatchCall[1]!.length - 1]
    // Branch name should be quoted
    expect(sshCommand).toContain("'42-fix'\\''")
  })
})
