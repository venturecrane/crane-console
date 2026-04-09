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
import { BUILD_INFO } from './generated/build-info.js'

// Plan v3.1 §D.1: /version endpoint. Cloudflare Workers forbid wall-clock
// access at module load (returns 1970-01-01). Capture lazily on first
// request. OAuthProvider wraps the default handler but /version is
// intercepted BEFORE OAuth dispatch so it requires no auth.
let COLD_START_AT: string | null = null

function handleVersion(env: Env): Response {
  if (COLD_START_AT === null) {
    COLD_START_AT = new Date().toISOString()
  }
  const body = {
    service: BUILD_INFO.service,
    commit: BUILD_INFO.commit,
    commit_short: BUILD_INFO.commit_short,
    build_timestamp: BUILD_INFO.build_timestamp,
    deployed_at: COLD_START_AT,
    schema_hash: null,
    schema_version: null,
    migrations_applied: [] as string[],
    features_enabled: {} as Record<string, boolean>,
    environment: (env as unknown as { ENVIRONMENT?: string }).ENVIRONMENT || 'unknown',
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

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

const oauthHandler = new OAuthProvider({
  apiHandler: CraneMCP.serve('/mcp'),
  apiRoute: '/mcp',
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  // Hono's fetch signature doesn't exactly match ExportedHandler - safe to cast
  defaultHandler: GitHubHandler as never,
})

// Plan v3.1 §D.1: intercept /version BEFORE OAuthProvider so it requires
// no authentication. Everything else falls through to the OAuth-wrapped
// handler unchanged.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/version' && request.method === 'GET') {
      return handleVersion(env)
    }
    return oauthHandler.fetch(request, env, ctx)
  },
}
