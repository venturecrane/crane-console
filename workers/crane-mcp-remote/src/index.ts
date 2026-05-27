/**
 * Crane MCP Remote Worker
 *
 * Serves the MCP protocol over Streamable HTTP for remote clients
 * (claude.ai, Claude Code via --transport http). Authenticates
 * via GitHub OAuth using the existing venturecrane-github App.
 *
 * Architecture:
 * - OAuthProvider handles DCR, token endpoints, and auth flow
 * - One McpAgent subclass per venture (CraneMCPLegacy + CraneMCPVc/Ss/Ke/Dfg/Dc)
 *   so each venture-bound URL gets its own DO binding and its tools
 *   auto-scope to that venture.
 * - CraneContextClient proxies API calls to crane-context worker
 * - KV provides OAuth storage and read cache fallback
 *
 * Routing:
 *   /mcp           → CraneMCPLegacy (no venture binding, kept for rollback)
 *   /mcp/vc        → CraneMCPVc     (venture = vc)
 *   /mcp/ss        → CraneMCPSs     (venture = ss)
 *   /mcp/ke        → CraneMCPKe     (venture = ke)
 *   /mcp/dfg       → CraneMCPDfg    (venture = dfg)
 *   /mcp/dc        → CraneMCPDc     (venture = dc)
 */

import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpAgent } from 'agents/mcp'
import { CraneContextClient } from './crane-api.js'
import { GitHubApiClient } from './github-api.js'
import { GitHubHandler } from './github-handler.js'
import { registerGitHubTools } from './github-tools.js'
import { registerTools } from './tools.js'
import { textResult, type ToolResult } from './tools/shared.js'
import type { Env, Props } from './types.js'
import { getVenture, type VentureCode } from './ventures.js'
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

/**
 * Base McpAgent. Subclasses set `static venture` to bind the session to
 * a specific venture; tools then auto-inject that venture as the default
 * scope. The legacy class leaves it null (venture-unbound, requires
 * explicit args in tool calls).
 */
abstract class CraneMCPBase extends McpAgent<Env, Record<string, never>, Props> {
  abstract readonly venture: VentureCode | null
  private boundAt: string = new Date().toISOString()

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

    registerTools(this.server, api, this.venture)
    registerGitHubTools(this.server, github, this.venture)
    this.registerHealthTool(api, github)
  }

  private registerHealthTool(api: CraneContextClient, github: GitHubApiClient): void {
    const venture = this.venture
    const boundAt = this.boundAt
    const env = this.env
    const login = this.props?.login || 'anonymous'

    this.server.tool(
      'crane_health',
      'Diagnostic. Returns the live health of crane-context, GitHub auth, and venture binding. Call this when tool results look wrong or stale, to surface the actual failure mode.',
      {},
      async (): Promise<ToolResult> => {
        const [ctxStatus, ghStatus] = await Promise.all([
          checkCraneContext(api),
          checkGitHub(github, env, login),
        ])
        const v = getVenture(venture)
        const lines = [
          '## Crane MCP Health',
          '',
          `### crane-context: ${ctxStatus.status}`,
          `- Endpoint: ${env.CRANE_CONTEXT_API_URL}`,
          ...(ctxStatus.lastError ? [`- Last error: ${ctxStatus.lastError}`] : []),
          '',
          `### github: ${ghStatus.status}`,
          `- Authenticated as: ${ghStatus.login ?? 'unknown'}`,
          `- Scopes: ${ghStatus.scopes.length ? ghStatus.scopes.join(', ') : '(none)'}`,
          `- Allowlist member: ${ghStatus.allowlistMember}`,
          ...(ghStatus.lastError ? [`- Last error: ${ghStatus.lastError}`] : []),
          '',
          `### venture binding`,
          v
            ? `- Bound to: ${v.name} (${v.code}) → ${v.repo.owner}/${v.repo.repo}`
            : `- Bound to: NONE (legacy /mcp endpoint — connect via /mcp/{venture} for auto-scoping)`,
          `- Bound at: ${boundAt}`,
          '',
          ctxStatus.status === 'ok' && ghStatus.status === 'ok'
            ? 'All checks passed. Tool results should be reliable.'
            : 'One or more subsystems degraded — mention this in any answer that depends on the affected data.',
        ]
        return textResult(lines.join('\n'))
      }
    )
  }
}

async function checkCraneContext(
  api: CraneContextClient
): Promise<{ status: 'ok' | 'down'; lastError?: string }> {
  try {
    const ok = await api.healthCheck()
    return ok ? { status: 'ok' } : { status: 'down', lastError: 'healthCheck returned false' }
  } catch (err) {
    return { status: 'down', lastError: err instanceof Error ? err.message : String(err) }
  }
}

async function checkGitHub(
  client: GitHubApiClient,
  env: Env,
  expectedLogin: string
): Promise<{
  status: 'ok' | 'reconnect_needed' | 'down'
  login?: string
  scopes: string[]
  allowlistMember: boolean
  lastError?: string
}> {
  if (!client.hasToken) {
    return {
      status: 'reconnect_needed',
      scopes: [],
      allowlistMember: false,
      lastError:
        'no GitHub token in session props — reconnect the integration via claude.ai Settings > Integrations',
    }
  }
  try {
    const { user, scopes } = await client.getAuthenticatedUser()
    const login = typeof user.login === 'string' ? user.login : expectedLogin
    const scopeList =
      scopes && scopes !== 'unknown'
        ? scopes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    const allowed = (env.ALLOWED_GITHUB_USERS || '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean)
    const allowlistMember = allowed.length === 0 || allowed.includes(login.toLowerCase())
    return {
      status: 'ok',
      login,
      scopes: scopeList,
      allowlistMember,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      status: msg.includes('401') ? 'reconnect_needed' : 'down',
      scopes: [],
      allowlistMember: false,
      lastError: msg,
      login: expectedLogin,
    }
  }
}

// ── Per-venture subclasses ────────────────────────────────────────────────────

export class CraneMCP extends CraneMCPBase {
  readonly venture = null
}
export class CraneMCPVc extends CraneMCPBase {
  readonly venture: VentureCode = 'vc'
}
export class CraneMCPSs extends CraneMCPBase {
  readonly venture: VentureCode = 'ss'
}
export class CraneMCPKe extends CraneMCPBase {
  readonly venture: VentureCode = 'ke'
}
export class CraneMCPDfg extends CraneMCPBase {
  readonly venture: VentureCode = 'dfg'
}
export class CraneMCPDc extends CraneMCPBase {
  readonly venture: VentureCode = 'dc'
}

// ── OAuth + routing ───────────────────────────────────────────────────────────

const oauthHandler = new OAuthProvider({
  apiHandlers: {
    '/mcp/vc': CraneMCPVc.serve('/mcp/vc', { binding: 'MCP_OBJECT_VC' }),
    '/mcp/ss': CraneMCPSs.serve('/mcp/ss', { binding: 'MCP_OBJECT_SS' }),
    '/mcp/ke': CraneMCPKe.serve('/mcp/ke', { binding: 'MCP_OBJECT_KE' }),
    '/mcp/dfg': CraneMCPDfg.serve('/mcp/dfg', { binding: 'MCP_OBJECT_DFG' }),
    '/mcp/dc': CraneMCPDc.serve('/mcp/dc', { binding: 'MCP_OBJECT_DC' }),
    // Legacy: venture-unbound endpoint, kept for rollback safety. Will be
    // retired in Phase 6 once all 5 venture projects pass smoke tests.
    '/mcp': CraneMCP.serve('/mcp'),
  },
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
