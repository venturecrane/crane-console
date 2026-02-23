/**
 * OAuth utility functions for GitHub authorization flow.
 * Simplified from Cloudflare's remote-mcp-github-oauth template -
 * no approval dialog (GitHub's own consent page is sufficient).
 */

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
 * Exchange a GitHub authorization code for an access token.
 * Returns [accessToken, null] on success or [null, Response] on error.
 */
export async function fetchUpstreamAuthToken(opts: {
  upstream_url: string
  client_id: string
  client_secret: string
  code: string | undefined
  redirect_uri: string
}): Promise<[string, null] | [null, Response]> {
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
    console.error('GitHub token exchange failed:', await resp.text())
    return [null, new Response('Failed to exchange authorization code', { status: 502 })]
  }

  const body = (await resp.json()) as Record<string, string>
  const accessToken = body.access_token
  if (!accessToken) {
    return [null, new Response('No access token in GitHub response', { status: 502 })]
  }

  return [accessToken, null]
}
