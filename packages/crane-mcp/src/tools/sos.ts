/**
 * crane_sos tool - Start of Session / Session initialization
 * Enhanced to include P0 issues, cadence briefing, and active sessions
 */

import { z } from 'zod'
import { getAgentId } from '../lib/agent-identity.js'
import { ApiError } from '../lib/api-error.js'
import {
  CraneApi,
  type Venture,
  type ActiveSession,
  type VentureDoc,
  type HandoffRecord,
} from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import { getCurrentRepoInfo, findVentureByRepo } from '../lib/repo-scanner.js'
import { type GitHubIssue } from '../lib/github.js'

// Re-export helpers that tests import from sos.js
export { calendarDaysSince, formatAgeDays } from './sos/format-helpers.js'
export { collapseByRun } from './sos/notifications.js'
export { buildSosMessage, type BuildSosMessageParams } from './sos/message-builder.js'
export { type HealingResults } from './sos/doc-heal.js'

import { runValidVentureSession } from './sos/session-runner.js'
import { handleVentureNavigation, handleVentureSelection } from './sos/venture-routing.js'

export const sosInputSchema = z.object({
  venture: z.string().optional().describe('Venture code to work on (skips selection if provided)'),
  mode: z
    .enum(['full', 'fleet'])
    .optional()
    .describe('SOS mode: full (default) or fleet (minimal for fleet agents)'),
})

export type SosInput = z.infer<typeof sosInputSchema>

export interface SosResult {
  status: 'valid' | 'needs_navigation' | 'needs_clone' | 'select_venture' | 'error'
  current_dir: string
  context?: {
    venture: string
    venture_name: string
    repo: string
    branch: string
    session_id: string
  }
  last_handoff?: {
    summary: string
    from_agent: string
    status: string
    created_at: string
  }
  recent_handoffs?: HandoffRecord[]
  p0_issues: GitHubIssue[]
  schedule_briefing?: import('../lib/crane-api.js').ScheduleBriefingItem[]
  active_sessions: ActiveSession[]
  documentation?: VentureDoc[]
  // Navigation/selection fields (non-valid cases only)
  target_venture?: string
  target_path?: string
  clone_command?: string
  nav_command?: string
  ventures?: Array<{ code: string; name: string; installed: boolean }>
  message: string
}

function getApiKey(): string | null {
  return process.env.CRANE_CONTEXT_KEY ?? null
}

function formatNetworkError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    const causeMsg = cause instanceof Error ? ` (cause: ${cause.message})` : ''
    return `Network error: ${error.message}${causeMsg}. Check your network connection and CRANE_CONTEXT_KEY.`
  }
  return `Unknown error: ${String(error)}. Check your network connection and CRANE_CONTEXT_KEY.`
}

// Source-scan anchor (sos.test.ts cadence contract):
// --- Cadence section uses server-computed aggregates:
//   scheduleBriefing.overdue_count and scheduleBriefing.due_count
//   Rendering is in sos/message-sections.ts renderCadenceBlock()
// --- End cadence anchor

export async function executeSos(input: SosInput): Promise<SosResult> {
  const cwd = process.cwd()
  const defaultResult: Partial<SosResult> = {
    current_dir: cwd,
    p0_issues: [],
    active_sessions: [],
    documentation: undefined,
  }

  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      ...defaultResult,
      status: 'error',
      message: 'CRANE_CONTEXT_KEY not found.\n\n' + 'Launch with: crane vc',
    } as SosResult
  }

  const api = new CraneApi(apiKey, getApiBase())

  let ventures: Venture[]
  try {
    ventures = await api.getVentures()
  } catch (error) {
    const detail = error instanceof ApiError ? error.toToolMessage() : formatNetworkError(error)
    return {
      ...defaultResult,
      status: 'error',
      message: `Failed to fetch ventures from Crane API.\n${detail}`,
    } as SosResult
  }

  const currentRepo = getCurrentRepoInfo()

  if (currentRepo) {
    const venture = findVentureByRepo(ventures, currentRepo.org, currentRepo.repo)

    if (venture) {
      try {
        return await runValidVentureSession(api, venture, currentRepo, input, cwd)
      } catch (error) {
        const detail =
          error instanceof ApiError ? error.toToolMessage(getAgentId()) : formatNetworkError(error)
        return {
          ...defaultResult,
          status: 'error',
          message: `Failed to start session.\n${detail}`,
        } as SosResult
      }
    }
  }

  // Not in a valid venture repo
  if (input.venture) {
    return handleVentureNavigation(ventures, input.venture, defaultResult)
  }

  return handleVentureSelection(ventures, currentRepo, cwd, defaultResult)
}
