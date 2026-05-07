import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CraneContextClient } from './crane-api.js'
import { registerBriefingTools } from './tools/briefing.js'
import { registerDashboardTools, registerKnowledgeTools } from './tools/knowledge.js'

export function registerTools(server: McpServer, api: CraneContextClient): void {
  registerBriefingTools(server, api)
  registerDashboardTools(server, api)
  registerKnowledgeTools(server, api)
}
