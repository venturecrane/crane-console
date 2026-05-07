/**
 * Validation helpers for session lifecycle endpoints.
 *
 * - validateSosBody    – required/format checks for POST /sos
 * - validateEosBody    – required/format checks for POST /eos
 * - assertSessionActive – 404/409 guard reused across /eos, /update, /heartbeat, /checkpoint
 */

import {
  validationErrorResponse,
  errorResponse,
  isValidAgent,
  isValidVenture,
  isValidRepo,
  isValidSessionId,
} from '../../utils'
import { HTTP_STATUS, VENTURES } from '../../constants'

// ============================================================================
// SOS body types (re-exported so sessions.ts can import from here)
// ============================================================================

export interface StartOfSessionBody {
  agent: string
  client?: string
  client_version?: string
  client_session_id?: string
  host?: string
  venture: string
  repo: string
  track?: number
  issue_number?: number
  branch?: string
  commit_sha?: string
  session_group_id?: string
  meta?: Record<string, unknown>
  include_docs?: boolean
  docs_format?: 'full' | 'index'
  include_scripts?: boolean
  scripts_format?: 'full' | 'index'
  update_id?: string
}

export interface EndOfSessionBody {
  session_id: string
  to_agent?: string
  status_label?: string
  summary: string
  payload?: Record<string, unknown>
  end_reason?: string
  last_activity_at?: string
  update_id?: string
  keep_session_open?: boolean
}

export interface UpdateBody {
  session_id: string
  update_id?: string
  branch?: string
  commit_sha?: string
  client_session_id?: string
  meta?: Record<string, unknown>
}

export interface HeartbeatBody {
  session_id: string
  client_session_id?: string
}

export interface CheckpointBody {
  session_id: string
  summary: string
  work_completed?: string[]
  blockers?: string[]
  next_actions?: string[]
  notes?: string
}

// ============================================================================
// Validators
// ============================================================================

export function validateSosBody(body: StartOfSessionBody, correlationId: string): Response | null {
  const errors: Array<{ field: string; message: string }> = []
  if (!body.agent || typeof body.agent !== 'string' || !isValidAgent(body.agent)) {
    errors.push({
      field: 'agent',
      message: 'Required, must match pattern: lowercase-alphanumeric-with-hyphens',
    })
  }
  if (!body.venture || typeof body.venture !== 'string' || !isValidVenture(body.venture)) {
    errors.push({ field: 'venture', message: `Required, must be one of: ${VENTURES.join(', ')}` })
  }
  if (!body.repo || typeof body.repo !== 'string' || !isValidRepo(body.repo)) {
    errors.push({ field: 'repo', message: 'Required, must match pattern: owner/repo' })
  }
  if (errors.length > 0) {
    return validationErrorResponse(errors, correlationId)
  }
  return null
}

export function validateEosBody(body: EndOfSessionBody, correlationId: string): Response | null {
  if (
    !body.session_id ||
    typeof body.session_id !== 'string' ||
    !isValidSessionId(body.session_id)
  ) {
    return validationErrorResponse(
      [{ field: 'session_id', message: 'Required, must match pattern: sess_<ULID>' }],
      correlationId
    )
  }

  if (!body.summary || typeof body.summary !== 'string') {
    return validationErrorResponse(
      [{ field: 'summary', message: 'Required string field' }],
      correlationId
    )
  }

  if (
    body.to_agent !== undefined &&
    (typeof body.to_agent !== 'string' || !isValidAgent(body.to_agent))
  ) {
    return validationErrorResponse(
      [
        {
          field: 'to_agent',
          message: 'If provided, must match pattern: lowercase-alphanumeric-with-hyphens',
        },
      ],
      correlationId
    )
  }

  if (body.payload !== undefined && typeof body.payload !== 'object') {
    return validationErrorResponse(
      [{ field: 'payload', message: 'Must be an object' }],
      correlationId
    )
  }

  return null
}

// ============================================================================
// Active-session guard
// ============================================================================

export interface SessionLike {
  status: string
}

export function assertSessionActive(
  session: SessionLike | null,
  sessionId: string,
  correlationId: string
): Response | null {
  if (!session) {
    return errorResponse('Session not found', HTTP_STATUS.NOT_FOUND, correlationId, {
      session_id: sessionId,
    })
  }
  if (session.status !== 'active') {
    return errorResponse('Session is not active', HTTP_STATUS.CONFLICT, correlationId, {
      session_id: sessionId,
      status: session.status,
    })
  }
  return null
}
