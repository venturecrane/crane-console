/**
 * MCP Tool Executors
 *
 * Business logic implementations for each hosted MCP tool.
 */

import { z } from 'zod'
import { isValidAgent } from '@venturecrane/crane-contracts'
import type { Env } from '../types'
import { resumeOrCreateSession, getSession, endSession, calculateNextHeartbeat } from '../sessions'
import { createHandoff, getLatestHandoff } from '../handoffs'
import { fetchDocsForVenture } from '../docs'
import { fetchScriptsForVenture } from '../scripts'
import { handleIdempotentRequest, storeIdempotencyKey } from '../idempotency'
import {
  SosParamsSchema,
  EosParamsSchema,
  HandoffParamsSchema,
  GetDocParamsSchema,
  ListSessionsParamsSchema,
} from './tool-definitions'

// ============================================================================
// Canary Telemetry
// ============================================================================

/**
 * Canary telemetry for `/mcp` agent tightening (§Rollout step 4).
 *
 * Emits a structured warning when the permissive Zod schema accepts an agent
 * value that would fail the strict AGENT_PATTERN. Collected for one week
 * before step 5 tightens the schema to `z.string().regex(AGENT_PATTERN)`.
 *
 * Does NOT reject the request — this is observation only.
 */
export function logAgentPatternMismatch(
  endpoint: string,
  agent: string,
  actorKeyId: string,
  correlationId: string
): void {
  if (!isValidAgent(agent)) {
    console.warn(
      JSON.stringify({
        event: 'agent_pattern_canary_mismatch',
        endpoint,
        agent,
        agent_length: agent.length,
        actor_key_id: actorKeyId,
        correlation_id: correlationId,
      })
    )
  }
}

// ============================================================================
// SOS
// ============================================================================

type SosParams = z.infer<typeof SosParamsSchema>

function buildSosResponseDocs(
  docsResponse: Awaited<ReturnType<typeof fetchDocsForVenture>> | null
) {
  if (!docsResponse) return {}
  return {
    documentation: {
      docs: docsResponse.docs.map((d) => ({
        scope: d.scope,
        doc_name: d.doc_name,
        title: d.title,
        content: d.content,
      })),
      count: docsResponse.count,
    },
  }
}

function buildSosResponseHandoff(lastHandoff: Awaited<ReturnType<typeof getLatestHandoff>>) {
  if (!lastHandoff) return {}
  return {
    last_handoff: {
      id: lastHandoff.id,
      summary: lastHandoff.summary,
      status_label: lastHandoff.status_label,
      from_agent: lastHandoff.from_agent,
      created_at: lastHandoff.created_at,
      payload: JSON.parse(lastHandoff.payload_json as string) as unknown,
    },
  }
}

/**
 * Execute crane_sos tool
 */
