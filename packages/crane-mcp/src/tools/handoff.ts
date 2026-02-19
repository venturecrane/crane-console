/**
 * crane_handoff tool - Create a session handoff
 */

import { hostname } from 'node:os'
import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import { getCurrentRepoInfo, findVentureByRepo } from '../lib/repo-scanner.js'
import { getSessionContext } from '../lib/session-state.js'

export const handoffInputSchema = z.object({
  summary: z.string().describe('Summary of work completed and any in-progress items'),
  status: z
    .enum(['in_progress', 'blocked', 'done'])
    .describe('Current status: in_progress, blocked, or done'),
  issue_number: z.number().optional().describe('GitHub issue number if applicable'),
})

export type HandoffInput = z.infer<typeof handoffInputSchema>

export interface HandoffResult {
  success: boolean
  message: string
}

function getAgentName(): string {
  const host = process.env.HOSTNAME || hostname() || 'unknown'
  return `crane-mcp-${host}`
}

export async function executeHandoff(input: HandoffInput): Promise<HandoffResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot create handoff.',
    }
  }

  // Require active session from SOD
  const session = getSessionContext()
  if (!session) {
    return {
      success: false,
      message: 'No active session. Run crane_sod first to start a session.',
    }
  }

  // Validate current repo matches session
  const repoInfo = getCurrentRepoInfo()
  if (!repoInfo) {
    return {
      success: false,
      message: 'Not in a git repository. Cannot create handoff.',
    }
  }

  const currentRepo = `${repoInfo.org}/${repoInfo.repo}`
  if (currentRepo !== session.repo) {
    return {
      success: false,
      message:
        `Repo mismatch: session is for ${session.repo} but current directory is ${currentRepo}. ` +
        `Run crane_sod again from the correct repo.`,
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  // Find venture
  let venture
  try {
    const ventures = await api.getVentures()
    venture = findVentureByRepo(ventures, repoInfo.org, repoInfo.repo)
  } catch {
    return {
      success: false,
      message: 'Failed to fetch ventures. Check API connectivity.',
    }
  }

  if (!venture) {
    return {
      success: false,
      message: `Unknown org: ${repoInfo.org}. Cannot create handoff.`,
    }
  }

  try {
    await api.createHandoff({
      venture: venture.code,
      repo: currentRepo,
      agent: getAgentName(),
      summary: input.summary,
      status: input.status,
      session_id: session.sessionId,
      issue_number: input.issue_number,
    })

    return {
      success: true,
      message:
        `Handoff created.\n\n` +
        `Venture: ${venture.name}\n` +
        `Status: ${input.status}\n` +
        `Session: ${session.sessionId}\n` +
        (input.issue_number ? `Issue: #${input.issue_number}\n` : '') +
        `\nSummary:\n${input.summary}`,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    return {
      success: false,
      message: `Failed to create handoff: ${detail}`,
    }
  }
}
