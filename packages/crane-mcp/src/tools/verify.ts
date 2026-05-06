/**
 * crane_verify / crane_claim_origin tools — verification ledger surface.
 *
 * crane_verify: Record a verification artifact. The agent runs the actual
 *   verification with whatever tool fits (Bash, Context7, gh api, wrangler)
 *   and submits the captured output here for ledgering. PR 2 gates check
 *   for these records; PR 3 audits sample them and re-run the captured
 *   command for integrity.
 *
 * crane_claim_origin: Look up prior verifications that touched a file path.
 *   Used by PR 3's regression auto-attach flow.
 *
 * Design: ledger writer, not executor. Agents already have execution surface
 * (Bash); the value here is the structured cross-session record + integrity
 * bindings (output_hash, command_hash) that make claim↔output re-checkable.
 *
 * Best-effort telemetry — failure returns { success: false, message } and
 * never throws, mirroring memory_invoke. The agent's work continues even
 * if the ledger write fails.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import type {
  ClaimOriginEntry,
  VerifyMethod,
  VerifySource,
  VerifyToolUsed,
  VerifyTruncation,
} from '../lib/crane-api.js'

// ============================================================================
// Constants — kept in sync with workers/crane-context/src/constants.ts
// ============================================================================

const VERIFY_METHODS = ['live_state', 'fresh_process', 'vendor_docs'] as const
const VERIFY_SOURCES = ['manual', 'tool', 'hook'] as const
const VERIFY_TOOLS_USED = [
  'Bash',
  'Context7',
  'WebFetch',
  'gh_api',
  'wrangler',
  'vendor_mcp',
  'other',
] as const
const VERIFY_TRUNCATIONS = ['none', 'head', 'tail', 'head_tail'] as const

const MAX_VERIFY_OUTPUT_BYTES = 8 * 1024
const MAX_VERIFY_CLAIM_CHARS = 300
const VERIFY_VENDOR_DOCS_MIN_OUTPUT = 100
const VERIFY_ORIGIN_LIMIT_CAP = 50

// ============================================================================
// crane_verify
// ============================================================================

/**
 * Base shape (no refinements). Refinements applied via .superRefine below
 * so multiple integrity bindings can fire with field-specific error paths.
 */
const verifyBaseSchema = z.object({
  method: z.enum(VERIFY_METHODS).describe('Verification method category'),
  claim: z
    .string()
    .min(1)
    .max(MAX_VERIFY_CLAIM_CHARS)
    .describe(
      `What is supposedly true after this verification (max ${MAX_VERIFY_CLAIM_CHARS} chars)`
    ),
  output: z
    .string()
    .describe(
      `Literal output captured by the agent (max ${MAX_VERIFY_OUTPUT_BYTES} bytes; oversize must use head_tail convention)`
    ),
  tool_used: z
    .enum(VERIFY_TOOLS_USED)
    .describe(
      'Which tool the agent used to capture output (enum forces audit-grouping; pick "other" only if none fit)'
    ),
  command: z
    .string()
    .optional()
    .describe('Command/query that produced output. REQUIRED for fresh_process and live_state.'),
  files_touched: z
    .array(z.string())
    .optional()
    .describe('File paths this verification relates to (used by claim_origin lookup)'),
  fresh_runtime: z
    .boolean()
    .optional()
    .describe('Did output come from a fresh process? PR 2 gate reads this.'),
  fresh_runtime_justification: z
    .string()
    .optional()
    .describe('Required by PR 2 gate when fresh_runtime is false on a runtime-config claim.'),
  output_truncation: z
    .enum(VERIFY_TRUNCATIONS)
    .optional()
    .describe('Set to head_tail when applying truncation convention for oversize output.'),
  source: z
    .enum(VERIFY_SOURCES)
    .optional()
    .describe('Defaults to "tool". Use "manual" for Captain-initiated records.'),
  session_id: z.string().optional().describe('Current session ID if known'),
})

