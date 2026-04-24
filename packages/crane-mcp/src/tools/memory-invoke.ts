/**
 * crane_memory_invoked / crane_memory_usage tools - Memory invocation telemetry
 *
 * crane_memory_invoked: Record a memory event (surfaced/cited/parse_error). Best-effort.
 * crane_memory_usage:   Query aggregate usage stats for audit and deprecation checks.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import type { MemoryUsageStat } from '../lib/crane-api.js'

// ============================================================================
// crane_memory_invoked
// ============================================================================

export const memoryInvokeInputSchema = z.object({
  memory_id: z.string().describe('ID of the memory note'),
  event: z
    .enum(['surfaced', 'cited', 'parse_error'])
    .describe(
      'surfaced: appeared in SOS/skill injection (sampled 1/10); cited: agent referenced it (always recorded); parse_error: frontmatter validation failed (always recorded)'
    ),
  session_id: z.string().optional().describe('Current session ID if known'),
})

export type MemoryInvokeInput = z.infer<typeof memoryInvokeInputSchema>

export interface MemoryInvokeResult {
  success: boolean
  message: string
  invocation_id?: string
}

export async function executeMemoryInvoke(input: MemoryInvokeInput): Promise<MemoryInvokeResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'Warning: CRANE_CONTEXT_KEY not set — memory invocation not recorded.',
    }
  }

  // surfaced events are sampled at 1/10 to reduce write volume
  if (input.event === 'surfaced' && Math.random() >= 0.1) {
    return { success: true, message: 'Sampled out (surfaced events recorded at 1/10 rate).' }
  }

  const venture = process.env.CRANE_VENTURE_CODE
  const repo = process.env.CRANE_REPO

  try {
    const api = new CraneApi(apiKey, getApiBase())
    const invocation = await api.recordMemoryInvocation({
      memory_id: input.memory_id,
      event: input.event,
      ...(input.session_id ? { session_id: input.session_id } : {}),
      ...(venture ? { venture } : {}),
      ...(repo ? { repo } : {}),
    })

    return {
      success: true,
      message: `Memory invocation recorded. (${invocation.id})`,
      invocation_id: invocation.id,
    }
  } catch (error) {
    // Best-effort: swallow all HTTP/network failures — telemetry must never block callers
    const reason = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Warning: Failed to record memory invocation — ${reason}`,
    }
  }
}

// ============================================================================
// crane_memory_usage
// ============================================================================

export const memoryUsageInputSchema = z.object({
  since: z
    .string()
    .optional()
    .describe('Lookback window: ISO date string or relative like "30d" / "90d". Default: 90d.'),
  memory_id: z
    .string()
    .optional()
    .describe('Filter to a single memory ID. Omit to see all memories.'),
})

export type MemoryUsageInput = z.infer<typeof memoryUsageInputSchema>

export interface MemoryUsageResult {
  success: boolean
  message: string
}

function formatMemoryUsageStats(stats: MemoryUsageStat[], since: string): string {
  if (stats.length === 0) {
    return `No memory invocations recorded since ${since}.`
  }

  const lines: string[] = [
    `**Memory usage since ${since.split('T')[0]}** (${stats.length} memory(ies)):\n`,
  ]

  for (const stat of stats) {
    const lastDate = stat.last_event_at ? stat.last_event_at.split('T')[0] : 'never'
    lines.push(
      `- **${stat.memory_id}**: surfaced=${stat.surfaced_count}, cited=${stat.cited_count}, last ${lastDate}`
    )
  }

  return lines.join('\n')
}

export async function executeMemoryUsage(input: MemoryUsageInput): Promise<MemoryUsageResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot query memory usage.',
    }
  }

  try {
    const api = new CraneApi(apiKey, getApiBase())
    const stats = await api.getMemoryUsage({
      since: input.since,
      memory_id: input.memory_id,
    })

    const sinceLabel = input.since ?? '90d'
    return {
      success: true,
      message: formatMemoryUsageStats(stats, sinceLabel),
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to query memory usage: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
