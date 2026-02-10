/**
 * Crane Context Worker - MCP Protocol Handler
 *
 * Implements MCP (Model Context Protocol) Streamable HTTP transport.
 * Exposes session management tools for Claude Code integration.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Methods: initialize, tools/list, tools/call
 */

import { z } from 'zod'
import type { Env, SessionRecord, HandoffRecord } from './types'
import { buildRequestContext, isResponse } from './auth'
import { jsonResponse, errorResponse, sha256, nowIso } from './utils'
import { HTTP_STATUS } from './constants'
import { resumeOrCreateSession, getSession, endSession, calculateNextHeartbeat } from './sessions'
import { createHandoff, getLatestHandoff } from './handoffs'
import { fetchDocsForVenture } from './docs'
import { fetchScriptsForVenture } from './scripts'
import { extractIdempotencyKey, handleIdempotentRequest, storeIdempotencyKey } from './idempotency'

// ============================================================================
// MCP Protocol Types
// ============================================================================

interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface McpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: McpError
}

interface McpError {
  code: number
  message: string
  data?: unknown
}

// MCP error codes (JSON-RPC standard + MCP extensions)
const MCP_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RATE_LIMITED: -32000,
} as const

// ============================================================================
// Rate Limiting
// ============================================================================

const RATE_LIMIT_REQUESTS = 100
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * Check rate limit for MCP requests
 * Uses D1 counter pattern: rl:<sha256(key)>:<minute>
 */
async function checkRateLimit(
  db: D1Database,
  actorKeyId: string
): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  const now = new Date()
  const minute = Math.floor(now.getTime() / 1000 / 60)
  const key = `rl:${actorKeyId}:${minute}`
  const resetAt = new Date((minute + 1) * 60 * 1000).toISOString()

  try {
    // Try to increment counter
    const result = await db
      .prepare(
        `INSERT INTO rate_limits (key, count, expires_at)
         VALUES (?, 1, datetime('now', '+${RATE_LIMIT_WINDOW_SECONDS} seconds'))
         ON CONFLICT(key) DO UPDATE SET count = count + 1
         RETURNING count`
      )
      .bind(key)
      .first<{ count: number }>()

    const count = result?.count || 1
    const remaining = Math.max(0, RATE_LIMIT_REQUESTS - count)

    return {
      allowed: count <= RATE_LIMIT_REQUESTS,
      remaining,
      resetAt,
    }
  } catch (error) {
    // If rate limit table doesn't exist, allow request (graceful degradation)
    console.warn('Rate limit check failed, allowing request:', error)
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS, resetAt }
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'crane_sod',
    description:
      'Start of Day - Resume or create a new Crane session. Returns session context, last handoff, and documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        venture: {
          type: 'string',
          enum: ['vc', 'sc', 'dfg'],
          description: 'Venture code (vc=crane-console, sc=smdurgan.com, dfg=dfg-consulting)',
        },
        repo: {
          type: 'string',
          description: 'Repository in owner/repo format',
        },
        track: {
          type: 'integer',
          description: 'Track number for parallel work streams',
        },
        agent: {
          type: 'string',
          description: 'Agent identifier (e.g., claude-opus-1)',
        },
        host: {
          type: 'string',
          description: 'Host machine identifier',
        },
      },
      required: ['agent'],
    },
  },
  {
    name: 'crane_eod',
    description:
      'End of Day - End the current session with a handoff summary. Creates a handoff document for the next agent.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to end',
        },
        summary: {
          type: 'string',
          description: 'Summary of work completed',
        },
        status: {
          type: 'string',
          description: 'Current status label (e.g., "in-progress", "blocked", "ready-for-review")',
        },
        next_actions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of next actions for the incoming agent',
        },
        blockers: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of current blockers',
        },
        idempotency_key: {
          type: 'string',
          description: 'Idempotency key for retry safety',
        },
      },
      required: ['session_id', 'summary', 'status', 'next_actions'],
    },
  },
  {
    name: 'crane_handoff',
    description:
      'Create a handoff document without ending the session. Use for mid-session context sharing.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of current state',
        },
        to_agent: {
          type: 'string',
          description: 'Target agent for handoff',
        },
        status_label: {
          type: 'string',
          description: 'Current status label',
        },
      },
      required: ['summary'],
    },
  },
  {
    name: 'crane_get_doc',
    description: 'Retrieve a specific documentation document by name.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_name: {
          type: 'string',
          description: 'Name of the document to retrieve',
        },
        scope: {
          type: 'string',
          description: 'Scope of the document (global, vc, sc, dfg)',
        },
      },
      required: ['doc_name'],
    },
  },
  {
    name: 'crane_list_sessions',
    description: 'List active sessions, optionally filtered by venture and repo.',
    inputSchema: {
      type: 'object',
      properties: {
        venture: {
          type: 'string',
          enum: ['vc', 'sc', 'dfg'],
          description: 'Filter by venture',
        },
        repo: {
          type: 'string',
          description: 'Filter by repository',
        },
      },
    },
  },
]

