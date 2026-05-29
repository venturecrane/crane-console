/**
 * crane-mcp-remote pure function tests.
 *
 * Tests for exported pure functions that don't require network access
 * or Cloudflare Worker runtime. Follows the crane-watch pattern of
 * testing validation and utility functions directly.
 */

import { describe, it, expect } from 'vitest'
import { validateOwnerRepo, OWNER_REPO_PATTERN } from '../src/github-api'
import {
  getUpstreamAuthorizeUrl,
  buildRefreshRequestBody,
  parseUpstreamTokenResponse,
  type RefreshResult,
} from '../src/utils'
import {
  makeTokenExchangeCallback,
  GITHUB_DEFAULT_USER_TOKEN_TTL,
  REFRESH_TTL_FRACTION,
  TRANSIENT_RETRY_TTL,
} from '../src/token-exchange'

// ============================================================================
// validateOwnerRepo
// ============================================================================

describe('validateOwnerRepo', () => {
  describe('valid inputs', () => {
    it.each([
      ['venturecrane', 'standard alphanumeric'],
      ['crane-console', 'with hyphens'],
      ['my_repo', 'with underscores'],
      ['my.repo', 'with dots'],
      ['A123', 'starting with uppercase'],
      ['a', 'single character'],
    ])('accepts %s (%s)', (value) => {
      expect(() => validateOwnerRepo(value, 'owner')).not.toThrow()
    })
  })

  describe('invalid inputs', () => {
    it.each([
      ['', 'empty string'],
      ['-repo', 'starts with hyphen'],
      ['.repo', 'starts with dot'],
      ['_repo', 'starts with underscore'],
      ['repo name', 'contains spaces'],
      ['owner/repo', 'contains slash'],
      ['repo@tag', 'contains @'],
    ])('rejects %s (%s)', (value, _desc) => {
      expect(() => validateOwnerRepo(value, 'owner')).toThrow(/Invalid owner/)
    })

    it('includes the field name in the error message', () => {
      expect(() => validateOwnerRepo('', 'repo')).toThrow(/Invalid repo/)
    })

    it('includes the invalid value in the error message', () => {
      expect(() => validateOwnerRepo('-bad', 'owner')).toThrow(/"-bad"/)
    })
  })
})

describe('OWNER_REPO_PATTERN', () => {
  it('is a RegExp', () => {
    expect(OWNER_REPO_PATTERN).toBeInstanceOf(RegExp)
  })

  it('requires starting with alphanumeric', () => {
    expect(OWNER_REPO_PATTERN.test('abc')).toBe(true)
    expect(OWNER_REPO_PATTERN.test('-abc')).toBe(false)
  })
})

// ============================================================================
// getUpstreamAuthorizeUrl
// ============================================================================

describe('getUpstreamAuthorizeUrl', () => {
  const baseOpts = {
    upstream_url: 'https://github.com/login/oauth/authorize',
    client_id: 'test-client-id',
    redirect_uri: 'https://example.com/callback',
    scope: 'read:user repo',
  }

  it('returns a parseable URL', () => {
    const result = getUpstreamAuthorizeUrl(baseOpts)
    expect(() => new URL(result)).not.toThrow()
  })

  it('includes client_id parameter', () => {
    const url = new URL(getUpstreamAuthorizeUrl(baseOpts))
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
  })

  it('includes redirect_uri parameter', () => {
    const url = new URL(getUpstreamAuthorizeUrl(baseOpts))
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback')
  })

  it('includes scope parameter', () => {
    const url = new URL(getUpstreamAuthorizeUrl(baseOpts))
    expect(url.searchParams.get('scope')).toBe('read:user repo')
  })

  it('includes response_type=code', () => {
    const url = new URL(getUpstreamAuthorizeUrl(baseOpts))
    expect(url.searchParams.get('response_type')).toBe('code')
  })

  it('includes state when provided', () => {
    const url = new URL(getUpstreamAuthorizeUrl({ ...baseOpts, state: 'random-state-123' }))
    expect(url.searchParams.get('state')).toBe('random-state-123')
  })

  it('omits state when not provided', () => {
    const url = new URL(getUpstreamAuthorizeUrl(baseOpts))
    expect(url.searchParams.has('state')).toBe(false)
  })

  it('preserves the upstream URL base path', () => {
    const url = new URL(getUpstreamAuthorizeUrl(baseOpts))
    expect(url.origin).toBe('https://github.com')
    expect(url.pathname).toBe('/login/oauth/authorize')
  })
})

// ============================================================================
// buildRefreshRequestBody
// ============================================================================

describe('buildRefreshRequestBody', () => {
  const opts = {
    client_id: 'cid',
    client_secret: 'csecret',
    refresh_token: 'ghr_abc123',
  }

  it('sets grant_type=refresh_token and all credentials', () => {
    const params = new URLSearchParams(buildRefreshRequestBody(opts))
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(params.get('client_id')).toBe('cid')
    expect(params.get('client_secret')).toBe('csecret')
    expect(params.get('refresh_token')).toBe('ghr_abc123')
  })

  it('url-encodes special characters in the refresh token', () => {
    const body = buildRefreshRequestBody({ ...opts, refresh_token: 'a+b/c=d&e' })
    // Round-trips back to the original value, and the raw body is encoded.
    expect(new URLSearchParams(body).get('refresh_token')).toBe('a+b/c=d&e')
    expect(body).not.toContain('a+b/c=d&e')
  })
})

// ============================================================================
// parseUpstreamTokenResponse
// ============================================================================

