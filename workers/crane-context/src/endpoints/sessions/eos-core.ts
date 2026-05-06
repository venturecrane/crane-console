/**
 * EOS core: handoff creation + session termination.
 *
 * Extracted from handleEndOfSession to keep that handler under the
 * 75-line / complexity-15 limits.
 */

import { createHandoff } from '../../handoffs'
import { endSession } from '../../sessions'
import { jsonResponse, errorResponse, payloadTooLargeResponse } from '../../utils'
import { HTTP_STATUS } from '../../constants'
import { storeIdempotencyKey } from '../../idempotency'
import type { EndOfSessionBody } from './validate'

interface EosCoreOpts {
  db: D1Database
  body: EndOfSessionBody
  session: {
    venture: string
    repo: string
    track: number | null
    issue_number: number | null
    branch: string | null
    commit_sha: string | null
    agent: string
  }
  actorKeyId: string
  correlationId: string
  idempotencyKey: string | null
}

export async function executeEos(opts: EosCoreOpts): Promise<Response> {
  const { db, body, session, actorKeyId, correlationId, idempotencyKey } = opts

  // Ensure payload defaults
  const payload = body.payload ?? {}

  try {
    const handoff = await createHandoff(db, {
      session_id: body.session_id,
      venture: session.venture,
      repo: session.repo,
      track: session.track || undefined,
      issue_number: session.issue_number || undefined,
      branch: session.branch || undefined,
      commit_sha: session.commit_sha || undefined,
      from_agent: session.agent,
      to_agent: body.to_agent,
      status_label: body.status_label,
      summary: body.summary,
      payload,
      actor_key_id: actorKeyId,
      creation_correlation_id: correlationId,
    })

    const endedAt = body.keep_session_open
      ? null
      : await endSession(db, body.session_id, body.end_reason || 'manual', body.last_activity_at)

    const responseData = {
      session_id: body.session_id,
      handoff_id: handoff.id,
      handoff,
      ended_at: endedAt,
      correlation_id: correlationId,
    }

    const response = jsonResponse(responseData, HTTP_STATUS.OK, correlationId)

    if (idempotencyKey) {
      await storeIdempotencyKey(db, '/eos', idempotencyKey, response, actorKeyId, correlationId)
    }

    return response
  } catch (handoffError) {
    if (handoffError instanceof Error && handoffError.message.includes('too large')) {
      return payloadTooLargeResponse(handoffError.message, correlationId)
    }
    return errorResponse(
      handoffError instanceof Error ? handoffError.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}
