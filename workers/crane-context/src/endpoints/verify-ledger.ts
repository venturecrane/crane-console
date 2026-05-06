/**
 * Crane Context Worker - Verify Ledger Endpoints
 *
 * POST /verify          — record a verification artifact (the claim, what
 *                         tool produced what output, with integrity hashes
 *                         so PR 3 audit can re-run the command).
 *
 * GET  /verify/origin   — look up prior verifications that touched a given
 *                         file path. Used by PR 3's regression auto-attach
 *                         flow to surface the originating session/claim.
 *
 * Design: ledger writer, not executor. The agent runs the verification
 * with whatever tool fits (Bash, Context7, gh api, wrangler) and submits
 * the captured output here. The worker scrubs secrets, hashes pre-scrub
 * output for integrity, and persists. Mirrored on memory-invocations.ts.
 */

import type { Env } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  payloadTooLargeResponse,
  sha256,
  sizeInBytes,
} from '../utils'
import {
  HTTP_STATUS,
  ID_PREFIXES,
  MAX_VERIFY_OUTPUT_BYTES,
  MAX_VERIFY_CLAIM_CHARS,
  VERIFY_METHODS,
  VERIFY_SOURCES,
  VERIFY_TOOLS_USED,
  VERIFY_TRUNCATIONS,
  VERIFY_VENDOR_DOCS_MIN_OUTPUT,
  VERIFY_ORIGIN_LIMIT_CAP,
  type VerifyMethod,
  type VerifySource,
  type VerifyToolUsed,
  type VerifyTruncation,
} from '../constants'
import { scrubSecrets } from '../lib/scrub'
import { ulid } from 'ulidx'

// ============================================================================
// Types
// ============================================================================

interface RecordVerificationBody {
  method: VerifyMethod
  claim: string
  output: string
  tool_used: VerifyToolUsed
  command?: string
  files_touched?: string[]
  fresh_runtime?: boolean
  fresh_runtime_justification?: string
  output_truncation?: VerifyTruncation
  source?: VerifySource
  session_id?: string
  venture?: string
  repo?: string
}

interface ClaimRecord {
  verify_id: string
  session_id: string | null
  claim: string
  method: VerifyMethod
  ts: string
  files_touched: string[]
}

// ============================================================================
// POST /verify — Record a Verification
// ============================================================================

