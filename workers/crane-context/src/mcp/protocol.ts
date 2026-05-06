/**
 * MCP Protocol Handlers
 *
 * Handles JSON-RPC method routing: initialize, tools/list, tools/call.
 */

import { z } from 'zod'
import type { Env } from '../types'
import { mcpSuccess, mcpError, MCP_ERRORS, type McpResponse } from './types'
import {
  TOOL_DEFINITIONS,
  SosParamsSchema,
  EosParamsSchema,
  HandoffParamsSchema,
  GetDocParamsSchema,
  ListSessionsParamsSchema,
} from './tool-definitions'
import {
  executeSos,
  executeEosWithIdempotency,
  executeHandoff,
  executeGetDoc,
  executeListSessions,
} from './tool-executors'

// ============================================================================
// Protocol Handlers
// ============================================================================

/**
 * Handle MCP initialize request
 */
export function handleInitialize(id: string | number): McpResponse {
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
export function handleToolsList(id: string | number): McpResponse {
  return mcpSuccess(id, {
    tools: TOOL_DEFINITIONS,
  })
}

// ============================================================================
// Tool Dispatch
// ============================================================================

async function dispatchSos(
  id: string | number,
  toolArgs: Record<string, unknown>,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<unknown> {
  const validated = SosParamsSchema.parse(toolArgs)
  return executeSos(validated, env, actorKeyId, correlationId)
}

async function dispatchEos(
  id: string | number,
  toolArgs: Record<string, unknown>,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<McpResponse> {
  const validated = EosParamsSchema.parse(toolArgs)
  const outcome = await executeEosWithIdempotency(validated, env, actorKeyId, correlationId)

  if (outcome.cached !== undefined) {
    return mcpSuccess(id, { content: [{ type: 'text', text: JSON.stringify(outcome.cached) }] })
  }

  return mcpSuccess(id, {
    content: [{ type: 'text', text: JSON.stringify(outcome.result, null, 2) }],
  })
}

async function dispatchHandoff(
  id: string | number,
  toolArgs: Record<string, unknown>,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<unknown> {
  const validated = HandoffParamsSchema.parse(toolArgs)
  // Note: This needs session context - for now, we throw an error
  // In production, this would integrate with session tracking
  return executeHandoff(validated, env, actorKeyId, correlationId)
}

async function dispatchGetDoc(
  id: string | number,
  toolArgs: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  void id
  const validated = GetDocParamsSchema.parse(toolArgs)
  return executeGetDoc(validated, env)
}

async function dispatchListSessions(
  id: string | number,
  toolArgs: Record<string, unknown>,
  env: Env,
  actorKeyId: string
): Promise<unknown> {
  void id
  const validated = ListSessionsParamsSchema.parse(toolArgs)
  return executeListSessions(validated, env, actorKeyId)
}

// ============================================================================
// tools/call Handler
// ============================================================================

/**
 * Handle MCP tools/call request
 */
export async function handleToolsCall(
  id: string | number,
  params: Record<string, unknown>,
  env: Env,
  actorKeyId: string,
  correlationId: string
): Promise<McpResponse> {
  const toolName = params.name as string
  const toolArgs = (params.arguments || {}) as Record<string, unknown>

  try {
    // crane_eos dispatch returns a full McpResponse (idempotency handling)
    if (toolName === 'crane_eod' || toolName === 'crane_eos') {
      return dispatchEos(id, toolArgs, env, actorKeyId, correlationId)
    }

    let result: unknown

    switch (toolName) {
      case 'crane_sod': // backward compat alias
      case 'crane_sos':
        result = await dispatchSos(id, toolArgs, env, actorKeyId, correlationId)
        break

      case 'crane_handoff':
        result = await dispatchHandoff(id, toolArgs, env, actorKeyId, correlationId)
        break

      case 'crane_get_doc':
        result = await dispatchGetDoc(id, toolArgs, env)
        break

      case 'crane_list_sessions':
        result = await dispatchListSessions(id, toolArgs, env, actorKeyId)
        break

      default:
        return mcpError(id, MCP_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${toolName}`)
    }

    return mcpSuccess(id, {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
