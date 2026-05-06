/**
 * crane_handoff tool - Create a session handoff
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import { getCurrentRepoInfo, findVentureByRepo } from '../lib/repo-scanner.js'
import { getSessionContext } from '../lib/session-state.js'
import {
  getLastActivityTimestamp,
  getClientSessionId,
  jsonlPathFor,
  extractActivityEvents,
} from '../lib/session-log.js'
import { getAgentId } from '../lib/agent-identity.js'
import { ApiError } from '../lib/api-error.js'
import { executeSos } from './sos.js'
import type { SosResult } from './sos.js'
import { evaluatePrMergeGate } from '../lib/pr-merge-gate.js'
import { evaluateVerifyCoverageGate } from '../lib/verify-coverage-gate.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
  final: z
    .boolean()
    .optional()
    .describe(
      'When false, create the handoff but keep the session active so additional per-venture handoffs can be saved. Pass false for ventures 1..N-1 in a multi-venture /eos flow, then true (or omit) on the final call. Defaults to true (current single-handoff behavior — ends the session).'
    ),
  override_pr_merge_gate: z
    .boolean()
    .optional()
    .describe(
      'Bypass the EOS PR merge gate (Layer 4b). Used in rare flows where the gate produces a false positive. Each override is logged in the handoff record for audit.'
    ),
  override_verify_coverage_gate: z
    .boolean()
    .optional()
    .describe(
      'Bypass the EOS verify-coverage gate (Layer 4c). The gate refuses status=done when a session touched a cross-boundary surface (mcp-tool, boot-config, fleet-artifact, config-canon) without recording any crane_verify rows. Pass true only when the gate is producing a false positive — each override is logged in the handoff record for audit.'
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

/** Resolve the active session, self-healing via executeSos if the cache is empty. */
async function resolveSession(
  input: HandoffInput
): Promise<{ session: ReturnType<typeof getSessionContext>; error?: HandoffResult }> {
  let session = getSessionContext()
  if (session) return { session }

  if (!process.env.CRANE_VENTURE_CODE) {
    return {
      session: null,
      error: {
        success: false,
        message:
          '[client] crane launcher env not detected (CRANE_VENTURE_CODE missing). ' +
          'Run inside the `crane <venture>` wrapper, not bare `claude`. Handoff not persisted.',
      },
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
      session: null,
      error: {
        success: false,
        message: `[client] Session recovery failed: ${reason}. Handoff not persisted. This is a client-side failure.`,
      },
    }
  }

  if (sosResult.status !== 'valid') {
    const reason = sosResult.message.split('\n')[0] || sosResult.status
    return {
      session: null,
      error: {
        success: false,
        message:
          `[client] Session recovery via crane_sos returned status="${sosResult.status}". ` +
          `Reason: ${reason}. Handoff not persisted. This is a client-side failure.`,
      },
    }
  }

  session = getSessionContext()
  if (!session) {
    return {
      session: null,
      error: {
        success: false,
        message:
          '[client] crane_sos reported success but session state is still null. ' +
          'Internal inconsistency; handoff not persisted.',
      },
    }
  }
  return { session }
}

interface PrGateState {
  overrideUsed: boolean
  blocked?: HandoffResult
}

