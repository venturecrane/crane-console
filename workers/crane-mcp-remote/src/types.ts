import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  OAUTH_KV: KVNamespace
  CACHE_KV: KVNamespace
  MCP_OBJECT: DurableObjectNamespace
  MCP_OBJECT_VC: DurableObjectNamespace
  MCP_OBJECT_SS: DurableObjectNamespace
  MCP_OBJECT_KE: DurableObjectNamespace
  MCP_OBJECT_DFG: DurableObjectNamespace
  MCP_OBJECT_DC: DurableObjectNamespace
  CRANE_CONTEXT_API_URL: string
  CRANE_CONTEXT_KEY: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  COOKIE_ENCRYPTION_KEY: string
  ALLOWED_GITHUB_USERS: string
}

export type HonoBindings = Env & { OAUTH_PROVIDER: OAuthHelpers }

// User context from GitHub OAuth, encrypted in the auth token
// and provided to the McpAgent as this.props
export type Props = {
  login: string
  name: string
  email: string
  github_token: string
  // Present only when the GitHub App issues expiring user tokens. Absent for
  // non-expiring-App sessions and for any session connected before refresh
  // support shipped — both cases leave auto-refresh inert (see index.ts).
  github_refresh_token?: string
}