export const verifyInputSchema = verifyBaseSchema.superRefine((data, ctx) => {
  // Integrity binding 1: fresh_process and live_state require command —
  // a record without command is unrecheckable, defeating the audit story.
  if ((data.method === 'fresh_process' || data.method === 'live_state') && !data.command) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['command'],
      message: `command is required for method=${data.method} (PR 3 audit re-runs it for integrity)`,
    })
  }

  // Integrity binding 2: vendor_docs requires non-trivial output.
  if (data.method === 'vendor_docs' && data.output.length < VERIFY_VENDOR_DOCS_MIN_OUTPUT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['output'],
      message: `vendor_docs requires output.length >= ${VERIFY_VENDOR_DOCS_MIN_OUTPUT}; paste the actual doc excerpt`,
    })
  }

  // Reject oversize output explicitly with head_tail guidance.
  if (Buffer.byteLength(data.output, 'utf8') > MAX_VERIFY_OUTPUT_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['output'],
      message: `output exceeds ${MAX_VERIFY_OUTPUT_BYTES} bytes; capture command + apply head_tail (first 4KB + "\\n...[truncated]...\\n" + last 4KB) and set output_truncation:"head_tail"`,
    })
  }
})

export type VerifyInput = z.infer<typeof verifyInputSchema>

export interface VerifyResult {
  success: boolean
  message: string
  verify_id?: string
  redacted?: boolean
}

export async function executeVerify(input: VerifyInput): Promise<VerifyResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'Warning: CRANE_CONTEXT_KEY not set — verification not recorded.',
    }
  }

  const venture = process.env.CRANE_VENTURE_CODE
  const repo = process.env.CRANE_REPO

  try {
    const api = new CraneApi(apiKey, getApiBase())
    const record = await api.recordVerification({
      method: input.method as VerifyMethod,
      claim: input.claim,
      output: input.output,
      tool_used: input.tool_used as VerifyToolUsed,
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(input.files_touched ? { files_touched: input.files_touched } : {}),
      ...(input.fresh_runtime !== undefined ? { fresh_runtime: input.fresh_runtime } : {}),
      ...(input.fresh_runtime_justification !== undefined
        ? { fresh_runtime_justification: input.fresh_runtime_justification }
        : {}),
      ...(input.output_truncation
        ? { output_truncation: input.output_truncation as VerifyTruncation }
        : {}),
      ...(input.source ? { source: input.source as VerifySource } : { source: 'tool' as const }),
      ...(input.session_id ? { session_id: input.session_id } : {}),
      ...(venture ? { venture } : {}),
      ...(repo ? { repo } : {}),
    })

    const redactedNote = record.redacted ? ' (output had secrets masked before storage)' : ''
    return {
      success: true,
      message: `Verification recorded: ${record.id}${redactedNote}`,
      verify_id: record.id,
      redacted: record.redacted,
    }
  } catch (error) {
    // Best-effort: never block agent work on telemetry failure.
    const reason = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Warning: Failed to record verification — ${reason}`,
    }
  }
}

// ============================================================================
// crane_claim_origin
// ============================================================================

export const claimOriginInputSchema = z.object({
  file: z.string().describe('File path to look up prior claims for'),
  since: z
    .string()
    .optional()
    .describe('Lookback window: ISO date OR relative format like "30d"/"90d". Default: 90d.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(VERIFY_ORIGIN_LIMIT_CAP)
    .optional()
    .describe(`Max results, hard-capped at ${VERIFY_ORIGIN_LIMIT_CAP}.`),
})

export type ClaimOriginInput = z.infer<typeof claimOriginInputSchema>

export interface ClaimOriginResult {
  success: boolean
  message: string
}

function formatClaimOrigin(file: string, since: string, claims: ClaimOriginEntry[]): string {
  if (claims.length === 0) {
    return `No prior claims for **${file}** since ${since.split('T')[0]}.`
  }

  const lines: string[] = [
    `**Prior claims for \`${file}\`** since ${since.split('T')[0]} (${claims.length}):\n`,
  ]
  for (const c of claims) {
    const sessTag = c.session_id ? ` · sess=${c.session_id}` : ''
    const dateTag = c.ts.split('T')[0]
    lines.push(`- ${dateTag} · **${c.method}**${sessTag}`)
    lines.push(`  - claim: ${c.claim}`)
    lines.push(`  - verify_id: \`${c.verify_id}\``)
    if (c.files_touched.length > 1) {
      lines.push(`  - also touched: ${c.files_touched.filter((f) => f !== file).join(', ')}`)
    }
  }
  return lines.join('\n')
}

export async function executeClaimOrigin(input: ClaimOriginInput): Promise<ClaimOriginResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot query claim origin.',
    }
  }

  try {
    const api = new CraneApi(apiKey, getApiBase())
    const result = await api.getClaimOrigin({
      file: input.file,
      ...(input.since ? { since: input.since } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })

    return {
      success: true,
      message: formatClaimOrigin(input.file, result.since, result.claims),
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to query claim origin: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