/** Evaluate the PR-merge gate (Layer 4b). Returns override state and optional blocking result. */
function evaluatePrGate(input: HandoffInput): PrGateState {
  if (input.override_pr_merge_gate) {
    return { overrideUsed: true }
  }
  if (input.status !== 'done') {
    return { overrideUsed: false }
  }

  let gate
  try {
    gate = evaluatePrMergeGate()
  } catch (err) {
    console.warn('crane_handoff: PR-merge gate evaluation failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { overrideUsed: false }
  }

  if (gate?.should_block) {
    return {
      overrideUsed: false,
      blocked: {
        success: false,
        message:
          `[client] Handoff blocked by EOS PR-merge gate.\n\n` +
          `${gate.reason}\n\n` +
          `Branch: ${gate.branch ?? '(unknown)'}\n` +
          `Blocking PRs: ${gate.blocking_pr_numbers.join(', ')}\n\n` +
          `Options:\n` +
          `  1. Fix CI and merge the PR(s), then retry crane_handoff(status="done").\n` +
          `  2. Pass status="blocked" with the external blocker named, if merge truly cannot happen this session.\n` +
          `  3. Pass override_pr_merge_gate=true if the gate is producing a false positive (override is logged for audit).`,
      },
    }
  }
  return { overrideUsed: false }
}

interface VerifyGateState {
  overrideUsed: boolean
  reason: string | null
  surfaces: string[]
  count: number
  blocked?: HandoffResult
}

/** Evaluate the verify-coverage gate (Layer 4c). Returns gate state and optional blocking result. */
async function evaluateVerifyGate(
  input: HandoffInput,
  sessionId: string,
  api: CraneApi
): Promise<VerifyGateState> {
  if (input.override_verify_coverage_gate) {
    return { overrideUsed: true, reason: null, surfaces: [], count: 0 }
  }
  if (input.status !== 'done') {
    return { overrideUsed: false, reason: null, surfaces: [], count: 0 }
  }

  try {
    const repoRoot = process.cwd()
    const classifyScript = join(repoRoot, 'scripts', 'eos-gate-classify.mjs')
    const manifestPath = join(repoRoot, 'config', 'eos-gate-surfaces.json')

    if (!existsSync(classifyScript) || !existsSync(manifestPath)) {
      return { overrideUsed: false, reason: null, surfaces: [], count: 0 }
    }

    const verifyGate = await evaluateVerifyCoverageGate({
      repoRoot,
      classifyScript,
      manifestPath,
      sessionId,
      getSessionCount: (sid) => api.getVerifySessionCount(sid),
    })

    if (verifyGate.should_block) {
      return {
        overrideUsed: false,
        reason: verifyGate.reason,
        surfaces: verifyGate.surfaces_touched,
        count: verifyGate.verify_count,
        blocked: {
          success: false,
          message:
            `[client] Handoff blocked by EOS verify-coverage gate (Layer 4c).\n\n` +
            `${verifyGate.reason}\n\n` +
            `Surfaces touched: ${verifyGate.surfaces_touched.join(', ')}\n` +
            `Verifications recorded this session: ${verifyGate.verify_count}\n\n` +
            `Options:\n` +
            `  1. Run a verification with crane_verify (method:"fresh_process" / "live_state" / "vendor_docs"), then retry crane_handoff.\n` +
            `  2. Pass status="blocked" if the runtime claim genuinely cannot be verified this session.\n` +
            `  3. Pass override_verify_coverage_gate=true if the gate is producing a false positive (override is logged for audit). See docs/global/verify.md for guidance.`,
        },
      }
    }
    return {
      overrideUsed: false,
      reason: verifyGate.reason,
      surfaces: verifyGate.surfaces_touched,
      count: verifyGate.verify_count,
    }
  } catch (err) {
    console.warn('crane_handoff: verify-coverage gate evaluation failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { overrideUsed: false, reason: null, surfaces: [], count: 0 }
  }
}

// Types for resolveVenture result
interface VentureResolveResult {
  venture?: { code: string; name: string; org: string; repos: string[] }
  blocked?: HandoffResult
}

/** Resolve the venture from input override or current repo. */
async function resolveVenture(
  input: HandoffInput,
  api: CraneApi,
  repoInfo: { org: string; repo: string }
): Promise<VentureResolveResult> {
  let ventureList
  try {
    ventureList = await api.getVentures()
  } catch (error) {
    const detail =
      error instanceof ApiError
        ? error.toToolMessage()
        : error instanceof Error
          ? `Network error: ${error.message}`
          : `Unknown error: ${String(error)}`
    return { blocked: { success: false, message: `Failed to fetch ventures.\n${detail}` } }
  }

  const venture = input.venture
    ? ventureList.find((v) => v.code === input.venture)
    : findVentureByRepo(ventureList, repoInfo.org, repoInfo.repo)

  if (!venture) {
    const target = input.venture ? `venture code: ${input.venture}` : `org: ${repoInfo.org}`
    return { blocked: { success: false, message: `Unknown ${target}. Cannot create handoff.` } }
  }

  return { venture }
}

/** Post current-session activity to the server before closing. Best-effort. */
async function postSessionActivityEvents(api: CraneApi, craneSessionId: string): Promise<void> {
  try {
    const ccSessionId = getClientSessionId()
    if (!ccSessionId) return
    const path = jsonlPathFor(process.cwd(), ccSessionId)
    const events = extractActivityEvents(path)
    if (events.length > 0) {
      await api.postSessionActivity(
        craneSessionId,
        events.map((ts) => ({ ts })),
        'cc_jsonl'
      )
    }
  } catch (err) {
    console.warn('crane_eos: current-session activity post failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

interface HandoffSubmitParams {
  venture: { code: string; name: string; org: string; repos: string[] }
  handoffRepo: string
  sessionId: string
  input: HandoffInput
  prGate: PrGateState
  verifyGate: VerifyGateState
}

async function buildAndSubmitHandoff(p: HandoffSubmitParams): Promise<HandoffResult> {
  let lastActivityAt: string | undefined
  try {
    lastActivityAt = (await getLastActivityTimestamp()) ?? undefined
  } catch {
    // Non-fatal: fall back to current behavior (ended_at = now)
  }

  const keepSessionOpen = p.input.final === false
  await postSessionActivityEvents(
    new CraneApi(process.env.CRANE_CONTEXT_KEY!, getApiBase()),
    p.sessionId
  )

  try {
    const api = new CraneApi(process.env.CRANE_CONTEXT_KEY!, getApiBase())
    await api.createHandoff({
      venture: p.venture.code,
      repo: p.handoffRepo,
      agent: getAgentId(),
      summary: p.input.summary,
      status: p.input.status,
      session_id: p.sessionId,
      issue_number: p.input.issue_number,
      last_activity_at: lastActivityAt,
      keep_session_open: keepSessionOpen,
    })
  } catch (error) {
    const detail =
      error instanceof ApiError
        ? error.toToolMessage(getAgentId())
        : error instanceof Error
          ? `Network error: ${error.message}`
          : `Unknown error: ${String(error)}`
    return { success: false, message: `Failed to create handoff.\n${detail}` }
  }

  let verifyCoverageBlock = ''
  if (p.verifyGate.overrideUsed) {
    verifyCoverageBlock = `EOS verify-coverage gate: OVERRIDDEN\n`
  } else if (p.verifyGate.reason) {
    const tag = p.verifyGate.surfaces.length ? ` [${p.verifyGate.surfaces.join(', ')}]` : ''
    verifyCoverageBlock = `Verification coverage: ${p.verifyGate.count} recorded${tag} — ${p.verifyGate.reason}\n`
  }

  return {
    success: true,
    message:
      `Handoff created.\n\n` +
      `Venture: ${p.venture.name}\n` +
      `Status: ${p.input.status}\n` +
      `Session: ${p.sessionId}${keepSessionOpen ? ' (still active for additional per-venture handoffs)' : ''}\n` +
      (p.input.issue_number ? `Issue: #${p.input.issue_number}\n` : '') +
      (p.prGate.overrideUsed ? `EOS PR-merge gate: OVERRIDDEN\n` : '') +
      verifyCoverageBlock +
      `\nSummary:\n${p.input.summary}`,
  }
}

export async function executeHandoff(input: HandoffInput): Promise<HandoffResult> {
  if (!process.env.CRANE_CONTEXT_KEY) {
    return { success: false, message: 'CRANE_CONTEXT_KEY not found. Cannot create handoff.' }
  }

  const { session, error: sessionError } = await resolveSession(input)
  if (sessionError) return sessionError
  if (!session) {
    return { success: false, message: '[client] Session resolution failed unexpectedly.' }
  }

  const repoInfo = getCurrentRepoInfo()
  if (!repoInfo) {
    return { success: false, message: 'Not in a git repository. Cannot create handoff.' }
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

  const api = new CraneApi(process.env.CRANE_CONTEXT_KEY, getApiBase())
  const { venture, blocked: venturBlocked } = await resolveVenture(input, api, repoInfo)
  if (venturBlocked) return venturBlocked
  if (!venture) return { success: false, message: 'Venture resolution failed unexpectedly.' }

  const prGate = evaluatePrGate(input)
  if (prGate.blocked) return prGate.blocked

  const verifyGate = await evaluateVerifyGate(input, session.sessionId, api)
  if (verifyGate.blocked) return verifyGate.blocked

  const handoffRepo =
    input.venture && venture.repos.length > 0 ? `${venture.org}/${venture.repos[0]}` : currentRepo

  return buildAndSubmitHandoff({
    venture,
    handoffRepo,
    sessionId: session.sessionId,
    input,
    prGate,
    verifyGate,
  })
}