describe('parseUpstreamTokenResponse', () => {
  it('parses a full expiring-token response', () => {
    expect(
      parseUpstreamTokenResponse({
        access_token: 'ghu_x',
        refresh_token: 'ghr_y',
        expires_in: 28800,
      })
    ).toEqual({ accessToken: 'ghu_x', refreshToken: 'ghr_y', expiresIn: 28800 })
  })

  it('parses a minimal non-expiring response (access token only) with nulls', () => {
    expect(parseUpstreamTokenResponse({ access_token: 'gho_x' })).toEqual({
      accessToken: 'gho_x',
      refreshToken: null,
      expiresIn: null,
    })
  })

  it('returns null when access_token is missing', () => {
    expect(parseUpstreamTokenResponse({ token_type: 'bearer' })).toBeNull()
  })

  it('returns null for a GitHub error-shaped body', () => {
    expect(parseUpstreamTokenResponse({ error: 'bad_refresh_token' })).toBeNull()
  })

  it('coerces a numeric-string expires_in', () => {
    expect(
      parseUpstreamTokenResponse({ access_token: 'ghu_x', expires_in: '28800' })?.expiresIn
    ).toBe(28800)
  })

  it('treats a non-numeric expires_in as null', () => {
    expect(
      parseUpstreamTokenResponse({ access_token: 'ghu_x', expires_in: 'soon' })?.expiresIn
    ).toBeNull()
  })
})

// ============================================================================
// makeTokenExchangeCallback — branch table
// ============================================================================

describe('makeTokenExchangeCallback', () => {
  const env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'csecret' }
  const EXPECTED_AUTH_TTL = Math.floor(GITHUB_DEFAULT_USER_TOKEN_TTL * REFRESH_TTL_FRACTION) // 21600

  // Build a TokenExchangeCallbackOptions-shaped object (callback reads only
  // grantType + props).
  const opts = (grantType: string, props: unknown) =>
    ({ grantType, props, clientId: 'c', userId: 'u', scope: [], requestedScope: [] }) as never

  // Refresh stub matching refreshUpstreamAuthToken's signature.
  const stub = (result: RefreshResult) => {
    const calls: Array<{ client_id: string; client_secret: string; refresh_token: string }> = []
    const fn = async (o: { client_id: string; client_secret: string; refresh_token: string }) => {
      calls.push(o)
      return result
    }
    return { fn, calls }
  }

  it('is inert (void) and never refreshes when no refresh token is present', async () => {
    const s = stub({ ok: false, kind: 'transient' })
    const cb = makeTokenExchangeCallback(env, s.fn)
    expect(await cb(opts('authorization_code', { github_token: 'ghu_x' }))).toBeUndefined()
    expect(await cb(opts('refresh_token', { github_token: 'ghu_x' }))).toBeUndefined()
    expect(s.calls).toHaveLength(0)
  })

  it('caps TTL on authorization_code when a refresh token exists (no upstream call)', async () => {
    const s = stub({ ok: false, kind: 'transient' })
    const cb = makeTokenExchangeCallback(env, s.fn)
    const result = await cb(
      opts('authorization_code', { github_token: 'ghu_x', github_refresh_token: 'ghr_y' })
    )
    expect(result).toEqual({ accessTokenTTL: EXPECTED_AUTH_TTL })
    expect(s.calls).toHaveLength(0)
  })

  it('refreshes on refresh_token grant, rotating both tokens and capping TTL', async () => {
    const s = stub({
      ok: true,
      tokens: { accessToken: 'ghu_new', refreshToken: 'ghr_new', expiresIn: 28800 },
    })
    const cb = makeTokenExchangeCallback(env, s.fn)
    const result = await cb(
      opts('refresh_token', {
        login: 'me',
        github_token: 'ghu_old',
        github_refresh_token: 'ghr_old',
      })
    )
    // Passes the stored refresh token + env credentials to GitHub.
    expect(s.calls[0]).toEqual({
      client_id: 'cid',
      client_secret: 'csecret',
      refresh_token: 'ghr_old',
    })
    const expected = {
      login: 'me',
      github_token: 'ghu_new',
      github_refresh_token: 'ghr_new',
    }
    expect(result).toEqual({
      accessTokenProps: expected,
      newProps: expected,
      accessTokenTTL: EXPECTED_AUTH_TTL,
    })
  })

  it('keeps the old refresh token if GitHub omits a rotated one', async () => {
    const s = stub({
      ok: true,
      tokens: { accessToken: 'ghu_new', refreshToken: null, expiresIn: null },
    })
    const cb = makeTokenExchangeCallback(env, s.fn)
    const result = (await cb(
      opts('refresh_token', { github_token: 'ghu_old', github_refresh_token: 'ghr_old' })
    )) as { newProps: { github_refresh_token: string }; accessTokenTTL: number }
    expect(result.newProps.github_refresh_token).toBe('ghr_old')
    // expires_in null → falls back to default lifetime.
    expect(result.accessTokenTTL).toBe(EXPECTED_AUTH_TTL)
  })

  it('returns a short retry TTL on transient failure, leaving props unchanged', async () => {
    const s = stub({ ok: false, kind: 'transient' })
    const cb = makeTokenExchangeCallback(env, s.fn)
    const result = await cb(
      opts('refresh_token', { github_token: 'ghu_old', github_refresh_token: 'ghr_old' })
    )
    expect(result).toEqual({ accessTokenTTL: TRANSIENT_RETRY_TTL })
  })

  it('returns void on invalid_grant (degrades to reconnect)', async () => {
    const s = stub({ ok: false, kind: 'invalid_grant' })
    const cb = makeTokenExchangeCallback(env, s.fn)
    expect(
      await cb(opts('refresh_token', { github_token: 'ghu_old', github_refresh_token: 'ghr_old' }))
    ).toBeUndefined()
  })
})
