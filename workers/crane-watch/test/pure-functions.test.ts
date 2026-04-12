/**
 * Unit Tests: Crane Watch Pure Functions
 *
 * Tests the pure, side-effect-free functions exported from the watch worker.
 */

import { describe, it, expect } from 'vitest'
import { validateGitHubSignature } from '../src/index'

// ============================================================================
// validateGitHubSignature
// ============================================================================

describe('validateGitHubSignature', () => {
  // Helper to compute expected HMAC-SHA256 signature
  async function computeHmacSig(body: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  it('returns true for a valid signature', async () => {
    const body = '{"action":"opened","issue":{"number":1}}'
    const secret = 'test-webhook-secret'
    const hmac = await computeHmacSig(body, secret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(true)
  })

  it('returns false for an invalid signature', async () => {
    const body = '{"action":"opened"}'
    const secret = 'test-webhook-secret'
    const signature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000'

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(false)
  })

  it('returns false when signature is null', async () => {
    const result = await validateGitHubSignature('body', null, 'secret')
    expect(result).toBe(false)
  })

  it('returns false when secret is empty', async () => {
    const result = await validateGitHubSignature('body', 'sha256=abc', '')
    expect(result).toBe(false)
  })

  it('returns false when body has been tampered with', async () => {
    const originalBody = '{"action":"opened"}'
    const secret = 'my-secret'
    const hmac = await computeHmacSig(originalBody, secret)
    const signature = `sha256=${hmac}`

    // Tamper with the body
    const tamperedBody = '{"action":"closed"}'
    const result = await validateGitHubSignature(tamperedBody, signature, secret)
    expect(result).toBe(false)
  })

  it('returns false when signed with wrong secret', async () => {
    const body = '{"action":"opened"}'
    const wrongSecret = 'wrong-secret'
    const correctSecret = 'correct-secret'
    const hmac = await computeHmacSig(body, wrongSecret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, correctSecret)
    expect(result).toBe(false)
  })

  it('handles empty body with valid signature', async () => {
    const body = ''
    const secret = 'test-secret'
    const hmac = await computeHmacSig(body, secret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(true)
  })

  it('handles body with unicode characters', async () => {
    const body = '{"title":"Fix bug in cafe\u0301 module"}'
    const secret = 'unicode-secret'
    const hmac = await computeHmacSig(body, secret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(true)
  })
})
