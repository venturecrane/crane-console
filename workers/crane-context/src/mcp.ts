/**
 * Crane Context Worker - MCP Protocol Handler
 *
 * Implements MCP (Model Context Protocol) Streamable HTTP transport.
 * Exposes session management tools for Claude Code integration.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Methods: initialize, tools/list, tools/call
 *
 * Implementation is split across:
 *   mcp/types.ts            — protocol types + error codes
 *   mcp/rate-limit.ts       — D1-backed rate limiting
 *   mcp/tool-definitions.ts — tool declarations + Zod schemas
 *   mcp/tool-executors.ts   — per-tool business logic
 *   mcp/protocol.ts         — JSON-RPC method routing
 */

import type { Env } from './types'
import { buildRequestContext, isResponse } from './auth'
import { checkRateLimit } from './mcp/rate-limit'
import { mcpError, MCP_ERRORS, type McpResponse } from './mcp/types'
import { handleInitialize, handleToolsList, handleToolsCall } from './mcp/protocol'

// Re-export public API — callers depend on these symbols
export { HOSTED_MCP_TOOLS } from './mcp/tool-definitions'
export type { HostedMcpTool } from './mcp/tool-definitions'

// ============================================================================
// Rate Limit Response
// ============================================================================

function rateLimitResponse(resetAt: string): Response {
  const body = mcpError(null, MCP_ERRORS.RATE_LIMITED, 'Rate limit exceeded', {
    retry_after_seconds: 60,
  })
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': resetAt,
    },
  })
}

// ============================================================================
// Request Parsing
// ============================================================================

interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

async function parseRequest(request: Request): Promise<McpRequest | Response> {
  try {
    return (await request.json()) as McpRequest
  } catch {
    const body = mcpError(null, MCP_ERRORS.PARSE_ERROR, 'Invalid JSON')
    return new Response(JSON.stringify(body), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function validateJsonRpc(req: McpRequest): McpResponse | null {
  if (req.jsonrpc !== '2.0' || !req.method) {
    return mcpError(req.id || null, MCP_ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request')
  }
  return null
}

// ============================================================================
// Method Routing
// ============================================================================

async function routeMethod(
  req: McpRequest,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<McpResponse> {
  switch (req.method) {
    case 'initialize':
      return handleInitialize(req.id)

    case 'tools/list':
      return handleToolsList(req.id)

    case 'tools/call':
      if (!req.params?.name) {
        return mcpError(req.id, MCP_ERRORS.INVALID_PARAMS, 'Missing tool name')
      }
      return handleToolsCall(
        req.id,
        req.params as Record<string, unknown>,
        env,
        actorKeyId,
        correlationId
      )

    default:
      return mcpError(req.id, MCP_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${req.method}`)
  }
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Main MCP request handler.
 * Implements MCP Streamable HTTP transport.
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
    return rateLimitResponse(rateLimit.resetAt)
  }

  // 3. Parse request body
  const parsed = await parseRequest(request)
  if (parsed instanceof Response) {
    return parsed
  }

  // 4. Validate JSON-RPC format
  const validationError = validateJsonRpc(parsed)
  if (validationError) {
    return new Response(JSON.stringify(validationError), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 5. Route to handler
  const response = await routeMethod(parsed, env, context.actorKeyId, context.correlationId)

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
