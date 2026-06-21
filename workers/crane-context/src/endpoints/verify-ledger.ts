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
} from '../utils'
import {
  HTTP_STATUS,
  ID_PREFIXES,
  VERIFY_ORIGIN_LIMIT_CAP,
  VERIFY_LOOKUP_MAX_IDS,
  VERIFY_ID_REGEX,
  type VerifyMethod,
} from '../constants'
import { scrubSecrets } from '../lib/scrub'
import { ulid } from 'ulidx'
import { parseAndValidateRecordBody, type RecordVerificationBody } from './verify-ledger/validation'
import { writeLedgerRow } from './verify-ledger/db'

// ============================================================================
// Types (local to this module)
// ============================================================================

interface ClaimRecord {
  verify_id: string
  session_id: string | null
  claim: string
  method: VerifyMethod
  ts: string
  files_touched: string[]
}

/**
 * Detailed verification record used by the relevance+aliveness gates
 * (Layer 4c and PR-CI). `output_nonempty` is the server-computed aliveness
 * fact — whether the captured output actually demonstrates the seam carried
 * data (vs. a stub `[]`/`{}`/`null`/empty). The gate owns the *policy*
 * (which methods count, intersection with changed surface files); the worker
 * owns this single content fact so all callers agree on "alive".
 */
interface VerificationDetail {
  id: string
  method: VerifyMethod
  files_touched: string[]
  output_nonempty: boolean
}

// ============================================================================
// POST /verify — Record a Verification
// ============================================================================

