/**
 * Tests for session-state.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'

const getModule = async () => {
  // Use dynamic import with resetModules to get fresh module state
  const { vi } = await import('vitest')
  vi.resetModules()
  return import('./session-state.js')
}

describe('session-state', () => {
  // Each test gets a fresh module to avoid cross-contamination
  it('returns null when no session is set', async () => {
    const { getSessionContext } = await getModule()
    expect(getSessionContext()).toBeNull()
  })

  it('stores and retrieves session context', async () => {
    const { setSession, getSessionContext } = await getModule()

    setSession('sess_123', 'vc', 'venturecrane/crane-console')

    const ctx = getSessionContext()
    expect(ctx).toEqual({
      sessionId: 'sess_123',
      venture: 'vc',
      repo: 'venturecrane/crane-console',
    })
  })

  it('overwrites previous session on re-set', async () => {
    const { setSession, getSessionContext } = await getModule()

    setSession('sess_1', 'vc', 'venturecrane/crane-console')
    setSession('sess_2', 'ke', 'kidexpenses/ke-console')

    const ctx = getSessionContext()
    expect(ctx).toEqual({
      sessionId: 'sess_2',
      venture: 'ke',
      repo: 'kidexpenses/ke-console',
    })
  })

  it('clears session context', async () => {
    const { setSession, getSessionContext, clearSession } = await getModule()

    setSession('sess_123', 'vc', 'venturecrane/crane-console')
    expect(getSessionContext()).not.toBeNull()

    clearSession()
    expect(getSessionContext()).toBeNull()
  })
})
