import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  OAUTH_KV: KVNamespace
  CACHE_KV: KVNamespace
  MCP_OBJECT: DurableObjectNamespace
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
}
