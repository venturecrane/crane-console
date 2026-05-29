/**
 * OAuth utility functions for GitHub authorization flow.
 * Simplified from Cloudflare's remote-mcp-github-oauth template -
 * no approval dialog (GitHub's own consent page is sufficient).
 */

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

/**
 * Tokens returned by GitHub's token endpoint (code exchange or refresh).
 * `refreshToken`/`expiresIn` are present only when the GitHub App has
 * "Expire user authorization tokens" enabled; otherwise null (non-expiring
 * access token).
 */
export interface UpstreamTokens {
  accessToken: string
  refreshToken: string | null
  expiresIn: number | null
}

/**
 * Result of a refresh attempt. `transient` (5xx/network) is recoverable on a
 * later retry; `invalid_grant` (refresh token consumed or expired) requires the
 * user to reconnect the integration.
 */
export type RefreshResult =
  | { ok: true; tokens: UpstreamTokens }
  | { ok: false; kind: 'invalid_grant' | 'transient' }

/**
 * Build the upstream GitHub authorization URL.
 */
export function getUpstreamAuthorizeUrl(opts: {
  upstream_url: string
  client_id: string
  redirect_uri: string
  scope: string
  state?: string
}): string {
  const url = new URL(opts.upstream_url)
  url.searchParams.set('client_id', opts.client_id)
  url.searchParams.set('redirect_uri', opts.redirect_uri)
  url.searchParams.set('scope', opts.scope)
  url.searchParams.set('response_type', 'code')
  if (opts.state) url.searchParams.set('state', opts.state)
  return url.href
}

/**
 * Build the urlencoded body for a refresh_token grant. Pure/testable.
 */
export function buildRefreshRequestBody(opts: {
  client_id: string
  client_secret: string
  refresh_token: string
}): string {
  return new URLSearchParams({
    client_id: opts.client_id,
    client_secret: opts.client_secret,
    grant_type: 'refresh_token',
    refresh_token: opts.refresh_token,
  }).toString()
}

/**
 * Parse a GitHub token-endpoint JSON body into UpstreamTokens.
 * Returns null when no access_token is present (error body or malformed).
 * Pure/testable — no network, no logging.
 */
export function parseUpstreamTokenResponse(body: Record<string, unknown>): UpstreamTokens | null {
  const accessToken = typeof body.access_token === 'string' ? body.access_token : ''
  if (!accessToken) return null

  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : null

  // expires_in may arrive as a number or a numeric string depending on Accept handling.
  let expiresIn: number | null = null
  if (typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)) {
    expiresIn = body.expires_in
  } else if (typeof body.expires_in === 'string' && body.expires_in.trim() !== '') {
    const parsed = Number(body.expires_in)
    expiresIn = Number.isFinite(parsed) ? parsed : null
  }

  return { accessToken, refreshToken, expiresIn }
}

/**
 * Exchange a GitHub authorization code for tokens.
 * Returns [tokens, null] on success or [null, Response] on error.
 */
export async function fetchUpstreamAuthToken(opts: {
  upstream_url: string
  client_id: string
  client_secret: string
  code: string | undefined
  redirect_uri: string
}): Promise<[UpstreamTokens, null] | [null, Response]> {
  if (!opts.code) {
    return [null, new Response('Missing authorization code', { status: 400 })]
  }

  const resp = await fetch(opts.upstream_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: opts.client_id,
      client_secret: opts.client_secret,
      code: opts.code,
      redirect_uri: opts.redirect_uri,
    }).toString(),
  })

  if (!resp.ok) {
    // Status only — never log the response body (may echo the code/secret).
    console.error('GitHub token exchange failed:', resp.status)
    return [null, new Response('Failed to exchange authorization code', { status: 502 })]
  }

  const body = (await resp.json()) as Record<string, unknown>
  const tokens = parseUpstreamTokenResponse(body)
  if (!tokens) {
    return [null, new Response('No access token in GitHub response', { status: 502 })]
  }

  return [tokens, null]
}

/**
 * Refresh a GitHub user access token using a refresh_token grant.
 * Returns a discriminated result so callers can distinguish a genuine
 * reconnect-required failure (invalid_grant) from a transient one. Never logs
 * token values.
 */
export async function refreshUpstreamAuthToken(opts: {
  client_id: string
  client_secret: string
  refresh_token: string
}): Promise<RefreshResult> {
  let resp: Response
  try {
    resp = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: buildRefreshRequestBody(opts),
    })
  } catch {
    // Network failure — recoverable on a later refresh.
    return { ok: false, kind: 'transient' }
  }

  if (!resp.ok) {
    // 5xx is transient; 4xx means the refresh token is no longer usable.
    return { ok: false, kind: resp.status >= 500 ? 'transient' : 'invalid_grant' }
  }

  const body = (await resp.json().catch(() => null)) as Record<string, unknown> | null
  // GitHub returns 200 with an { error } body for a dead refresh token.
  if (body && typeof body.error === 'string') {
    return { ok: false, kind: 'invalid_grant' }
  }
  const tokens = body && parseUpstreamTokenResponse(body)
  if (!tokens) {
    return { ok: false, kind: 'invalid_grant' }
  }

  return { ok: true, tokens }
}
