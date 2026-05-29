/**
 * OAuthProvider token-exchange callback for keeping the upstream GitHub user
 * token alive. Isolated from index.ts so it can be unit-tested without pulling
 * in the Workers/MCP runtime (this module depends only on utils + types).
 *
 * Lib types are imported type-only (erased at runtime) so tests don't load the
 * oauth-provider package; `grantType` is compared against its string values.
 */

import type {
  TokenExchangeCallbackOptions,
  TokenExchangeCallbackResult,
} from '@cloudflare/workers-oauth-provider'
import type { Env, Props } from './types.js'
import { refreshUpstreamAuthToken } from './utils.js'

// GitHub user access tokens live 8h; refresh tokens 6mo (docs.github.com).
export const GITHUB_DEFAULT_USER_TOKEN_TTL = 28800
// Cap the downstream (claude.ai↔worker) token below the upstream lifetime so
// the client refreshes early — that refresh re-enters the callback and renews
// the GitHub token while it still has headroom, avoiding an expiry-boundary race.
export const REFRESH_TTL_FRACTION = 0.75
// On a transient refresh failure, issue a short-lived downstream token so the
// client retries the refresh soon and auto-recovers without user action.
export const TRANSIENT_RETRY_TTL = 300

/**
 * Build the token-exchange callback. `env` supplies the OAuth client
 * credentials (the callback args do not carry env); `refresh` is injectable
 * for tests.
 *
 * Inert when the grant has no `github_refresh_token` — i.e. the GitHub App
 * issues non-expiring tokens, or the session predates refresh support. Those
 * keep their existing behavior untouched.
 */
export function makeTokenExchangeCallback(
  env: Pick<Env, 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET'>,
  refresh: typeof refreshUpstreamAuthToken = refreshUpstreamAuthToken
) {
  return async (
    options: TokenExchangeCallbackOptions
  ): Promise<TokenExchangeCallbackResult | void> => {
    const props = options.props as Props
    const refreshToken = props?.github_refresh_token
    if (!refreshToken) return

    const grantType = options.grantType as string

    if (grantType === 'authorization_code') {
      // Props (incl. github_token) are already set by the GitHub handler; only
      // cap the downstream TTL so the refresh loop starts.
      return { accessTokenTTL: Math.floor(GITHUB_DEFAULT_USER_TOKEN_TTL * REFRESH_TTL_FRACTION) }
    }

    if (grantType === 'refresh_token') {
      const result = await refresh({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        refresh_token: refreshToken,
      })
      if (!result.ok) {
        // transient → short TTL so the client retries soon (auto-recover).
        // invalid_grant → leave props; next github_* call 401s → reconnect message.
        return result.kind === 'transient' ? { accessTokenTTL: TRANSIENT_RETRY_TTL } : undefined
      }
      const next: Props = {
        ...props,
        github_token: result.tokens.accessToken,
        // GitHub rotates the refresh token on every refresh — persist the new one.
        github_refresh_token: result.tokens.refreshToken ?? props.github_refresh_token,
      }
      const ttlBase = result.tokens.expiresIn ?? GITHUB_DEFAULT_USER_TOKEN_TTL
      return {
        accessTokenProps: next,
        newProps: next,
        accessTokenTTL: Math.floor(ttlBase * REFRESH_TTL_FRACTION),
      }
    }

    return
  }
}
