import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CraneContextClient } from './crane-api.js'
import { registerBriefingTools } from './tools/briefing.js'
import { registerDashboardTools, registerKnowledgeTools } from './tools/knowledge.js'
import type { VentureCode } from './ventures.js'

export function registerTools(
  server: McpServer,
  api: CraneContextClient,
  sessionVenture: VentureCode | null
): void {
  registerBriefingTools(server, api)
  registerDashboardTools(server, api, sessionVenture)
  registerKnowledgeTools(server, api, sessionVenture)
}
