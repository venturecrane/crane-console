/**
 * GitHub OAuth handler for the MCP remote worker.
 *
 * Handles /authorize and /callback routes. When a user connects via
 * claude.ai, OAuthProvider routes them here for GitHub authentication.
 * After successful auth, the user's GitHub login is checked against
 * ALLOWED_GITHUB_USERS before completing authorization.
 */

import type { AuthRequest } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import type { HonoBindings } from './types.js'
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from './utils.js'

const app = new Hono<{ Bindings: HonoBindings }>()

/**
 * GET /authorize - Redirect to GitHub for authentication.
 * No intermediate approval dialog - GitHub's consent page is sufficient.
 */
app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
  if (!oauthReqInfo.clientId) {
    return c.text('Invalid OAuth request: missing client_id', 400)
  }

  // Store OAuth request info in KV for the callback
  const stateToken = crypto.randomUUID()
  await c.env.OAUTH_KV.put(`oauth_state:${stateToken}`, JSON.stringify(oauthReqInfo), {
    expirationTtl: 600,
  })

  // Redirect to GitHub
  const authorizeUrl = getUpstreamAuthorizeUrl({
    upstream_url: 'https://github.com/login/oauth/authorize',
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: new URL('/callback', c.req.url).href,
    scope: 'read:user user:email',
    state: stateToken,
  })

  return c.redirect(authorizeUrl)
})

/**
 * GET /callback - Handle GitHub OAuth callback.
 * Exchanges code for token, verifies user is in allowlist,
 * then completes the OAuth flow back to claude.ai.
 */
app.get('/callback', async (c) => {
  // Validate state parameter
  const stateToken = c.req.query('state')
  if (!stateToken) {
    return c.text('Missing state parameter', 400)
  }

  const stored = await c.env.OAUTH_KV.get(`oauth_state:${stateToken}`)
  if (!stored) {
    return c.text('Invalid or expired state. Please try connecting again.', 400)
  }

  // Clean up used state
  await c.env.OAUTH_KV.delete(`oauth_state:${stateToken}`)

  const oauthReqInfo = JSON.parse(stored) as AuthRequest
  if (!oauthReqInfo.clientId) {
    return c.text('Invalid OAuth request data', 400)
  }

  // Exchange code for GitHub access token
  const [accessToken, errResponse] = await fetchUpstreamAuthToken({
    upstream_url: 'https://github.com/login/oauth/access_token',
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    code: c.req.query('code'),
    redirect_uri: new URL('/callback', c.req.url).href,
  })
  if (errResponse) return errResponse

  // Get GitHub user info
  const userResp = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'crane-mcp-remote',
      Accept: 'application/vnd.github+json',
    },
  })
  if (!userResp.ok) {
    console.error('GitHub user fetch failed:', userResp.status)
    return c.text('Failed to fetch GitHub user info', 502)
  }

  const user = (await userResp.json()) as {
    login: string
    name: string | null
    email: string | null
  }

  // Check allowlist
  const allowedUsers = c.env.ALLOWED_GITHUB_USERS.split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean)

  if (allowedUsers.length > 0 && !allowedUsers.includes(user.login.toLowerCase())) {
    console.warn(`Unauthorized GitHub user attempted access: ${user.login}`)
    return c.text('Access denied. Your GitHub account is not authorized.', 403)
  }

  // Complete the OAuth flow - props are encrypted into the token
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: user.login,
    metadata: {
      label: user.name || user.login,
    },
    scope: oauthReqInfo.scope,
    props: {
      login: user.login,
      name: user.name || user.login,
      email: user.email || '',
    },
  })

  return c.redirect(redirectTo)
})

export { app as GitHubHandler }
