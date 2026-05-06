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

  // ---------------------------------------------------------------------------
  // Layer 4b: PR-merge gate. Block status=done if any open PR from this session
  // has failing CI. Catches the failure mode in feedback_finish_means_merged.md
  // (agents declaring "shipped" while PRs are stuck open with red CI).
  //
  // Best-effort: if the gate cannot evaluate (no gh CLI, network failure, etc.)
  // it returns should_block=false, never failing closed on its own infra.
  //
  // Bypass: status=blocked is always allowed (the agent is explicitly handing
  // off red CI as the next-session task). status=in_progress is allowed too —
  // gate only fires on status=done. For rare false-positive cases, the
  // override_pr_merge_gate flag bypasses with the override logged on the handoff.
  // ---------------------------------------------------------------------------
  let prGateOverrideUsed = false
  if (input.status === 'done' && !input.override_pr_merge_gate) {
    // Wrap in try/catch: gate is best-effort. If it crashes (gh CLI missing,
    // network glitch, etc.), the gate logs and proceeds rather than failing
    // closed on its own infrastructure.
    let gate
    try {
      gate = evaluatePrMergeGate()
    } catch (err) {
      console.warn('crane_handoff: PR-merge gate evaluation failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      })
      gate = undefined
    }
    if (gate?.should_block) {
      return {
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
      }
    }
  } else if (input.override_pr_merge_gate) {
    prGateOverrideUsed = true
  }

  // ---------------------------------------------------------------------------
  // Layer 4c: verify-coverage gate. Block status=done if the diff vs origin/main
  // touches a cross-boundary surface class (mcp-tool, boot-config,
  // fleet-artifact, config-canon) without any crane_verify rows for the session.
  //
  // The gate runs AFTER Layer 4b — there's no point gating verifications when
  // CI is already red. Like 4b, it's best-effort: any infrastructure failure
  // (no gh/git, classifier missing, ledger lookup error) returns
  // should_block=false rather than failing closed.
  //
  // Override: pass override_verify_coverage_gate=true. The override is recorded
  // on the handoff for audit (mirror Layer 4b override behavior).
  // ---------------------------------------------------------------------------
  let verifyCoverageOverrideUsed = false
  let verifyCoverageReason: string | null = null
  let verifyCoverageSurfaces: string[] = []
  let verifyCoverageCount = 0
  if (input.status === 'done' && !input.override_verify_coverage_gate) {
    try {
      const repoRoot = process.cwd()
      const classifyScript = join(repoRoot, 'scripts', 'eos-gate-classify.mjs')
      const manifestPath = join(repoRoot, 'config', 'eos-gate-surfaces.json')

      if (existsSync(classifyScript) && existsSync(manifestPath)) {
        const verifyGate = await evaluateVerifyCoverageGate({
          repoRoot,
          classifyScript,
          manifestPath,
          sessionId: session.sessionId,
          getSessionCount: (sid) => api.getVerifySessionCount(sid),
        })
        verifyCoverageReason = verifyGate.reason
        verifyCoverageSurfaces = verifyGate.surfaces_touched
        verifyCoverageCount = verifyGate.verify_count

        if (verifyGate.should_block) {
          return {
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
          }
        }
      }
    } catch (err) {
      console.warn('crane_handoff: verify-coverage gate evaluation failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  } else if (input.override_verify_coverage_gate) {
    verifyCoverageOverrideUsed = true
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

    // Default: end the session on this call (single-handoff flow).
    // Multi-venture flows pass `final: false` for ventures 1..N-1 to keep
    // the session active so subsequent handoffs don't 409 with
    // "Session is not active".
    const keepSessionOpen = input.final === false

    // Best-effort: post current-session activity ranges from JSONL BEFORE the
    // handoff/eos call, so the server's session-window validation
    // (created_at <= ts <= ended_at) still passes — once the session is
    // closed, ended_at = NOW and any later assistant tool-uses would 422.
    // Errors are swallowed; primary /eos flow must not block on this.
    try {
      const ccSessionId = getClientSessionId()
      if (ccSessionId) {
        const path = jsonlPathFor(process.cwd(), ccSessionId)
        const events = extractActivityEvents(path)
        if (events.length > 0) {
          await api.postSessionActivity(
            session.sessionId,
            events.map((ts) => ({ ts })),
            'cc_jsonl'
          )
        }
      }
    } catch (err) {
      console.warn('crane_eos: current-session activity post failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      })
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
      keep_session_open: keepSessionOpen,
    })

    // Verify-coverage block (Layer 4c). Surfaced even on the pass-through path
    // so the Captain can see the gate's read of the session at handoff time.
    let verifyCoverageBlock = ''
    if (verifyCoverageOverrideUsed) {
      verifyCoverageBlock = `EOS verify-coverage gate: OVERRIDDEN\n`
    } else if (verifyCoverageReason) {
      const surfacesTag = verifyCoverageSurfaces.length
        ? ` [${verifyCoverageSurfaces.join(', ')}]`
        : ''
      verifyCoverageBlock = `Verification coverage: ${verifyCoverageCount} recorded${surfacesTag} — ${verifyCoverageReason}\n`
    }

    return {
      success: true,
      message:
        `Handoff created.\n\n` +
        `Venture: ${venture.name}\n` +
        `Status: ${input.status}\n` +
        `Session: ${session.sessionId}${keepSessionOpen ? ' (still active for additional per-venture handoffs)' : ''}\n` +
        (input.issue_number ? `Issue: #${input.issue_number}\n` : '') +
        (prGateOverrideUsed ? `EOS PR-merge gate: OVERRIDDEN\n` : '') +
        verifyCoverageBlock +
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
