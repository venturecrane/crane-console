#!/usr/bin/env node
/**
 * crane-mcp - MCP server for Venture Crane development workflow
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { refreshSessionHeartbeatIfNeeded, startHeartbeatTimer } from './lib/heartbeat-refresh.js'
import { ALL_TOOLS, TOOL_REGISTRY } from './registry/index.js'
import { dispatchTool } from './tool-runtime.js'

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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_TOOLS.map((entry) => entry.definition),
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const startMs = Date.now()

  // Keep the current session alive during tool-heavy work. Debounced
  // to ~10 min, fire-and-forget, never blocks or fails the tool call.
  // Safe to call on every tool (including crane_sos/crane_preflight)
  // because it is a no-op when session context is empty.
  refreshSessionHeartbeatIfNeeded()

  return dispatchTool(TOOL_REGISTRY, name, args, startMs)
})

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
