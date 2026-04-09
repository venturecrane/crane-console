/**
 * crane-mcp-remote pure function tests.
 *
 * Tests for exported pure functions that don't require network access
 * or Cloudflare Worker runtime. Follows the crane-watch pattern of
 * testing validation and utility functions directly.
 */

import { describe, it, expect } from 'vitest'
import { validateOwnerRepo, OWNER_REPO_PATTERN } from '../src/github-api'
import { getUpstreamAuthorizeUrl } from '../src/utils'

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