export async function handleRecordVerification(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  let body: RecordVerificationBody
  try {
    body = (await request.json()) as RecordVerificationBody
  } catch {
    return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST, context.correlationId)
  }

  // ---- Mechanical validation (mirrors Zod refinements in MCP layer) ----

  if (!body.method || !VERIFY_METHODS.includes(body.method)) {
    return validationErrorResponse(
      [{ field: 'method', message: `Must be one of: ${VERIFY_METHODS.join(', ')}` }],
      context.correlationId
    )
  }

  if (!body.tool_used || !VERIFY_TOOLS_USED.includes(body.tool_used)) {
    return validationErrorResponse(
      [{ field: 'tool_used', message: `Must be one of: ${VERIFY_TOOLS_USED.join(', ')}` }],
      context.correlationId
    )
  }

  if (typeof body.claim !== 'string' || body.claim.length === 0) {
    return validationErrorResponse(
      [{ field: 'claim', message: 'Required non-empty string' }],
      context.correlationId
    )
  }
  if (body.claim.length > MAX_VERIFY_CLAIM_CHARS) {
    return validationErrorResponse(
      [
        {
          field: 'claim',
          message: `claim exceeds ${MAX_VERIFY_CLAIM_CHARS} chars; trim to a one-line statement of what is supposedly true`,
        },
      ],
      context.correlationId
    )
  }

  if (typeof body.output !== 'string') {
    return validationErrorResponse(
      [{ field: 'output', message: 'Required string field' }],
      context.correlationId
    )
  }

  // Reject oversize output explicitly with head_tail guidance — never
  // silently truncate, since silent truncation produces a ledger row
  // that lies about what was observed.
  if (sizeInBytes(body.output) > MAX_VERIFY_OUTPUT_BYTES) {
    return payloadTooLargeResponse(
      `output exceeds ${MAX_VERIFY_OUTPUT_BYTES} bytes; capture the command + apply head_tail truncation (first 4KB + "\\n...[truncated]...\\n" + last 4KB) and set output_truncation:"head_tail"`,
      context.correlationId
    )
  }

  // Integrity binding 1: fresh_process and live_state require command —
  // a record without command is an unrechecked claim, the exact pattern
  // PR 3 audit needs to re-run for mismatch detection.
  if ((body.method === 'fresh_process' || body.method === 'live_state') && !body.command) {
    return validationErrorResponse(
      [
        {
          field: 'command',
          message: `command is required for method=${body.method} (PR 3 audit re-runs it for integrity)`,
        },
      ],
      context.correlationId
    )
  }

  // Integrity binding 2: vendor_docs requires non-trivial output. A
  // trivially-empty "I read the docs" record has nothing to attach to
  // when PR 3 surfaces it on a regression.
  if (body.method === 'vendor_docs' && body.output.length < VERIFY_VENDOR_DOCS_MIN_OUTPUT) {
    return validationErrorResponse(
      [
        {
          field: 'output',
          message: `vendor_docs requires output.length >= ${VERIFY_VENDOR_DOCS_MIN_OUTPUT}; paste the actual doc excerpt`,
        },
      ],
      context.correlationId
    )
  }

  if (body.output_truncation && !VERIFY_TRUNCATIONS.includes(body.output_truncation)) {
    return validationErrorResponse(
      [
        {
          field: 'output_truncation',
          message: `Must be one of: ${VERIFY_TRUNCATIONS.join(', ')}`,
        },
      ],
      context.correlationId
    )
  }

  if (body.source && !VERIFY_SOURCES.includes(body.source)) {
    return validationErrorResponse(
      [{ field: 'source', message: `Must be one of: ${VERIFY_SOURCES.join(', ')}` }],
      context.correlationId
    )
  }

  if (body.files_touched && !Array.isArray(body.files_touched)) {
    return validationErrorResponse(
      [{ field: 'files_touched', message: 'Must be an array of strings' }],
      context.correlationId
    )
  }

  // ---- Compute integrity hashes BEFORE scrubbing ----

  const outputHash = await sha256(body.output)
  const commandHash = body.command ? await sha256(body.command) : null

  // ---- Scrub secrets from output before persistence ----

  const { scrubbed, redacted } = scrubSecrets(body.output)

  const id = `${ID_PREFIXES.VERIFY}${ulid()}`
  const source: VerifySource = body.source ?? 'tool'
  const truncation: VerifyTruncation = body.output_truncation ?? 'none'
  const filesTouched = (body.files_touched ?? []).filter(
    (f) => typeof f === 'string' && f.length > 0
  )

  // ---- Atomic write: ledger row + per-file rows ----

  try {
    const stmts = [
      env.DB.prepare(
        `INSERT INTO verify_ledger
           (id, session_id, venture, repo, method, source, claim,
            output_scrubbed, output_hash, output_redacted, output_truncation,
            tool_used, command, command_hash,
            fresh_runtime, fresh_runtime_justification, actor_key_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        body.session_id ?? null,
        body.venture ?? null,
        body.repo ?? null,
        body.method,
        source,
        body.claim,
        scrubbed,
        outputHash,
        redacted ? 1 : 0,
        truncation,
        body.tool_used,
        body.command ?? null,
        commandHash,
        body.fresh_runtime === undefined ? null : body.fresh_runtime ? 1 : 0,
        body.fresh_runtime_justification ?? null,
        context.actorKeyId
      ),
      ...filesTouched.map((path) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO verify_files (verify_id, file_path) VALUES (?, ?)`
        ).bind(id, path)
      ),
    ]

    await env.DB.batch(stmts)

    return jsonResponse(
      {
        verify: {
          id,
          method: body.method,
          source,
          redacted,
          output_truncation: truncation,
          files_touched: filesTouched,
        },
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.CREATED,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /verify error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /verify/origin?file=...&since=30d&limit=50 — Claim Origin Lookup
// ============================================================================

export async function handleGetVerificationOrigin(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  const url = new URL(request.url)
  const file = url.searchParams.get('file')
  const sinceParam = url.searchParams.get('since') ?? '90d'
  const limitParam = url.searchParams.get('limit')

  if (!file) {
    return validationErrorResponse(
      [{ field: 'file', message: 'Required query parameter' }],
      context.correlationId
    )
  }

  const sinceDate = resolveSinceParam(sinceParam)
  if (!sinceDate) {
    return validationErrorResponse(
      [{ field: 'since', message: 'Must be ISO date string or relative format like "30d"' }],
      context.correlationId
    )
  }

  let limit = VERIFY_ORIGIN_LIMIT_CAP
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return validationErrorResponse(
        [{ field: 'limit', message: 'Must be a positive integer' }],
        context.correlationId
      )
    }
    limit = Math.min(parsed, VERIFY_ORIGIN_LIMIT_CAP)
  }

  try {
    // GROUP_CONCAT pulls all files_touched per ledger row in one query
    // so the response can include the full file set without a fan-out.
    // Sentinel '|' is used because file paths can contain commas; '|' is
    // less likely (would be quoted/escaped in a real path).
    const result = await env.DB.prepare(
      `SELECT vl.id          AS verify_id,
              vl.session_id  AS session_id,
              vl.claim       AS claim,
              vl.method      AS method,
              vl.created_at  AS ts,
              GROUP_CONCAT(DISTINCT vf2.file_path) AS files_concat
       FROM verify_files vf
       JOIN verify_ledger vl ON vl.id = vf.verify_id
       LEFT JOIN verify_files vf2 ON vf2.verify_id = vl.id
       WHERE vf.file_path = ?
         AND vl.created_at >= ?
       GROUP BY vl.id
       ORDER BY vl.created_at DESC
       LIMIT ?`
    )
      .bind(file, sinceDate, limit)
      .all<{
        verify_id: string
        session_id: string | null
        claim: string
        method: VerifyMethod
        ts: string
        files_concat: string | null
      }>()

    const claims: ClaimRecord[] = (result.results ?? []).map((row) => ({
      verify_id: row.verify_id,
      session_id: row.session_id,
      claim: row.claim,
      method: row.method,
      ts: row.ts,
      files_touched: row.files_concat ? row.files_concat.split(',').filter(Boolean) : [],
    }))

    return jsonResponse(
      {
        file,
        since: sinceDate,
        limit,
        claims,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /verify/origin error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /verify/session-count?session_id=... — SOS one-liner support
// ============================================================================

export async function handleGetVerificationSessionCount(
  request: Request,
  env: Env
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session_id')

  if (!sessionId) {
    return validationErrorResponse(
      [{ field: 'session_id', message: 'Required query parameter' }],
      context.correlationId
    )
  }

  try {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM verify_ledger WHERE session_id = ?`)
      .bind(sessionId)
      .first<{ n: number }>()

    return jsonResponse(
      {
        session_id: sessionId,
        count: row?.n ?? 0,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /verify/session-count error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

function resolveSinceParam(sinceParam: string): string | null {
  const relativeMatch = sinceParam.match(/^(\d+)d$/)
  if (relativeMatch) {
    const days = parseInt(relativeMatch[1], 10)
    if (!Number.isFinite(days) || days < 0) return null
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }
  const parsed = new Date(sinceParam)
  if (isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString()
}
