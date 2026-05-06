#!/usr/bin/env node
/**
 * crane-mcp - MCP server for Venture Crane development workflow
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { TOOL_SCHEMAS } from './registry/tool-schemas.js'
import { dispatchTool } from './registry/dispatch.js'
import { logTokenUsage } from './lib/token-tracker.js'
import { refreshSessionHeartbeatIfNeeded, startHeartbeatTimer } from './lib/heartbeat-refresh.js'

const server = new Server(
  {
    name: 'crane-mcp',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

const STRUCTURED_TOOLS = new Set([
  'crane_sos',
  'crane_status',
  'crane_doc_audit',
  'crane_schedule',
  'crane_fleet_status',
  'crane_notes',
  'crane_ventures',
  'crane_context',
  'crane_worktree_doctor',
])

// Helper: log token usage for a tool call result
function logToolTokens(
  toolName: string,
  inputArgs: unknown,
  result: { content: Array<{ type: string; text: string }> },
  startMs: number
): void {
  try {
    const outputText = result.content.map((c) => c.text).join('')
    const inputStr = JSON.stringify(inputArgs)
    const ratio = STRUCTURED_TOOLS.has(toolName) ? 3.5 : 4.0
    logTokenUsage({
      timestamp: new Date().toISOString(),
      tool: toolName,
      venture: process.env.CRANE_VENTURE_CODE,
      est_input_tokens: Math.ceil(inputStr.length / ratio),
      est_output_tokens: Math.ceil(outputText.length / ratio),
      output_chars: outputText.length,
      duration_ms: Date.now() - startMs,
    })
  } catch {
    // Token logging is best-effort
  }
}

// Register tool list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOL_SCHEMAS }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const startMs = Date.now()

  // Keep the current session alive during tool-heavy work. Debounced
  // to ~10 min, fire-and-forget, never blocks or fails the tool call.
  // Safe to call on every tool (including crane_sos/crane_preflight)
  // because it is a no-op when session context is empty.
  refreshSessionHeartbeatIfNeeded()

  try {
    const result = await dispatchTool(name, args)
    if (!result.isError) {
      logToolTokens(name, args, result, startMs)
    }
    return result
  } catch (error) {
    const errorResult = {
      isError: true as const,
      content: [
        {
          type: 'text' as const,
          text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    }
    logToolTokens(name, args, errorResult, startMs)
    return errorResult
  }
})

// Start server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Install the background heartbeat timer. This covers the edge case
  // where MCP tool calls go sparse for 10+ minutes (long bash runs,
  // test suites, sub-agent delegation). The timer is .unref()'d so it
  // does not prevent process exit when stdin closes.
  startHeartbeatTimer()

  console.error('crane-mcp server started')
}

main().catch((error) => {
  console.error('Failed to start crane-mcp:', error)
  process.exit(1)
})