export async function handleRecordVerification(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  const parsed = await parseAndValidateRecordBody(request)
  if ('error' in parsed) {
    const { error, parseError } = parsed as { error: unknown; parseError?: boolean }
    if (parseError) {
      return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST, context.correlationId)
    }
    const err = error as { kind?: string; message: string; field?: string }
    if (err.kind === 'payload_too_large') {
      return payloadTooLargeResponse(err.message, context.correlationId)
    }
    return validationErrorResponse(
      [err as { field: string; message: string }],
      context.correlationId
    )
  }

  const { body } = parsed
  try {
    const responsePayload = await buildAndPersistVerification(env, body, context.actorKeyId)
    return jsonResponse(
      { ...responsePayload, correlation_id: context.correlationId },
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

async function buildAndPersistVerification(
  env: Env,
  body: RecordVerificationBody,
  actorKeyId: string
) {
  // Compute integrity hashes BEFORE scrubbing
  const outputHash = await sha256(body.output)
  const commandHash = body.command ? await sha256(body.command) : null

  // Scrub secrets from output before persistence
  const { scrubbed, redacted } = scrubSecrets(body.output)

  const id = `${ID_PREFIXES.VERIFY}${ulid()}`
  const source = body.source ?? 'tool'
  const truncation = body.output_truncation ?? 'none'
  const filesTouched = (body.files_touched ?? []).filter(
    (f) => typeof f === 'string' && f.length > 0
  )

  await writeLedgerRow(env, filesTouched, {
    id,
    sessionId: body.session_id ?? null,
    venture: body.venture ?? null,
    repo: body.repo ?? null,
    method: body.method,
    source,
    claim: body.claim,
    outputScrubbed: scrubbed,
    outputHash,
    outputRedacted: redacted,
    outputTruncation: truncation,
    toolUsed: body.tool_used,
    command: body.command ?? null,
    commandHash,
    freshRuntime: body.fresh_runtime,
    freshRuntimeJustification: body.fresh_runtime_justification ?? null,
    actorKeyId,
  })

  return {
    verify: {
      id,
      method: body.method,
      source,
      redacted,
      output_truncation: truncation,
      files_touched: filesTouched,
    },
  }
}

// ============================================================================
// GET /verify/origin?file=...&since=30d&limit=50 — Claim Origin Lookup
// ============================================================================

export async function handleGetVerificationOrigin(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

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

  const limitResult = resolveLimit(limitParam)
  if (typeof limitResult === 'object') {
    return validationErrorResponse([limitResult], context.correlationId)
  }

  try {
    const claims = await queryOriginClaims(env, file, sinceDate, limitResult)
    return jsonResponse(
      { file, since: sinceDate, limit: limitResult, claims, correlation_id: context.correlationId },
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
  if (isResponse(context)) return context

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
      { session_id: sessionId, count: row?.n ?? 0, correlation_id: context.correlationId },
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
// GET /verify/lookup?ids=vfy_x,vfy_y — Batch ID Existence Check
// ============================================================================
//
// Used by PR-CI's pr-verify-check.mjs to confirm vfy_ IDs listed in a PR
// body actually exist in the ledger. Read-only over verify_ledger; no
// schema migration. Caller is responsible for not exceeding the batch
// cap (mirrored client-side in scripts/pr-verify-check.mjs).

export async function handleVerifyLookup(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids')

  if (!idsParam) {
    return validationErrorResponse(
      [{ field: 'ids', message: 'Required query parameter (comma-separated vfy_ IDs)' }],
      context.correlationId
    )
  }

  const idsResult = parseAndValidateIds(idsParam)
  if (!Array.isArray(idsResult)) {
    return validationErrorResponse([idsResult], context.correlationId)
  }

  try {
    const details = await lookupIdsDetailed(env, idsResult)
    // `exists` retained for back-compat with older pr-verify-check.mjs builds.
    const exists: Record<string, boolean> = {}
    const records: Record<string, Omit<VerificationDetail, 'id'>> = {}
    for (const id of idsResult) {
      const d = details.get(id)
      exists[id] = d !== undefined
      if (d) {
        records[id] = {
          method: d.method,
          files_touched: d.files_touched,
          output_nonempty: d.output_nonempty,
        }
      }
    }
    return jsonResponse(
      { exists, records, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /verify/lookup error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /verify/session-verifications?session_id=... — relevance+aliveness gate
// ============================================================================
//
// Returns one record per verify_ledger row for the session, each carrying the
// method, the files it touched, and the server-computed `output_nonempty`
// aliveness fact. The EOS-time Layer 4c gate (verify-coverage-gate.ts) uses
// this to decide whether a session has at least one verification that both
// names a changed surface seam AND proves it carried data. Successor to
// /verify/session-count (which only answered "any rows at all?").

export async function handleGetSessionVerifications(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) return context

  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session_id')

  if (!sessionId) {
    return validationErrorResponse(
      [{ field: 'session_id', message: 'Required query parameter' }],
      context.correlationId
    )
  }

  try {
    const verifications = await querySessionVerifications(env, sessionId)
    return jsonResponse(
      { session_id: sessionId, verifications, correlation_id: context.correlationId },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /verify/session-verifications error:', error)
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
  if (isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

/** Returns resolved limit (number) or a ValidationError object. */
function resolveLimit(limitParam: string | null): number | { field: string; message: string } {
  if (!limitParam) return VERIFY_ORIGIN_LIMIT_CAP
  const parsed = parseInt(limitParam, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return { field: 'limit', message: 'Must be a positive integer' }
  }
  return Math.min(parsed, VERIFY_ORIGIN_LIMIT_CAP)
}

/** Returns parsed, de-duped IDs array or a ValidationError. */
function parseAndValidateIds(idsParam: string): string[] | { field: string; message: string } {
  const rawIds = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const ids = Array.from(new Set(rawIds))

  if (ids.length === 0) {
    return { field: 'ids', message: 'At least one ID required' }
  }
  if (ids.length > VERIFY_LOOKUP_MAX_IDS) {
    return {
      field: 'ids',
      message: `Maximum ${VERIFY_LOOKUP_MAX_IDS} IDs per call (received ${ids.length})`,
    }
  }
  for (const id of ids) {
    if (!VERIFY_ID_REGEX.test(id)) {
      return {
        field: 'ids',
        message: `Invalid ID format: ${id}. Expected vfy_ + 26-char Crockford ULID.`,
      }
    }
  }
  return ids
}

async function queryOriginClaims(
  env: Env,
  file: string,
  sinceDate: string,
  limit: number
): Promise<ClaimRecord[]> {
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

  return (result.results ?? []).map((row) => ({
    verify_id: row.verify_id,
    session_id: row.session_id,
    claim: row.claim,
    method: row.method,
    ts: row.ts,
    files_touched: row.files_concat ? row.files_concat.split(',').filter(Boolean) : [],
  }))
}

/**
 * Trimmed-output values that mean "the seam produced nothing" — a stub or
 * empty result, not proof of wiring. Kept conservative: exact-match on the
 * whole trimmed output so we never reject a large body that merely *mentions*
 * an empty token. Structural emptiness (parses to [], {}, null) is handled
 * separately via JSON.parse.
 */
const STUB_OUTPUT_LITERALS = new Set(['', '[]', '{}', 'null', 'undefined', '()', '[ ]', '{ }'])
const STUB_OUTPUT_PHRASE = /^(0 rows?|no rows?|none|empty|no results?|n\/a)$/i

/**
 * Server-computed aliveness fact: does this captured output demonstrate the
 * seam carried data? This is the single source of truth shared by Layer 4c
 * and the PR-CI gate — both read the boolean rather than re-implementing the
 * stub-detection. Content-only: the *policy* of which methods count toward
 * proof lives in the gate, not here.
 */
function isOutputAlive(output: string): boolean {
  const trimmed = output.trim()
  if (STUB_OUTPUT_LITERALS.has(trimmed)) return false
  if (STUB_OUTPUT_PHRASE.test(trimmed)) return false
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed === null) return false
    if (Array.isArray(parsed)) return parsed.length > 0
    if (typeof parsed === 'object') return Object.keys(parsed).length > 0
  } catch {
    // Not JSON — non-empty prose / command output counts as alive.
  }
  return true
}

interface DetailRow {
  id: string
  method: VerifyMethod
  output_scrubbed: string
  files_concat: string | null
}

function mapDetailRow(row: DetailRow): VerificationDetail {
  return {
    id: row.id,
    method: row.method,
    files_touched: row.files_concat ? row.files_concat.split(',').filter(Boolean) : [],
    output_nonempty: isOutputAlive(row.output_scrubbed),
  }
}

async function lookupIdsDetailed(
  env: Env,
  ids: string[]
): Promise<Map<string, VerificationDetail>> {
  const placeholders = ids.map(() => '?').join(',')
  const result = await env.DB.prepare(
    `SELECT vl.id              AS id,
            vl.method          AS method,
            vl.output_scrubbed AS output_scrubbed,
            GROUP_CONCAT(DISTINCT vf.file_path) AS files_concat
     FROM verify_ledger vl
     LEFT JOIN verify_files vf ON vf.verify_id = vl.id
     WHERE vl.id IN (${placeholders})
     GROUP BY vl.id`
  )
    .bind(...ids)
    .all<DetailRow>()

  const map = new Map<string, VerificationDetail>()
  for (const row of result.results ?? []) {
    map.set(row.id, mapDetailRow(row))
  }
  return map
}

async function querySessionVerifications(
  env: Env,
  sessionId: string
): Promise<VerificationDetail[]> {
  const result = await env.DB.prepare(
    `SELECT vl.id              AS id,
            vl.method          AS method,
            vl.output_scrubbed AS output_scrubbed,
            GROUP_CONCAT(DISTINCT vf.file_path) AS files_concat
     FROM verify_ledger vl
     LEFT JOIN verify_files vf ON vf.verify_id = vl.id
     WHERE vl.session_id = ?
     GROUP BY vl.id
     ORDER BY vl.created_at DESC`
  )
    .bind(sessionId)
    .all<DetailRow>()

  return (result.results ?? []).map(mapDetailRow)
}
