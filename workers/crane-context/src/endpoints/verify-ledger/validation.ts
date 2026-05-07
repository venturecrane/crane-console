/**
 * Input validation for POST /verify (record verification artifact).
 *
 * Returns a string error message on the first failed check, null if valid.
 * Each check corresponds to a validationErrorResponse call in the handler.
 * Extracted to keep handleRecordVerification under the 75-line /
 * complexity-15 caps.
 */

import {
  MAX_VERIFY_OUTPUT_BYTES,
  MAX_VERIFY_CLAIM_CHARS,
  VERIFY_METHODS,
  VERIFY_SOURCES,
  VERIFY_TOOLS_USED,
  VERIFY_TRUNCATIONS,
  VERIFY_VENDOR_DOCS_MIN_OUTPUT,
  type VerifyMethod,
  type VerifySource,
  type VerifyToolUsed,
  type VerifyTruncation,
} from '../../constants'
import { sizeInBytes } from '../../utils'

// Re-export so the handler can import everything from one place.
export type { VerifyMethod, VerifySource, VerifyToolUsed, VerifyTruncation }

export interface RecordVerificationBody {
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

export interface ValidationError {
  field: string
  message: string
}

export interface PayloadTooLargeError {
  kind: 'payload_too_large'
  message: string
}

export type ValidateResult = ValidationError | PayloadTooLargeError | null

/**
 * Parse JSON body and validate it in one call.
 * Returns `{ body }` on success, or `{ error }` describing the failure.
 */
export async function parseAndValidateRecordBody(
  request: Request
): Promise<{ body: RecordVerificationBody } | { error: ValidateResult; parseError?: boolean }> {
  let body: RecordVerificationBody
  try {
    body = (await request.json()) as RecordVerificationBody
  } catch {
    return { error: null, parseError: true }
  }
  const error = validateRecordBody(body)
  if (error !== null) return { error }
  return { body }
}

/** Returns null when valid, or an error descriptor on the first failed check. */
export function validateRecordBody(body: RecordVerificationBody): ValidateResult {
  if (!body.method || !VERIFY_METHODS.includes(body.method)) {
    return { field: 'method', message: `Must be one of: ${VERIFY_METHODS.join(', ')}` }
  }

  if (!body.tool_used || !VERIFY_TOOLS_USED.includes(body.tool_used)) {
    return { field: 'tool_used', message: `Must be one of: ${VERIFY_TOOLS_USED.join(', ')}` }
  }

  const claimError = validateClaim(body.claim)
  if (claimError) return claimError

  const outputError = validateOutput(body)
  if (outputError) return outputError

  const integrityError = validateIntegrityBindings(body)
  if (integrityError) return integrityError

  if (body.output_truncation && !VERIFY_TRUNCATIONS.includes(body.output_truncation)) {
    return {
      field: 'output_truncation',
      message: `Must be one of: ${VERIFY_TRUNCATIONS.join(', ')}`,
    }
  }

  if (body.source && !VERIFY_SOURCES.includes(body.source)) {
    return { field: 'source', message: `Must be one of: ${VERIFY_SOURCES.join(', ')}` }
  }

  if (body.files_touched && !Array.isArray(body.files_touched)) {
    return { field: 'files_touched', message: 'Must be an array of strings' }
  }

  return null
}

function validateClaim(claim: unknown): ValidationError | null {
  if (typeof claim !== 'string' || claim.length === 0) {
    return { field: 'claim', message: 'Required non-empty string' }
  }
  if (claim.length > MAX_VERIFY_CLAIM_CHARS) {
    return {
      field: 'claim',
      message: `claim exceeds ${MAX_VERIFY_CLAIM_CHARS} chars; trim to a one-line statement of what is supposedly true`,
    }
  }
  return null
}

function validateOutput(body: RecordVerificationBody): ValidateResult {
  if (typeof body.output !== 'string') {
    return { field: 'output', message: 'Required string field' }
  }

  // Reject oversize output explicitly with head_tail guidance — never
  // silently truncate, since silent truncation produces a ledger row
  // that lies about what was observed.
  if (sizeInBytes(body.output) > MAX_VERIFY_OUTPUT_BYTES) {
    return {
      kind: 'payload_too_large',
      message: `output exceeds ${MAX_VERIFY_OUTPUT_BYTES} bytes; capture the command + apply head_tail truncation (first 4KB + "\\n...[truncated]...\\n" + last 4KB) and set output_truncation:"head_tail"`,
    }
  }

  return null
}

function validateIntegrityBindings(body: RecordVerificationBody): ValidationError | null {
  // Integrity binding 1: fresh_process and live_state require command —
  // a record without command is an unrechecked claim, the exact pattern
  // PR 3 audit needs to re-run for mismatch detection.
  if ((body.method === 'fresh_process' || body.method === 'live_state') && !body.command) {
    return {
      field: 'command',
      message: `command is required for method=${body.method} (PR 3 audit re-runs it for integrity)`,
    }
  }

  // Integrity binding 2: vendor_docs requires non-trivial output. A
  // trivially-empty "I read the docs" record has nothing to attach to
  // when PR 3 surfaces it on a regression.
  if (body.method === 'vendor_docs' && body.output.length < VERIFY_VENDOR_DOCS_MIN_OUTPUT) {
    return {
      field: 'output',
      message: `vendor_docs requires output.length >= ${VERIFY_VENDOR_DOCS_MIN_OUTPUT}; paste the actual doc excerpt`,
    }
  }

  return null
}