// ============================================================================
// Zod Schemas for Parameter Validation
// ============================================================================

const SodParamsSchema = z.object({
  venture: z.enum(['vc', 'sc', 'dfg']).optional().default('vc'),
  repo: z.string().optional().default('smdurgan/crane-console'),
  track: z.number().int().positive().optional(),
  agent: z.string().min(1),
  host: z.string().optional(),
})

const EodParamsSchema = z.object({
  session_id: z.string().min(1),
  summary: z.string().min(1),
  status: z.string().min(1),
  next_actions: z.array(z.string()),
  blockers: z.array(z.string()).optional().default([]),
  idempotency_key: z.string().optional(),
})

const HandoffParamsSchema = z.object({
  summary: z.string().min(1),
  to_agent: z.string().optional(),
  status_label: z.string().optional(),
})

const GetDocParamsSchema = z.object({
  doc_name: z.string().min(1),
  scope: z.string().optional(),
})

const ListSessionsParamsSchema = z.object({
  venture: z.enum(['vc', 'sc', 'dfg']).optional(),
  repo: z.string().optional(),
})

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Execute crane_sod tool
 */
async function executeSod(
  params: z.infer<typeof SodParamsSchema>,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<unknown> {
  const session = await resumeOrCreateSession(env.DB, {
    agent: params.agent,
    host: params.host,
    venture: params.venture,
    repo: params.repo,
    track: params.track,
    actor_key_id: actorKeyId,
    creation_correlation_id: correlationId,
  })

  // Fetch documentation
  let docsResponse = null
  try {
    docsResponse = await fetchDocsForVenture(env.DB, params.venture)
  } catch (error) {
    console.error('Failed to fetch docs:', error)
  }

  // Fetch scripts
  let scriptsResponse = null
  try {
    scriptsResponse = await fetchScriptsForVenture(env.DB, params.venture)
  } catch (error) {
    console.error('Failed to fetch scripts:', error)
  }

  // Fetch last handoff
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
    ...(docsResponse && {
      documentation: {
        docs: docsResponse.docs.map((d) => ({
          scope: d.scope,
          doc_name: d.doc_name,
          title: d.title,
          content: d.content,
        })),
        count: docsResponse.count,
      },
    }),
    ...(scriptsResponse && {
      scripts: {
        scripts: scriptsResponse.scripts,
        count: scriptsResponse.count,
      },
    }),
    ...(lastHandoff && {
      last_handoff: {
        id: lastHandoff.id,
        summary: lastHandoff.summary,
        status_label: lastHandoff.status_label,
        from_agent: lastHandoff.from_agent,
        created_at: lastHandoff.created_at,
        payload: JSON.parse(lastHandoff.payload_json),
      },
    }),
  }
}

/**
 * Execute crane_eod tool
 */
