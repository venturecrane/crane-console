/**
 * crane_handoff tool - Create a session handoff
 */

import { hostname } from 'node:os'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import { getCurrentRepoInfo, getCurrentRepoRoot, findVentureByRepo } from '../lib/repo-scanner.js'
import { getSessionContext } from '../lib/session-state.js'
import { getLastActivityTimestamp } from '../lib/session-log.js'

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
      message: 'No active session. Run crane_sos first to start a session.',
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
  } catch {
    return {
      success: false,
      message: 'Failed to fetch ventures. Check API connectivity.',
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
      agent: getAgentName(),
      summary: input.summary,
      status: input.status,
      session_id: session.sessionId,
      issue_number: input.issue_number,
      last_activity_at: lastActivityAt,
    })

    // Dual-write: also write .claude/handoff.md as a disposable cache for CC's native /resume.
    // D1 is the authoritative source. This file is gitignored and overwritten on every handoff.
    //
    // Resolve the repo root via `git rev-parse --show-toplevel` rather than
    // process.cwd(). The agent's cwd may be a subdirectory of the repo
    // (e.g., packages/crane-mcp/) and vitest's cwd is the package dir, not
    // the repo root. Using cwd would write the cache to the wrong place and
    // pollute test runs. Skip the dual-write entirely if we can't find the
    // git root — the D1 write already succeeded and the cache is best-effort.
    try {
      const repoRoot = getCurrentRepoRoot()
      if (!repoRoot) {
        throw new Error('Not inside a git repository — skipping dual-write')
      }
      const claudeDir = join(repoRoot, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      const handoffContent =
        `# Handoff\n\n` +
        `**Venture:** ${venture.name}\n` +
        `**Status:** ${input.status}\n` +
        `**Session:** ${session.sessionId}\n` +
        `**Agent:** ${getAgentName()}\n` +
        `**Date:** ${new Date().toISOString()}\n` +
        (input.issue_number ? `**Issue:** #${input.issue_number}\n` : '') +
        `\n## Summary\n\n${input.summary}\n`
      writeFileSync(join(claudeDir, 'handoff.md'), handoffContent)
    } catch {
      // Dual-write is best-effort. D1 write already succeeded.
    }

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