export async function executeSos(
  params: SosParams,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<unknown> {
  logAgentPatternMismatch('mcp/crane_sos', params.agent, actorKeyId, correlationId)

  const session = await resumeOrCreateSession(env.DB, {
    agent: params.agent,
    host: params.host,
    venture: params.venture,
    repo: params.repo,
    track: params.track,
    actor_key_id: actorKeyId,
    creation_correlation_id: correlationId,
  })

  let docsResponse = null
  try {
    docsResponse = await fetchDocsForVenture(env.DB, params.venture)
  } catch (error) {
    console.error('Failed to fetch docs:', error)
  }

  let scriptsResponse = null
  try {
    scriptsResponse = await fetchScriptsForVenture(env.DB, params.venture)
  } catch (error) {
    console.error('Failed to fetch scripts:', error)
  }

  let lastHandoff = null
  try {
    lastHandoff = await getLatestHandoff(env.DB, {
      venture: params.venture,
      repo: params.repo,
      track: params.track,
    })
  } catch (error) {
    console.error('Failed to fetch last handoff:', error)
  }

  const status = session.created_at === session.last_heartbeat_at ? 'created' : 'resumed'
  const heartbeat = calculateNextHeartbeat()

  return {
    session_id: session.id,
    status,
    session: {
      id: session.id,
      agent: session.agent,
      venture: session.venture,
      repo: session.repo,
      track: session.track,
      created_at: session.created_at,
      last_heartbeat_at: session.last_heartbeat_at,
    },
    next_heartbeat_at: heartbeat.next_heartbeat_at,
    heartbeat_interval_seconds: heartbeat.heartbeat_interval_seconds,
    ...buildSosResponseDocs(docsResponse),
    ...(scriptsResponse && {
      scripts: {
        scripts: scriptsResponse.scripts,
        count: scriptsResponse.count,
      },
    }),
    ...buildSosResponseHandoff(lastHandoff),
  }
}

// ============================================================================
// EOS
// ============================================================================

type EosParams = z.infer<typeof EosParamsSchema>

function buildEosPayload(params: EosParams) {
  return {
    summary: params.summary,
    status: params.status,
    next_actions: params.next_actions,
    blockers: params.blockers,
    work_completed: [], // Could be added as parameter later
  }
}

/**
 * Execute crane_eos tool
 */
export async function executeEos(
  params: EosParams,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<unknown> {
  const session = await getSession(env.DB, params.session_id)

  if (!session) {
    throw new Error(`Session not found: ${params.session_id}`)
  }

  if (session.status !== 'active') {
    throw new Error(`Session is not active: ${params.session_id} (status: ${session.status})`)
  }

  const payload = buildEosPayload(params)

  const handoff = await createHandoff(env.DB, {
    session_id: params.session_id,
    venture: session.venture,
    repo: session.repo,
    track: session.track || undefined,
    issue_number: session.issue_number || undefined,
    branch: session.branch || undefined,
    commit_sha: session.commit_sha || undefined,
    from_agent: session.agent,
    status_label: params.status,
    summary: params.summary,
    payload,
    actor_key_id: actorKeyId,
    creation_correlation_id: correlationId,
  })

  const endedAt = await endSession(env.DB, params.session_id, 'manual')

  return {
    session_id: params.session_id,
    handoff_id: handoff.id,
    ended_at: endedAt,
    handoff: {
      id: handoff.id,
      summary: handoff.summary,
      status_label: handoff.status_label,
      created_at: handoff.created_at,
    },
  }
}

// ============================================================================
// EOS Idempotency Wrapper
// ============================================================================

/**
 * Execute crane_eos with idempotency key handling
 */
export async function executeEosWithIdempotency(
  params: EosParams,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<{ result?: unknown; cached?: unknown }> {
  if (params.idempotency_key) {
    const cached = await handleIdempotentRequest(env.DB, '/mcp/crane_eos', params.idempotency_key)
    if (cached) {
      const body = await cached.json()
      return { cached: body }
    }
  }

  const result = await executeEos(params, env, actorKeyId, correlationId)

  if (params.idempotency_key) {
    const response = new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    await storeIdempotencyKey(env.DB, '/mcp/crane_eos', params.idempotency_key, response, {
      actorKeyId,
      correlationId,
    })
  }

  return { result }
}

// ============================================================================
// Handoff
// ============================================================================

type HandoffParams = z.infer<typeof HandoffParamsSchema>

/**
 * Execute crane_handoff tool (mid-session handoff)
 */
export async function executeHandoff(
  params: HandoffParams,
  env: Env,
  actorKeyId: string,
  correlationId: string,
  sessionId?: string
): Promise<unknown> {
  if (!sessionId) {
    throw new Error('crane_handoff requires an active session. Use crane_sos first.')
  }

  const session = await getSession(env.DB, sessionId)
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  const payload = {
    summary: params.summary,
    status: params.status_label || 'in-progress',
  }

  const handoff = await createHandoff(env.DB, {
    session_id: sessionId,
    venture: session.venture,
    repo: session.repo,
    track: session.track || undefined,
    from_agent: session.agent,
    to_agent: params.to_agent,
    status_label: params.status_label,
    summary: params.summary,
    payload,
    actor_key_id: actorKeyId,
    creation_correlation_id: correlationId,
  })

  return {
    handoff_id: handoff.id,
    summary: handoff.summary,
    created_at: handoff.created_at,
  }
}

// ============================================================================
// Get Doc
// ============================================================================

type GetDocParams = z.infer<typeof GetDocParamsSchema>

/**
 * Execute crane_get_doc tool
 */
export async function executeGetDoc(params: GetDocParams, env: Env): Promise<unknown> {
  const scope = params.scope || 'global'

  const result = await env.DB.prepare(
    `SELECT scope, doc_name, content, content_hash, title, description, version
       FROM context_docs
       WHERE doc_name = ? AND (scope = ? OR scope = 'global')
       ORDER BY CASE WHEN scope = ? THEN 0 ELSE 1 END
       LIMIT 1`
  )
    .bind(params.doc_name, scope, scope)
    .first()

  if (!result) {
    throw new Error(`Document not found: ${params.doc_name}`)
  }

  return {
    doc_name: result.doc_name,
    scope: result.scope,
    title: result.title,
    content: result.content,
    version: result.version,
  }
}

// ============================================================================
// List Sessions
// ============================================================================

type ListSessionsParams = z.infer<typeof ListSessionsParamsSchema>

/**
 * Execute crane_list_sessions tool
 */
export async function executeListSessions(
  params: ListSessionsParams,
  env: Env,
  actorKeyId: string
): Promise<unknown> {
  let query = `
    SELECT id, agent, venture, repo, track, status, created_at, last_heartbeat_at
    FROM sessions
    WHERE status = 'active'
  `
  const bindings: (string | number)[] = []

  if (params.venture) {
    query += ' AND venture = ?'
    bindings.push(params.venture)
  }

  if (params.repo) {
    query += ' AND repo = ?'
    bindings.push(params.repo)
  }

  query += ' ORDER BY last_heartbeat_at DESC LIMIT 50'

  const result = await env.DB.prepare(query)
    .bind(...bindings)
    .all()

  void actorKeyId // available for future audit logging
  return {
    sessions: result.results || [],
    count: result.results?.length || 0,
  }
}