async function executeEod(
  params: z.infer<typeof EodParamsSchema>,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<unknown> {
  // Verify session exists and is active
  const session = await getSession(env.DB, params.session_id)

  if (!session) {
    throw new Error(`Session not found: ${params.session_id}`)
  }

  if (session.status !== 'active') {
    throw new Error(`Session is not active: ${params.session_id} (status: ${session.status})`)
  }

  // Create handoff payload
  const payload = {
    summary: params.summary,
    status: params.status,
    next_actions: params.next_actions,
    blockers: params.blockers,
    work_completed: [], // Could be added as parameter later
  }

  // Create handoff
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

  // End session
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

/**
 * Execute crane_handoff tool (mid-session handoff)
 */
async function executeHandoff(
  params: z.infer<typeof HandoffParamsSchema>,
  env: Env,
  actorKeyId: string,
  correlationId: string,
  sessionId?: string
): Promise<unknown> {
  // For mid-session handoff, we need a session context
  // This is typically stored in the agent's context, but for MCP we need to query
  // For now, we'll create a standalone handoff with minimal context

  if (!sessionId) {
    throw new Error('crane_handoff requires an active session. Use crane_sod first.')
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

/**
 * Execute crane_get_doc tool
 */
async function executeGetDoc(
  params: z.infer<typeof GetDocParamsSchema>,
  env: Env
): Promise<unknown> {
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

/**
 * Execute crane_list_sessions tool
 */
async function executeListSessions(
  params: z.infer<typeof ListSessionsParamsSchema>,
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

  return {
    sessions: result.results || [],
    count: result.results?.length || 0,
  }
}

// ============================================================================
// MCP Request Handler
// ============================================================================

/**
 * Build MCP success response
 */
function mcpSuccess(id: string | number, result: unknown): McpResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

/**
 * Build MCP error response
 */
function mcpError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): McpResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? 0,
    error: {
      code,
      message,
      ...(data !== undefined && { data }),
    },
  }
}

/**
 * Handle MCP initialize request
 */
function handleInitialize(id: string | number): McpResponse {
  return mcpSuccess(id, {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: 'crane-context',
      version: '1.0.0',
    },
  })
}

/**
 * Handle MCP tools/list request
 */
function handleToolsList(id: string | number): McpResponse {
  return mcpSuccess(id, {
    tools: TOOL_DEFINITIONS,
  })
}

/**
 * Handle MCP tools/call request
 */
async function handleToolsCall(
  id: string | number,
  params: Record<string, unknown>,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<McpResponse> {
  const toolName = params.name as string
  const toolArgs = (params.arguments || {}) as Record<string, unknown>

  try {
    let result: unknown

    switch (toolName) {
      case 'crane_sod': {
        const validated = SodParamsSchema.parse(toolArgs)
        result = await executeSod(validated, env, actorKeyId, correlationId)
        break
      }

      case 'crane_eod': {
        const validated = EodParamsSchema.parse(toolArgs)

        // Check idempotency
        if (validated.idempotency_key) {
          const cached = await handleIdempotentRequest(
            env.DB,
            '/mcp/crane_eod',
            validated.idempotency_key
          )
          if (cached) {
            const body = await cached.json()
            return mcpSuccess(id, { content: [{ type: 'text', text: JSON.stringify(body) }] })
          }
        }

        result = await executeEod(validated, env, actorKeyId, correlationId)

        // Store idempotency if key provided
        if (validated.idempotency_key) {
          const response = new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
          await storeIdempotencyKey(
            env.DB,
            '/mcp/crane_eod',
            validated.idempotency_key,
            response,
            actorKeyId,
            correlationId
          )
        }
        break
      }

      case 'crane_handoff': {
        const validated = HandoffParamsSchema.parse(toolArgs)
        // Note: This needs session context - for now, we throw an error
        // In production, this would integrate with session tracking
        result = await executeHandoff(validated, env, actorKeyId, correlationId)
        break
      }

      case 'crane_get_doc': {
        const validated = GetDocParamsSchema.parse(toolArgs)
        result = await executeGetDoc(validated, env)
        break
      }

      case 'crane_list_sessions': {
        const validated = ListSessionsParamsSchema.parse(toolArgs)
        result = await executeListSessions(validated, env, actorKeyId)
        break
      }

      default:
        return mcpError(id, MCP_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${toolName}`)
    }

    // Return MCP tool result format
    return mcpSuccess(id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return mcpError(id, MCP_ERRORS.INVALID_PARAMS, 'Invalid parameters', {
        issues: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      })
    }

    return mcpError(
      id,
      MCP_ERRORS.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Internal error'
    )
  }
}

/**
 * Main MCP request handler
 * Implements MCP Streamable HTTP transport
 */
export async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  // 1. Auth validation
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  // 2. Rate limiting
  const rateLimit = await checkRateLimit(env.DB, context.actorKeyId)
  if (!rateLimit.allowed) {
    const errorBody = mcpError(null, MCP_ERRORS.RATE_LIMITED, 'Rate limit exceeded', {
      retry_after_seconds: 60,
    })
    return new Response(JSON.stringify(errorBody), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimit.resetAt,
      },
    })
  }

  // 3. Parse request body
  let mcpRequest: McpRequest
  try {
    mcpRequest = (await request.json()) as McpRequest
  } catch {
    const errorBody = mcpError(null, MCP_ERRORS.PARSE_ERROR, 'Invalid JSON')
    return new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 4. Validate JSON-RPC format
  if (mcpRequest.jsonrpc !== '2.0' || !mcpRequest.method) {
    const errorBody = mcpError(
      mcpRequest.id || null,
      MCP_ERRORS.INVALID_REQUEST,
      'Invalid JSON-RPC 2.0 request'
    )
    return new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 5. Route to handler
  let response: McpResponse

  switch (mcpRequest.method) {
    case 'initialize':
      response = handleInitialize(mcpRequest.id)
      break

    case 'tools/list':
      response = handleToolsList(mcpRequest.id)
      break

    case 'tools/call':
      if (!mcpRequest.params?.name) {
        response = mcpError(mcpRequest.id, MCP_ERRORS.INVALID_PARAMS, 'Missing tool name')
      } else {
        response = await handleToolsCall(
          mcpRequest.id,
          mcpRequest.params as Record<string, unknown>,
          env,
          context.actorKeyId,
          context.correlationId
        )
      }
      break

    default:
      response = mcpError(
        mcpRequest.id,
        MCP_ERRORS.METHOD_NOT_FOUND,
        `Unknown method: ${mcpRequest.method}`
      )
  }

  // 6. Return response with rate limit headers
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': context.correlationId,
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': rateLimit.resetAt,
    },
  })
}
