/**
 * Structured error type for crane-context API responses.
 *
 * The crane-context worker returns validation failures as HTTP 4xx with
 * a JSON body containing `error`, `details`, and `correlation_id`. Before
 * this module existed, every MCP tool wrapped fetch calls in a try/catch
 * that discarded the Response and surfaced "Failed to connect to Crane
 * API. Check your network connection." — obscuring validation errors as
 * network failures. That masking hid the 2026-04 agent-identity bug for
 * a week.
 *
 * `ApiError` preserves the full context (status, error code, field-level
 * details, correlation id, endpoint) so tool output can render exactly
 * which field failed and why.
 *
 * Field whitelist: `toToolMessage()` renders only a fixed set of fields.
 * Server-supplied strings (field messages) are truncated to 200 chars and
 * limited to 5 entries. This prevents a future server-side change that
 * echoes user input into `details[].message` from widening the prompt
 * surface seen by the LLM.
 */

const MAX_FIELD_ERROR_COUNT = 5
const MAX_FIELD_MESSAGE_LENGTH = 200
const MAX_BODY_SNIPPET_LENGTH = 500

export interface FieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  readonly errorCode: string
  readonly correlationId: string | undefined
  readonly fieldErrors: FieldError[]
  readonly endpoint: string
  readonly responseBodySnippet: string

  constructor(opts: {
    status: number
    errorCode: string
    correlationId: string | undefined
    fieldErrors: FieldError[]
    endpoint: string
    responseBodySnippet: string
  }) {
    super(`API error at ${opts.endpoint} (HTTP ${opts.status}): ${opts.errorCode}`)
    this.name = 'ApiError'
    this.status = opts.status
    this.errorCode = opts.errorCode
    this.correlationId = opts.correlationId
    this.fieldErrors = opts.fieldErrors
    this.endpoint = opts.endpoint
    this.responseBodySnippet = opts.responseBodySnippet
  }

  /**
   * Render the error as a string suitable for inclusion in an MCP tool
   * response. Includes only whitelisted fields. Truncates server-supplied
   * strings. Safe to include the client-computed agent for operator
   * context when debugging /sos and /eos failures.
   */
  toToolMessage(clientComputedAgent?: string): string {
    const lines: string[] = []
    const corrSuffix = this.correlationId ? `, correlation_id=${this.correlationId}` : ''
    lines.push(`API ${this.errorCode} at ${this.endpoint} (HTTP ${this.status}${corrSuffix}):`)
    if (this.fieldErrors.length === 0) {
      lines.push(`  - ${truncate(this.responseBodySnippet, MAX_FIELD_MESSAGE_LENGTH)}`)
    } else {
      for (const err of this.fieldErrors) {
        lines.push(
          `  - field ${JSON.stringify(err.field)}: ${truncate(err.message, MAX_FIELD_MESSAGE_LENGTH)}`
        )
      }
    }
    if (clientComputedAgent !== undefined) {
      lines.push(`Client-computed agent was: ${JSON.stringify(clientComputedAgent)}`)
    }
    return lines.join('\n')
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '…'
}

interface ServerErrorBody {
  error?: unknown
  details?: unknown
  correlation_id?: unknown
}

/**
 * Parse a non-ok Response into an ApiError.
 *
 * Reads the response body once. If the body is valid JSON with the
 * expected error shape, extracts and whitelists. If it isn't, preserves
 * a truncated raw snippet so tool output still surfaces something useful.
 */
export async function parseApiError(response: Response, endpoint: string): Promise<ApiError> {
  let rawBody = ''
  try {
    rawBody = await response.text()
  } catch {
    rawBody = '<unreadable response body>'
  }
  const snippet = truncate(rawBody, MAX_BODY_SNIPPET_LENGTH)

  let errorCode = 'api_error'
  let correlationId: string | undefined
  let fieldErrors: FieldError[] = []

  try {
    const parsed = JSON.parse(rawBody) as ServerErrorBody
    if (typeof parsed.error === 'string') {
      errorCode = parsed.error
    }
    if (typeof parsed.correlation_id === 'string') {
      correlationId = parsed.correlation_id
    }
    if (Array.isArray(parsed.details)) {
      fieldErrors = parsed.details
        .slice(0, MAX_FIELD_ERROR_COUNT)
        .map((d): FieldError | null => {
          if (
            d !== null &&
            typeof d === 'object' &&
            'field' in d &&
            'message' in d &&
            typeof (d as { field: unknown }).field === 'string' &&
            typeof (d as { message: unknown }).message === 'string'
          ) {
            return {
              field: (d as { field: string }).field,
              message: (d as { message: string }).message,
            }
          }
          return null
        })
        .filter((x): x is FieldError => x !== null)
    }
  } catch {
    // Non-JSON body — leave errorCode at 'api_error' and fall through.
  }

  return new ApiError({
    status: response.status,
    errorCode,
    correlationId,
    fieldErrors,
    endpoint,
    responseBodySnippet: snippet,
  })
}
