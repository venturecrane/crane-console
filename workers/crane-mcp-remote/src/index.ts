/**
 * Crane MCP Remote Worker
 *
 * Serves the MCP protocol over Streamable HTTP for remote clients
 * (claude.ai, Claude Code via --transport http). Authenticates
 * via GitHub OAuth using the existing venturecrane-github App.
 *
 * Architecture:
 * - OAuthProvider handles DCR, token endpoints, and auth flow
 * - McpAgent (Durable Object) handles MCP protocol per session
 * - CraneContextClient proxies API calls to crane-context worker
 * - KV provides OAuth storage and read cache fallback
 */

import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpAgent } from 'agents/mcp'
import { CraneContextClient } from './crane-api.js'
import { GitHubApiClient } from './github-api.js'
import { GitHubHandler } from './github-handler.js'
import { registerGitHubTools } from './github-tools.js'
import { registerTools } from './tools.js'
import type { Env, Props } from './types.js'

export class CraneMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'crane-mcp-remote',
    version: '1.0.0',
  })

  async init() {
    const api = new CraneContextClient(
      this.env.CRANE_CONTEXT_API_URL,
      this.env.CRANE_CONTEXT_KEY,
      this.props?.login || 'anonymous',
      this.env.CACHE_KV
    )

    const github = new GitHubApiClient(
      this.props?.github_token || '',
      this.props?.login || 'anonymous'
    )

    registerTools(this.server, api)
    registerGitHubTools(this.server, github)
  }
}

export default new OAuthProvider({
  apiHandler: CraneMCP.serve('/mcp'),
  apiRoute: '/mcp',
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  // Hono's fetch signature doesn't exactly match ExportedHandler - safe to cast
  defaultHandler: GitHubHandler as never,
})
