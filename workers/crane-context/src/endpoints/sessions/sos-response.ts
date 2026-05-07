/**
 * SOS response assembly.
 *
 * Builds the responseData object for POST /sos from session + context payloads.
 * Isolated here to keep handleStartOfSession within the 75-line limit.
 */

import type { SessionRecord } from '../../types'
import type { SosContextResult } from './sos-context'

interface HeartbeatInfo {
  next_heartbeat_at: string
  heartbeat_interval_seconds: number
}

export function buildSosResponse(
  session: SessionRecord,
  heartbeat: HeartbeatInfo,
  ctx: SosContextResult,
  correlationId: string
): Record<string, unknown> {
  const status = session.created_at === session.last_heartbeat_at ? 'created' : 'resumed'

  return {
    session_id: session.id,
    status,
    session,
    next_heartbeat_at: heartbeat.next_heartbeat_at,
    heartbeat_interval_seconds: heartbeat.heartbeat_interval_seconds,
    correlation_id: correlationId,
    ...(ctx.docsResponse && {
      documentation: {
        docs: ctx.docsResponse.docs,
        count: ctx.docsResponse.count,
        content_hash: ctx.docsResponse.content_hash_combined,
      },
    }),
    ...(ctx.docsIndexResponse && {
      doc_index: {
        docs: ctx.docsIndexResponse.docs,
        count: ctx.docsIndexResponse.count,
      },
    }),
    ...(ctx.scriptsResponse && {
      scripts: {
        scripts: ctx.scriptsResponse.scripts,
        count: ctx.scriptsResponse.count,
        content_hash: ctx.scriptsResponse.content_hash_combined,
      },
    }),
    ...(ctx.scriptsIndexResponse && {
      script_index: {
        scripts: ctx.scriptsIndexResponse.scripts,
        count: ctx.scriptsIndexResponse.count,
      },
    }),
    ...(ctx.lastHandoff && { last_handoff: ctx.lastHandoff }),
    ...(ctx.docAudit && { doc_audit: ctx.docAudit }),
    ...(ctx.enterpriseContext && { enterprise_context: ctx.enterpriseContext }),
    ...(ctx.knowledgeBase && { knowledge_base: ctx.knowledgeBase }),
  }
}
