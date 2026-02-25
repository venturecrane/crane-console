/**
 * Shared SSH execution utility for fleet tools.
 *
 * Extracted from fleet-dispatch.ts and fleet-status.ts to avoid duplication.
 */

import { spawnSync } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Run a command on a remote machine via SSH.
 * Returns { stdout, stderr, exitCode, ok }.
 */
export function sshExec(
  machine: string,
  command: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): { stdout: string; stderr: string; exitCode: number | null; ok: boolean } {
  const result = spawnSync(
    'ssh',
    [
      '-o',
      'ConnectTimeout=5',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'BatchMode=yes',
      machine,
      command,
    ],
    {
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  )

  return {
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    exitCode: result.status,
    ok: result.status === 0,
  }
}
