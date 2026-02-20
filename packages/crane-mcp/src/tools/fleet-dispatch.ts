/**
 * crane_fleet_dispatch tool - Dispatch a task to a fleet machine via SSH
 *
 * Pre-dispatch health check (SSH ping + disk space), then SSH dispatch
 * fleet-exec.sh on the target machine. Returns a structured task_id for
 * subsequent status queries.
 */

import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { z } from 'zod'

export const fleetDispatchInputSchema = z.object({
  machine: z.string().describe('Target machine hostname (Tailscale or SSH name)'),
  venture: z.string().describe('Venture code (vc, ke, sc, dfg, etc.)'),
  repo: z.string().describe('Full repo path (org/repo)'),
  issue_number: z.number().describe('GitHub issue number to implement'),
  branch_name: z.string().describe('Git branch name for the worktree'),
})

export type FleetDispatchInput = z.infer<typeof fleetDispatchInputSchema>

export interface FleetDispatchResult {
  success: boolean
  message: string
}

const SSH_TIMEOUT_MS = 15_000
const HEALTH_CHECK_TIMEOUT_MS = 10_000

/**
 * Run a command on a remote machine via SSH.
 * Returns { stdout, stderr, ok }.
 */
function sshExec(
  machine: string,
  command: string,
  timeoutMs: number = SSH_TIMEOUT_MS
): { stdout: string; stderr: string; ok: boolean } {
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
    ok: result.status === 0,
  }
}

/**
 * Pre-dispatch health check: SSH ping + disk space.
 */
function healthCheck(machine: string): { healthy: boolean; reason?: string } {
  // SSH ping
  const ping = sshExec(machine, 'echo ok', HEALTH_CHECK_TIMEOUT_MS)
  if (!ping.ok) {
    return { healthy: false, reason: `SSH unreachable: ${ping.stderr || 'connection failed'}` }
  }

  // Disk space check - warn if <2GB free on /
  const disk = sshExec(machine, "df -BG / | awk 'NR==2{print $4}'", HEALTH_CHECK_TIMEOUT_MS)
  if (disk.ok) {
    const freeGB = parseInt(disk.stdout.replace('G', ''), 10)
    if (!isNaN(freeGB) && freeGB < 2) {
      return { healthy: false, reason: `Low disk space: ${freeGB}GB free` }
    }
  }

  return { healthy: true }
}

export async function executeFleetDispatch(
  input: FleetDispatchInput
): Promise<FleetDispatchResult> {
  const { machine, venture, repo, issue_number, branch_name } = input

  // Pre-dispatch health check
  const health = healthCheck(machine)
  if (!health.healthy) {
    return {
      success: false,
      message:
        `Fleet dispatch failed: ${machine} is unhealthy.\n` +
        `Reason: ${health.reason}\n` +
        `Fix the issue and retry, or choose a different machine.`,
    }
  }

  // Generate task ID
  const taskId = `task_${randomUUID().replace(/-/g, '').slice(0, 16)}`

  // Build the SSH command to run fleet-exec.sh on the target
  // Arguments are passed positionally to avoid shell injection via content
  const fleetExecPath = '$HOME/dev/crane-console/scripts/fleet-exec.sh'
  const sshCommand = [
    'bash',
    fleetExecPath,
    shellescape(taskId),
    shellescape(venture),
    shellescape(repo),
    String(issue_number),
    shellescape(branch_name),
  ].join(' ')

  const result = sshExec(machine, sshCommand)

  if (!result.ok) {
    return {
      success: false,
      message:
        `Fleet dispatch failed on ${machine}.\n` +
        `Task ID: ${taskId}\n` +
        `Error: ${result.stderr || 'unknown error'}\n` +
        `Command output: ${result.stdout || '(none)'}`,
    }
  }

  return {
    success: true,
    message:
      `Task dispatched successfully.\n\n` +
      `Task ID: ${taskId}\n` +
      `Machine: ${machine}\n` +
      `Issue: #${issue_number}\n` +
      `Branch: ${branch_name}\n` +
      `Venture: ${venture}\n` +
      `Repo: ${repo}\n\n` +
      `Use crane_fleet_status to check progress.`,
  }
}

/**
 * Escape a string for safe inclusion in a shell command.
 * Wraps in single quotes and escapes embedded single quotes.
 */
function shellescape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
