/**
 * Tests for fleet-dispatch.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/ssh.js', () => ({
  sshExec: vi.fn(),
}))

vi.mock('../lib/fleet-reliability.js', () => ({
  recordDispatch: vi.fn(),
}))

const getModule = async () => {
  vi.resetModules()
  return import('./fleet-dispatch.js')
}

const getSshMock = async () => {
  vi.resetModules()
  const mod = await import('../lib/ssh.js')
  return vi.mocked(mod.sshExec)
}

describe('fleet-dispatch tool', () => {
  let sshExecMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../lib/ssh.js')
    sshExecMock = vi.mocked(mod.sshExec)
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
    sshExecMock
      .mockReturnValueOnce({ stdout: 'ok', stderr: '', exitCode: 0, ok: true })
      // Health check: disk space OK
      .mockReturnValueOnce({ stdout: '50G', stderr: '', exitCode: 0, ok: true })
      // SSH dispatch: fleet-exec.sh succeeds
      .mockReturnValueOnce({
        stdout: 'Dispatched task task_abc123 (PID 1234) for issue #42',
        stderr: '',
        exitCode: 0,
        ok: true,
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

    sshExecMock.mockReturnValueOnce({
      stdout: '',
      stderr: 'ssh: connect to host m16 port 22: Connection refused',
      exitCode: 255,
      ok: false,
    })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(false)
    expect(result.message).toContain('unhealthy')
    expect(result.message).toContain('SSH unreachable')
  })

  it('fails when disk space is low', async () => {
    const { executeFleetDispatch } = await getModule()

    // SSH ping succeeds
    sshExecMock
      .mockReturnValueOnce({ stdout: 'ok', stderr: '', exitCode: 0, ok: true })
      // Disk space: only 1GB free
      .mockReturnValueOnce({ stdout: '1G', stderr: '', exitCode: 0, ok: true })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(false)
    expect(result.message).toContain('unhealthy')
    expect(result.message).toContain('Low disk space')
  })

  it('fails when fleet-exec.sh returns error', async () => {
    const { executeFleetDispatch } = await getModule()

    // Health checks pass
    sshExecMock
      .mockReturnValueOnce({ stdout: 'ok', stderr: '', exitCode: 0, ok: true })
      .mockReturnValueOnce({ stdout: '50G', stderr: '', exitCode: 0, ok: true })
      // fleet-exec.sh fails
      .mockReturnValueOnce({
        stdout: '',
        stderr: 'Error: /home/user/dev/crane-console is not a git repo',
        exitCode: 1,
        ok: false,
      })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(false)
    expect(result.message).toContain('Fleet dispatch failed')
    expect(result.message).toContain('not a git repo')
  })

  it('includes exit code in failure message', async () => {
    const { executeFleetDispatch } = await getModule()

    sshExecMock
      .mockReturnValueOnce({ stdout: 'ok', stderr: '', exitCode: 0, ok: true })
      .mockReturnValueOnce({ stdout: '50G', stderr: '', exitCode: 0, ok: true })
      .mockReturnValueOnce({
        stdout: '',
        stderr: 'timeout',
        exitCode: 124,
        ok: false,
      })

    const result = await executeFleetDispatch(baseInput)

    expect(result.success).toBe(false)
    expect(result.message).toContain('exit code 124')
  })

  it('uses structured SSH args for defense against injection', async () => {
    const { executeFleetDispatch } = await getModule()

    // Health checks pass + dispatch succeeds
    sshExecMock
      .mockReturnValueOnce({ stdout: 'ok', stderr: '', exitCode: 0, ok: true })
      .mockReturnValueOnce({ stdout: '50G', stderr: '', exitCode: 0, ok: true })
      .mockReturnValueOnce({ stdout: 'ok', stderr: '', exitCode: 0, ok: true })

    await executeFleetDispatch({
      ...baseInput,
      branch_name: "42-fix'; rm -rf /; echo '",
    })

    // The SSH dispatch call (3rd call) should have shell-escaped args
    const dispatchCall = sshExecMock.mock.calls[2]
    const sshCommand = dispatchCall[1] as string
    // Branch name should be quoted
    expect(sshCommand).toContain("'42-fix'\\''")
  })
})
