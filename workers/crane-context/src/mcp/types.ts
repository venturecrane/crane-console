/**
 * MCP Protocol Types
 *
 * JSON-RPC 2.0 types and MCP error codes for the Crane Context MCP endpoint.
 */

export interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface McpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: McpError
}

export interface McpError {
  code: number
  message: string
  data?: unknown
}

/** MCP error codes (JSON-RPC standard + MCP extensions) */
export const MCP_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RATE_LIMITED: -32000,
} as const

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * Build MCP success response
 */
export function mcpSuccess(id: string | number, result: unknown): McpResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

/**
 * Build MCP error response
 */
export function mcpError(
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
