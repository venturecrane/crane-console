/**
 * crane_skill_invoked / crane_skill_usage tools - Skill invocation telemetry
 *
 * crane_skill_invoked: Record a skill invocation to D1 (called by SKILL.md first action)
 * crane_skill_usage:   Query aggregate usage stats for skill deprecation audits
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import type { SkillUsageStat } from '../lib/crane-api.js'

// ============================================================================
// crane_skill_invoked - Record a Skill Invocation
// ============================================================================

export const skillInvokeInputSchema = z.object({
  skill_name: z.string().describe('Name of the skill being invoked (e.g., "sos", "eos", "commit")'),
  session_id: z.string().optional().describe('Current session ID if known'),
  status: z
    .enum(['started', 'completed', 'failed'])
    .optional()
    .default('started')
    .describe('Invocation status. Default: started.'),
  duration_ms: z
    .number()
    .optional()
    .describe('Elapsed time in milliseconds (set when reporting completion or failure)'),
  error_message: z.string().optional().describe('Error detail (set on failure status)'),
})

export type SkillInvokeInput = z.infer<typeof skillInvokeInputSchema>

export interface SkillInvokeResult {
  success: boolean
  message: string
  invocation_id?: string
}

export async function executeSkillInvoke(input: SkillInvokeInput): Promise<SkillInvokeResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    // Best-effort: telemetry failure must never block the calling skill
    return {
      success: false,
      message: 'Warning: CRANE_CONTEXT_KEY not set — skill invocation not recorded.',
    }
  }

  // Auto-fill venture and repo from env (consistent with other tools)
  const venture = process.env.CRANE_VENTURE_CODE
  const repo = process.env.CRANE_REPO

  try {
    const api = new CraneApi(apiKey, getApiBase())
    const invocation = await api.recordSkillInvocation({
      skill_name: input.skill_name,
      status: input.status ?? 'started',
      duration_ms: input.duration_ms,
      error_message: input.error_message,
      ...(input.session_id ? { session_id: input.session_id } : {}),
      ...(venture ? { venture } : {}),
      ...(repo ? { repo } : {}),
    })

    return {
      success: true,
      message: `Skill invocation recorded. (${invocation.id})`,
      invocation_id: invocation.id,
    }
  } catch (error) {
    // Best-effort: swallow all HTTP/network failures
    const reason = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Warning: Failed to record skill invocation — ${reason}`,
    }
  }
}

// ============================================================================
// crane_skill_usage - Query Aggregate Skill Usage Stats
// ============================================================================

export const skillUsageInputSchema = z.object({
  since: z
    .string()
    .optional()
    .describe('Lookback window: ISO date string or relative like "30d" / "90d". Default: 30d.'),
  skill_name: z
    .string()
    .optional()
    .describe('Filter to a single skill name. Omit to see all skills.'),
})

export type SkillUsageInput = z.infer<typeof skillUsageInputSchema>

export interface SkillUsageResult {
  success: boolean
  message: string
}

function formatSkillUsageStats(stats: SkillUsageStat[], since: string): string {
  if (stats.length === 0) {
    return `No skill invocations recorded since ${since}.`
  }

  const lines: string[] = [
    `**Skill usage since ${since.split('T')[0]}** (${stats.length} skill(s)):\n`,
  ]

  for (const stat of stats) {
    const lastDate = stat.last_invoked_at.split('T')[0]
    lines.push(`- **${stat.skill_name}**: ${stat.invocation_count} invocation(s), last ${lastDate}`)
  }

  return lines.join('\n')
}

export async function executeSkillUsage(input: SkillUsageInput): Promise<SkillUsageResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot query skill usage.',
    }
  }

  try {
    const api = new CraneApi(apiKey, getApiBase())
    const stats = await api.getSkillUsage({
      since: input.since,
      skill_name: input.skill_name,
    })

    // The server returns the resolved `since` date in the response; we
    // don't surface it here because getSkillUsage only returns the stats
    // array. Use the user's input param (or the default label) for display.
    const sinceLabel = input.since ?? '30d'

    return {
      success: true,
      message: formatSkillUsageStats(stats, sinceLabel),
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to query skill usage: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
