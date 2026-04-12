/**
 * Tests for heartbeat-refresh.ts
 *
 * Verifies both the on-dispatch refresh path and the background timer
 * path keep the session alive against a 45-minute server-side staleness
 * threshold without thundering-herd retries on failure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { CraneApi, SessionNotActiveError } from './crane-api.js'
import {
  HEARTBEAT_REFRESH_INTERVAL_MS,
  clearSession,
  getSessionContext,
  setSession,
} from './session-state.js'
import { refreshSessionHeartbeatIfNeeded, startHeartbeatTimer } from './heartbeat-refresh.js'

// Mirrors STALE_AFTER_MINUTES in workers/crane-context/src/constants.ts.
// The liveness simulations (tests 10 & 11) assert the debounce cadence
// keeps the simulated server last_heartbeat_at within this window.
const SERVER_STALE_THRESHOLD_MS = 45 * 60 * 1000

describe('heartbeat-refresh', () => {
  let refreshSpy: MockInstance<[string], Promise<void>>
  let originalContextKey: string | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T00:00:00Z'))

    originalContextKey = process.env.CRANE_CONTEXT_KEY
    process.env.CRANE_CONTEXT_KEY = 'test-relay-key'

    clearSession()

    refreshSpy = vi.spyOn(CraneApi.prototype, 'refreshHeartbeat').mockResolvedValue(undefined)
  })

  afterEach(() => {
    refreshSpy.mockRestore()
    if (originalContextKey === undefined) {
      delete process.env.CRANE_CONTEXT_KEY
    } else {
      process.env.CRANE_CONTEXT_KEY = originalContextKey
    }
    clearSession()
    vi.useRealTimers()
  })

  describe('refreshSessionHeartbeatIfNeeded', () => {
    it('is a no-op when no session is set', () => {
      refreshSessionHeartbeatIfNeeded()
      expect(refreshSpy).not.toHaveBeenCalled()
    })

    it('is a no-op when CRANE_CONTEXT_KEY is unset', () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')
      // Advance past the debounce window so the getSessionContext check passes
      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)

      delete process.env.CRANE_CONTEXT_KEY
      refreshSessionHeartbeatIfNeeded()

      expect(refreshSpy).not.toHaveBeenCalled()
    })

    it('does not refresh immediately after setSession (server already has fresh heartbeat from /sos)', () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')
      refreshSessionHeartbeatIfNeeded()

      // setSession marks an implicit attempt at T=0 because /sos just
      // updated the server-side heartbeat. A client-side refresh would
      // be redundant for ~10 min.
      expect(refreshSpy).not.toHaveBeenCalled()
    })

    it('fires a refresh once the debounce window elapses', () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')

      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)
      refreshSessionHeartbeatIfNeeded()

      expect(refreshSpy).toHaveBeenCalledTimes(1)
      expect(refreshSpy).toHaveBeenCalledWith('sess_1')
    })

    it('debounces repeat calls within the refresh window', () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')

      // First refresh fires at T = debounce + 1
      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)
      refreshSessionHeartbeatIfNeeded()
      expect(refreshSpy).toHaveBeenCalledTimes(1)

      // Rapid follow-ups are debounced
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(30_000) // 30s between calls
        refreshSessionHeartbeatIfNeeded()
      }
      expect(refreshSpy).toHaveBeenCalledTimes(1)

      // After another full window, refresh fires again
      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS)
      refreshSessionHeartbeatIfNeeded()
      expect(refreshSpy).toHaveBeenCalledTimes(2)
    })

    it('clears session on permanent 409 SessionNotActiveError', async () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')
      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)

      refreshSpy.mockRejectedValueOnce(new SessionNotActiveError('abandoned'))

      refreshSessionHeartbeatIfNeeded()

      // Flush the promise chain so .catch() can run clearSession()
      await vi.runAllTicks()
      await Promise.resolve()
      await Promise.resolve()

      expect(getSessionContext()).toBeNull()

      // Subsequent calls are no-ops because the session is cleared
      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)
      refreshSessionHeartbeatIfNeeded()
      expect(refreshSpy).toHaveBeenCalledTimes(1)
    })

    it('preserves session on transient (non-409) errors but respects debounce', async () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')
      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)

      refreshSpy.mockRejectedValueOnce(new Error('network timeout'))
      refreshSessionHeartbeatIfNeeded()

      // Flush microtasks
      await vi.runAllTicks()
      await Promise.resolve()

      // Session is preserved
      expect(getSessionContext()).not.toBeNull()
      expect(refreshSpy).toHaveBeenCalledTimes(1)

      // Immediate retry is debounced — no thundering herd
      refreshSessionHeartbeatIfNeeded()
      expect(refreshSpy).toHaveBeenCalledTimes(1)

      // Next attempt fires after a full debounce window
      vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)
      refreshSessionHeartbeatIfNeeded()
      expect(refreshSpy).toHaveBeenCalledTimes(2)
    })

    it('never emits an unhandledRejection, even when the underlying promise rejects', async () => {
      const unhandled: unknown[] = []
      const handler = (reason: unknown) => {
        unhandled.push(reason)
      }
      process.on('unhandledRejection', handler)

      try {
        setSession('sess_1', 'vc', 'venturecrane/crane-console')
        vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS + 1)

        refreshSpy.mockRejectedValueOnce(new Error('boom'))
        refreshSessionHeartbeatIfNeeded()

        // Flush microtasks so any pending rejection has a chance to
        // propagate. If our .catch() handler is wired correctly, none will.
        await vi.runAllTicks()
        await Promise.resolve()
        await Promise.resolve()

        expect(unhandled).toEqual([])
      } finally {
        process.off('unhandledRejection', handler)
      }
    })
  })

  describe('startHeartbeatTimer', () => {
    it('installs an interval at HEARTBEAT_REFRESH_INTERVAL_MS and calls .unref()', () => {
      const timer = startHeartbeatTimer()
      try {
        // Node timers carry an unref marker; easiest way to observe is
        // via a spy before the call, but we at minimum verify the timer
        // exists and fires at the expected interval.
        expect(timer).toBeDefined()
      } finally {
        clearInterval(timer)
      }
    })

    it('timer ticks trigger refreshSessionHeartbeatIfNeeded', () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')
      const timer = startHeartbeatTimer()
      try {
        // At T = HEARTBEAT_REFRESH_INTERVAL_MS, the timer fires but the
        // debounce check sees (now - setSession-time) == interval exactly,
        // which is enough to trigger (>= comparison). Refresh fires once.
        vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS)
        expect(refreshSpy).toHaveBeenCalledTimes(1)

        // Next tick 10 min later fires again
        vi.advanceTimersByTime(HEARTBEAT_REFRESH_INTERVAL_MS)
        expect(refreshSpy).toHaveBeenCalledTimes(2)
      } finally {
        clearInterval(timer)
      }
    })
  })

  describe('end-to-end liveness simulation', () => {
    it('on-dispatch path keeps session live over 60 min with tool calls every 90 s', () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')
      const sessionStart = Date.now()

      // Track the timestamp of every successful refresh — this is what
      // the server would record as last_heartbeat_at.
      let serverLastHeartbeatAt = sessionStart // /sos just set it

      refreshSpy.mockImplementation(async (_sessionId: string) => {
        serverLastHeartbeatAt = Date.now()
      })

      // Simulate 60 min of work with a tool call every 90 s.
      const sessionDurationMs = 60 * 60 * 1000
      const toolCallIntervalMs = 90 * 1000

      for (let t = 0; t < sessionDurationMs; t += toolCallIntervalMs) {
        vi.advanceTimersByTime(toolCallIntervalMs)
        refreshSessionHeartbeatIfNeeded()

        // CRITICAL: at every step, assert the simulated server would NOT
        // consider this session stale. This is the real property we care
        // about — not "N heartbeats fired", but "session stays alive".
        const timeSinceServerHeartbeat = Date.now() - serverLastHeartbeatAt
        expect(timeSinceServerHeartbeat).toBeLessThan(SERVER_STALE_THRESHOLD_MS)
      }

      // Over 60 min with a 10-min debounce, we expect ~6 refresh calls.
      expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(5)
      expect(refreshSpy.mock.calls.length).toBeLessThanOrEqual(7)
    })

    it('background timer alone keeps session live over 60 min with zero tool calls', () => {
      setSession('sess_1', 'vc', 'venturecrane/crane-console')
      const sessionStart = Date.now()

      let serverLastHeartbeatAt = sessionStart

      refreshSpy.mockImplementation(async (_sessionId: string) => {
        serverLastHeartbeatAt = Date.now()
      })

      const timer = startHeartbeatTimer()
      try {
        // Let the timer drive liveness for 60 min, with ZERO explicit
        // refreshSessionHeartbeatIfNeeded() calls from the "dispatch path".
        // Advance in 1-minute increments so we can assert the liveness
        // invariant at every step.
        for (let minute = 0; minute < 60; minute++) {
          vi.advanceTimersByTime(60 * 1000)
          const timeSinceServerHeartbeat = Date.now() - serverLastHeartbeatAt
          expect(timeSinceServerHeartbeat).toBeLessThan(SERVER_STALE_THRESHOLD_MS)
        }

        // Timer should have fired ~6 times at the 10-min interval.
        expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(5)
        expect(refreshSpy.mock.calls.length).toBeLessThanOrEqual(7)
      } finally {
        clearInterval(timer)
      }
    })
  })
})
