/**
 * crane_handoff tool - Create a session handoff
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getCurrentRepoInfo, findVentureByOrg } from '../lib/repo-scanner.js'

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
  try {
    const hostname = process.env.HOSTNAME || require('os').hostname() || 'unknown'
    return `crane-mcp-${hostname}`
  } catch {
    return 'crane-mcp-unknown'
  }
}

export async function executeHandoff(input: HandoffInput): Promise<HandoffResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot create handoff.',
    }
  }

  // Get current context
  const repoInfo = getCurrentRepoInfo()
  if (!repoInfo) {
    return {
      success: false,
      message: 'Not in a git repository. Cannot create handoff.',
    }
  }

  const api = new CraneApi(apiKey)

  // Find venture
  let venture
  try {
    const ventures = await api.getVentures()
    venture = findVentureByOrg(ventures, repoInfo.org)
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
      repo: `${repoInfo.org}/${repoInfo.repo}`,
      agent: getAgentName(),
      summary: input.summary,
      status: input.status,
      issue_number: input.issue_number,
    })

    return {
      success: true,
      message:
        `Handoff created.\n\n` +
        `Venture: ${venture.name}\n` +
        `Status: ${input.status}\n` +
        (input.issue_number ? `Issue: #${input.issue_number}\n` : '') +
        `\nSummary:\n${input.summary}`,
    }
  } catch (error) {
    return {
      success: false,
      message: 'Failed to create handoff. Check API connectivity.',
    }
  }
}
