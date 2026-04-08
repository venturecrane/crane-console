/**
 * crane_deploy_heartbeat tool
 *
 * Plan §B.6: list cold deploy pipelines, suppress / unsuppress
 * heartbeats, and surface stale-webhook signals.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'

export const deployHeartbeatInputSchema = z.object({
  action: z
    .enum(['list', 'suppress', 'unsuppress', 'seed'])
    .default('list')
    .describe('Action to perform (default: list)'),
  venture: z.string().describe('Venture code (vc, ke, sc, dfg, etc.)'),
  repo_full_name: z
    .string()
    .optional()
    .describe('Required for seed/suppress/unsuppress: full owner/repo path'),
  workflow_id: z
    .number()
    .optional()
    .describe('Required for seed/suppress/unsuppress: GitHub Actions workflow ID'),
  branch: z.string().optional().describe('Branch (defaults to main)'),
  reason: z.string().optional().describe('Required for suppress: human-readable reason'),
  until: z
    .string()
    .optional()
    .describe('Optional ISO8601 timestamp; suppression auto-expires at that point'),
  cold_threshold_days: z
    .number()
    .optional()
    .describe('For seed: per-row cold threshold in days (default 3)'),
})

export type DeployHeartbeatInput = z.infer<typeof deployHeartbeatInputSchema>

export interface DeployHeartbeatResult {
  success: boolean
  message: string
}

function getApiKey(): string | null {
  return process.env.CRANE_CONTEXT_KEY || null
}

function relativeAge(ms: number): string {
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) return `${days}d`
  const hours = Math.floor(ms / 3_600_000)
  return `${hours}h`
}

export async function executeDeployHeartbeat(
  input: DeployHeartbeatInput
): Promise<DeployHeartbeatResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Launch with: crane vc',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  if (input.action === 'list') {
    try {
      const result = await api.getDeployHeartbeats(input.venture)
      const tracked = result.heartbeats.filter((hb) => hb.suppressed === 0).length
      const suppressed = result.suppressed.length
      const cold = result.cold.length
      const stale = result.stale_webhooks.length

      let message = `## Deploy Pipelines — ${input.venture}\n\n`
      message += `${tracked} active, ${suppressed} suppressed, ${cold} cold, ${stale} stale-webhook\n\n`

      if (cold > 0) {
        message += `### Cold (commits stuck without successful deploy)\n\n`
        message += `| Repo | Workflow | Stuck for | Threshold |\n`
        message += `|------|----------|-----------|----------|\n`
        for (const c of result.cold) {
          message += `| ${c.repo_full_name} | ${c.workflow_id} | ${relativeAge(c.age_ms)} | ${c.cold_threshold_days}d |\n`
        }
        message += '\n'
      }

      if (stale > 0) {
        message += `### Stale webhooks (recent commit, no run recorded)\n\n`
        for (const hb of result.stale_webhooks) {
          message += `- ${hb.repo_full_name} (workflow ${hb.workflow_id}) — last commit ${hb.last_main_commit_at}\n`
        }
        message += '\n'
      }

      if (suppressed > 0) {
        message += `### Suppressed (intentionally skipped)\n\n`
        for (const hb of result.suppressed) {
          const until = hb.suppress_until ? ` until ${hb.suppress_until}` : ''
          message += `- ${hb.repo_full_name} (workflow ${hb.workflow_id})${until}: ${hb.suppress_reason ?? '(no reason)'}\n`
        }
        message += '\n'
      }

      if (cold === 0 && stale === 0) {
        message += `_All ${tracked} active pipelines healthy._\n`
      }

      return { success: true, message }
    } catch (error) {
      return {
        success: false,
        message: `Failed to list deploy heartbeats: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  if (input.action === 'suppress') {
    if (!input.repo_full_name || typeof input.workflow_id !== 'number' || !input.reason) {
      return {
        success: false,
        message: 'suppress requires: repo_full_name, workflow_id, reason',
      }
    }
    try {
      await api.suppressDeployHeartbeat({
        venture: input.venture,
        repo_full_name: input.repo_full_name,
        workflow_id: input.workflow_id,
        branch: input.branch,
        reason: input.reason,
        until: input.until ?? null,
      })
      return {
        success: true,
        message: `Suppressed ${input.repo_full_name} workflow ${input.workflow_id}: ${input.reason}`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Suppress failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  if (input.action === 'seed') {
    if (!input.repo_full_name || typeof input.workflow_id !== 'number') {
      return {
        success: false,
        message: 'seed requires: repo_full_name, workflow_id',
      }
    }
    try {
      await api.seedDeployHeartbeat({
        venture: input.venture,
        repo_full_name: input.repo_full_name,
        workflow_id: input.workflow_id,
        branch: input.branch,
        cold_threshold_days: input.cold_threshold_days,
      })
      return {
        success: true,
        message: `Seeded ${input.repo_full_name} workflow ${input.workflow_id} (${input.venture})`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  if (input.action === 'unsuppress') {
    if (!input.repo_full_name || typeof input.workflow_id !== 'number') {
      return {
        success: false,
        message: 'unsuppress requires: repo_full_name, workflow_id',
      }
    }
    try {
      await api.unsuppressDeployHeartbeat({
        venture: input.venture,
        repo_full_name: input.repo_full_name,
        workflow_id: input.workflow_id,
        branch: input.branch,
      })
      return {
        success: true,
        message: `Unsuppressed ${input.repo_full_name} workflow ${input.workflow_id}`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Unsuppress failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return {
    success: false,
    message: `Unknown action: ${input.action}`,
  }
}
