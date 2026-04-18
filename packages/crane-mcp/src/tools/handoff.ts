/**
 * crane_handoff tool - Create a session handoff
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import { getCurrentRepoInfo, findVentureByRepo } from '../lib/repo-scanner.js'
import { getSessionContext } from '../lib/session-state.js'
import { getLastActivityTimestamp } from '../lib/session-log.js'
import { getAgentId } from '../lib/agent-identity.js'
import { ApiError } from '../lib/api-error.js'
import { executeSos } from './sos.js'
import type { SosResult } from './sos.js'

/**
 * Max time to wait on a self-heal `executeSos` call before giving up and
 * returning a `[client]` failure. Prevents a slow/unreachable crane-context
 * API from hanging `/eos` indefinitely across the fleet.
 */
const SELF_HEAL_TIMEOUT_MS = 5000

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const handoffInputSchema = z.object({
  summary: z.string().describe('Summary of work completed and any in-progress items'),
  status: z
    .enum(['in_progress', 'blocked', 'done'])
    .describe('Current status: in_progress, blocked, or done'),
  issue_number: z.number().optional().describe('GitHub issue number if applicable'),
  venture: z
    .string()
    .optional()
    .describe(
      'Venture code override for cross-venture sessions. When set, writes the handoff for this venture instead of auto-detecting from the current repo.'
    ),
})

export type HandoffInput = z.infer<typeof handoffInputSchema>

export interface HandoffResult {
  success: boolean
  message: string
}

// Agent-name construction uses the shared helper so the crane-context
// server's isValidAgent validator and this client's producer stay aligned.
// See packages/crane-contracts/src/agent.ts.

export async function executeHandoff(input: HandoffInput): Promise<HandoffResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot create handoff.',
    }
  }

  // Resolve active session. If the in-memory cache is null (common when
  // the MCP subprocess restarts between /sos and /eos), self-heal by
  // calling executeSos — which resumes or creates via the server's
  // (agent, venture, repo, track) tuple. `setSession` is called inside
  // executeSos on success, so sessionContext becomes populated.
  //
  // Failure messages on this path MUST start with [client] and avoid the
  // words D1 / server / database so agents and operators can't misattribute
  // a client-side short-circuit to a server or data-layer fault. Tests
  // enforce both the positive tag and the forbidden substrings.
  let session = getSessionContext()
  if (!session) {
    if (!process.env.CRANE_VENTURE_CODE) {
      return {
        success: false,
        message:
          '[client] crane launcher env not detected (CRANE_VENTURE_CODE missing). ' +
          'Run inside the `crane <venture>` wrapper, not bare `claude`. Handoff not persisted.',
      }
    }

    let sosResult: SosResult
    try {
      sosResult = await withTimeout(
        executeSos({ venture: input.venture, mode: 'fleet' }),
        SELF_HEAL_TIMEOUT_MS,
        'crane_sos recovery'
      )
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        message: `[client] Session recovery failed: ${reason}. Handoff not persisted. This is a client-side failure.`,
      }
    }

    if (sosResult.status !== 'valid') {
      const reason = sosResult.message.split('\n')[0] || sosResult.status
      return {
        success: false,
        message:
          `[client] Session recovery via crane_sos returned status="${sosResult.status}". ` +
          `Reason: ${reason}. Handoff not persisted. This is a client-side failure.`,
      }
    }

    session = getSessionContext()
    if (!session) {
      return {
        success: false,
        message:
          '[client] crane_sos reported success but session state is still null. ' +
          'Internal inconsistency; handoff not persisted.',
      }
    }
  }

  // Validate current repo matches session (skip check if venture override provided)
  const repoInfo = getCurrentRepoInfo()
  if (!repoInfo) {
    return {
      success: false,
      message: 'Not in a git repository. Cannot create handoff.',
    }
  }

  const currentRepo = `${repoInfo.org}/${repoInfo.repo}`
  if (!input.venture && currentRepo !== session.repo) {
    return {
      success: false,
      message:
        `Repo mismatch: session is for ${session.repo} but current directory is ${currentRepo}. ` +
        `Run crane_sos again from the correct repo.`,
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  // Find venture - use override if provided, otherwise detect from repo
  let venture
  try {
    const ventures = await api.getVentures()
    if (input.venture) {
      venture = ventures.find((v) => v.code === input.venture)
    } else {
      venture = findVentureByRepo(ventures, repoInfo.org, repoInfo.repo)
    }
  } catch (error) {
    const detail =
      error instanceof ApiError
        ? error.toToolMessage()
        : error instanceof Error
          ? `Network error: ${error.message}`
          : `Unknown error: ${String(error)}`
    return {
      success: false,
      message: `Failed to fetch ventures.\n${detail}`,
    }
  }

  if (!venture) {
    const target = input.venture ? `venture code: ${input.venture}` : `org: ${repoInfo.org}`
    return {
      success: false,
      message: `Unknown ${target}. Cannot create handoff.`,
    }
  }

  // When using venture override, resolve the repo from the venture config
  const handoffRepo =
    input.venture && venture.repos.length > 0 ? `${venture.org}/${venture.repos[0]}` : currentRepo

  try {
    // Best-effort: discover last real activity from Claude Code session log
    let lastActivityAt: string | undefined
    try {
      lastActivityAt = (await getLastActivityTimestamp()) ?? undefined
    } catch {
      // Non-fatal: fall back to current behavior (ended_at = now)
    }

    await api.createHandoff({
      venture: venture.code,
      repo: handoffRepo,
      agent: getAgentId(),
      summary: input.summary,
      status: input.status,
      session_id: session.sessionId,
      issue_number: input.issue_number,
      last_activity_at: lastActivityAt,
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
    const detail =
      error instanceof ApiError
        ? error.toToolMessage(getAgentId())
        : error instanceof Error
          ? `Network error: ${error.message}`
          : `Unknown error: ${String(error)}`
    return {
      success: false,
      message: `Failed to create handoff.\n${detail}`,
    }
  }
}
