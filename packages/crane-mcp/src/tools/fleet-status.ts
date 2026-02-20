/**
 * crane_fleet_status tool - Check task or PR status on fleet machines
 *
 * Dual-mode:
 *   Task mode: SSH to target, read status.json + result.json, check PID alive.
 *   PR mode: gh pr list + checks, match PRs to issues via "Closes #N".
 */

import { spawnSync, execSync } from 'node:child_process'
import { z } from 'zod'

export const fleetStatusInputSchema = z
  .object({
    // Task mode fields
    machine: z.string().optional().describe('Target machine hostname (task mode)'),
    task_id: z.string().optional().describe('Task ID to check (task mode)'),
    // PR mode fields
    repo: z.string().optional().describe('Full repo path org/repo (PR mode)'),
    issue_numbers: z
      .array(z.number())
      .optional()
      .describe('Issue numbers to check PRs for (PR mode)'),
  })
  .refine(
    (data) => {
      const hasTaskMode = data.machine && data.task_id
      const hasPrMode = data.repo && data.issue_numbers
      return hasTaskMode || hasPrMode
    },
    {
      message:
        'Provide either (machine + task_id) for task mode or (repo + issue_numbers) for PR mode',
    }
  )

export type FleetStatusInput = z.infer<typeof fleetStatusInputSchema>

export interface FleetStatusResult {
  success: boolean
  message: string
}

const SSH_TIMEOUT_MS = 15_000

/**
 * Run a command on a remote machine via SSH.
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
 * Task mode: SSH to target, read status.json + result.json, check PID.
 */
function checkTaskStatus(machine: string, taskId: string): string {
  const taskDir = `$HOME/.crane/tasks/${taskId}`

  // Read status.json
  const statusResult = sshExec(machine, `cat ${taskDir}/status.json 2>/dev/null`)
  if (!statusResult.ok) {
    return `Task ${taskId} on ${machine}: not_found\n(No status.json at ${taskDir})`
  }

  let status: Record<string, unknown>
  try {
    status = JSON.parse(statusResult.stdout)
  } catch {
    return `Task ${taskId} on ${machine}: error\n(Malformed status.json)`
  }

  // Read result.json (written by the agent on completion)
  const resultResult = sshExec(machine, `cat ${taskDir}/worktree/result.json 2>/dev/null`)
  let agentResult: Record<string, unknown> | null = null
  if (resultResult.ok && resultResult.stdout) {
    try {
      agentResult = JSON.parse(resultResult.stdout)
    } catch {
      // result.json exists but malformed
    }
  }

  // If agent wrote result.json, that's the definitive status
  if (agentResult) {
    const agentStatus = agentResult.status as string
    const prUrl = agentResult.pr_url as string | undefined
    const error = agentResult.error as string | undefined
    const attempts = agentResult.verify_attempts as number | undefined

    let msg = `Task ${taskId} on ${machine}: ${agentStatus}\n`
    if (prUrl) msg += `PR: ${prUrl}\n`
    if (error) msg += `Error: ${error}\n`
    if (attempts !== undefined) msg += `Verify attempts: ${attempts}\n`
    return msg.trimEnd()
  }

  // No result.json yet - check if PID is still alive
  const pidResult = sshExec(machine, `cat ${taskDir}/pid 2>/dev/null`)
  if (pidResult.ok && pidResult.stdout) {
    const pid = pidResult.stdout.trim()
    const alive = sshExec(machine, `kill -0 ${pid} 2>/dev/null`)

    if (alive.ok) {
      // Calculate age
      const startedAt = status.started_at as string | undefined
      let ageStr = ''
      if (startedAt) {
        const ageMs = Date.now() - new Date(startedAt).getTime()
        const ageMin = Math.round(ageMs / 60_000)
        ageStr = ` (running ${ageMin}min)`
      }

      return `Task ${taskId} on ${machine}: running${ageStr}\nPID: ${pid}`
    } else {
      // PID is dead but no result.json - crashed
      return `Task ${taskId} on ${machine}: crashed\nPID ${pid} is dead, no result.json found.`
    }
  }

  // No PID file either - just report status.json content
  return `Task ${taskId} on ${machine}: ${status.status || 'unknown'}`
}

/**
 * PR mode: check GitHub PRs matching the given issues.
 */
function checkPrStatus(repo: string, issueNumbers: number[]): string {
  // List open PRs for the repo
  let prList: Array<{ number: number; title: string; body: string; headRefName: string }>
  try {
    const output = execSync(
      `gh pr list --repo ${repo} --state all --limit 50 --json number,title,body,headRefName`,
      { encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    prList = JSON.parse(output)
  } catch {
    return `Failed to list PRs for ${repo}. Check gh CLI auth.`
  }

  // Match PRs to issues via "Closes #N" in body or branch name starting with issue number
  const lines: string[] = []

  for (const issueNum of issueNumbers) {
    const closesPattern = new RegExp(`closes\\s+#${issueNum}\\b`, 'i')
    const branchPattern = new RegExp(`^${issueNum}-`)

    const matchedPr = prList.find(
      (pr) => closesPattern.test(pr.body || '') || branchPattern.test(pr.headRefName || '')
    )

    if (!matchedPr) {
      lines.push(`#${issueNum}: no PR found`)
      continue
    }

    // Check CI status for the matched PR
    let ciStatus = 'unknown'
    try {
      const checksOutput = execSync(
        `gh pr checks ${matchedPr.number} --repo ${repo} --json name,state,conclusion 2>/dev/null`,
        { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      const checks: Array<{ name: string; state: string; conclusion: string }> =
        JSON.parse(checksOutput)

      if (checks.length === 0) {
        ciStatus = 'no checks'
      } else {
        const failed = checks.filter(
          (c) => c.conclusion === 'FAILURE' || c.conclusion === 'failure'
        )
        const pending = checks.filter(
          (c) => c.state === 'PENDING' || c.state === 'IN_PROGRESS' || c.state === 'QUEUED'
        )

        if (failed.length > 0) {
          ciStatus = `failed (${failed.map((c) => c.name).join(', ')})`
        } else if (pending.length > 0) {
          ciStatus = 'pending'
        } else {
          ciStatus = 'passing'
        }
      }
    } catch {
      ciStatus = 'check failed'
    }

    // Get PR merge state
    let prState = 'open'
    try {
      const stateOutput = execSync(
        `gh pr view ${matchedPr.number} --repo ${repo} --json state -q .state`,
        { encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      prState = stateOutput.trim().toLowerCase()
    } catch {
      // Use default "open"
    }

    lines.push(
      `#${issueNum}: PR #${matchedPr.number} (${prState}) | CI: ${ciStatus} | Branch: ${matchedPr.headRefName}`
    )
  }

  return lines.join('\n')
}

export async function executeFleetStatus(input: FleetStatusInput): Promise<FleetStatusResult> {
  // Task mode
  if (input.machine && input.task_id) {
    const result = checkTaskStatus(input.machine, input.task_id)
    return {
      success: true,
      message: result,
    }
  }

  // PR mode
  if (input.repo && input.issue_numbers) {
    const result = checkPrStatus(input.repo, input.issue_numbers)
    return {
      success: true,
      message: result,
    }
  }

  return {
    success: false,
    message:
      'Provide either (machine + task_id) for task mode or (repo + issue_numbers) for PR mode.',
  }
}
