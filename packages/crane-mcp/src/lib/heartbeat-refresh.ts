/**
 * Client-side session heartbeat refresh.
 *
 * Keeps long sessions alive against the crane-context server's 45-minute
 * staleness threshold (STALE_AFTER_MINUTES in workers/crane-context/src/constants.ts).
 *
 * Two code paths call refreshSessionHeartbeatIfNeeded:
 *
 * 1. The MCP tool dispatch handler in src/index.ts — runs before every
 *    tool call, naturally keeps the session alive during active work.
 *
 * 2. A background setInterval timer installed by startHeartbeatTimer() —
 *    fires every 10 min regardless of tool activity, covering the edge
 *    case where tool calls go sparse (long bash runs, test suites,
 *    sub-agent delegation where no MCP calls happen for 10+ minutes).
 *
 * Both paths share debounce state in session-state.ts, so only one
 * network call fires per debounce window regardless of which path
 * triggered it.
 */

import { CraneApi, SessionNotActiveError } from './crane-api.js'
import { getApiBase } from './config.js'
import {
  HEARTBEAT_REFRESH_INTERVAL_MS,
  clearSession,
  getSessionContext,
  markHeartbeatAttempted,
  shouldRefreshHeartbeat,
} from './session-state.js'

/**
 * Attempt to refresh the current session's heartbeat if:
 *   (a) there is an active session in memory, and
 *   (b) the debounce window has elapsed since the last attempt.
 *
 * Fire-and-forget: never throws, never blocks, never returns a promise
 * the caller has to await. The internal promise chain always has both
 * .then() and .catch() handlers attached before it escapes the function
 * scope, so rejections cannot become unhandledRejection events.
 *
 * On permanent failure (409 SessionNotActiveError), calls clearSession()
 * to halt further attempts against a dead session. This prevents a
 * thundering herd of heartbeat requests when a sub-agent or team worker
 * has already abandoned the parent session.
 */
export function refreshSessionHeartbeatIfNeeded(): void {
  const ctx = getSessionContext()
  if (!ctx) return

  if (!shouldRefreshHeartbeat()) return

  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) return

  // Mark the attempt BEFORE the network call fires. This prevents
  // synchronous repeat calls within the debounce window (either from
  // the on-dispatch path or from a concurrent timer tick) from
  // stacking up refresh requests.
  markHeartbeatAttempted()

  const api = new CraneApi(apiKey, getApiBase())

  // The promise is not awaited, but both handlers are attached before
  // it leaves this function scope — so a rejection cannot become an
  // unhandledRejection event.
  api
    .refreshHeartbeat(ctx.sessionId)
    .then(() => {
      // No additional state to update — the attempt marker is already set.
    })
    .catch((err: unknown) => {
      if (err instanceof SessionNotActiveError) {
        // The server says this session is not active. Stop trying.
        // The next /sos will create a fresh session.
        clearSession()
        if (process.env.CRANE_DEBUG) {
          console.error(
            `[crane-mcp] heartbeat refresh: session marked ${err.sessionStatus}, clearing local state`
          )
        }
        return
      }
      // Transient error (network, 500, etc.). The attempt marker is
      // still set, so we will not retry until the next debounce window.
      // The background timer will naturally provide the next attempt.
      if (process.env.CRANE_DEBUG) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[crane-mcp] heartbeat refresh failed (transient): ${message}`)
      }
    })
}

/**
 * Install a background interval that fires refreshSessionHeartbeatIfNeeded()
 * every HEARTBEAT_REFRESH_INTERVAL_MS milliseconds.
 *
 * The timer handle is .unref()'d so it does not keep the Node.js event
 * loop alive when stdin closes — crane-mcp must exit cleanly when the
 * Claude Code parent process terminates.
 *
 * Returns the timer handle so tests can clearInterval() it in cleanup.
 */
export function startHeartbeatTimer(): NodeJS.Timeout {
  const timer = setInterval(refreshSessionHeartbeatIfNeeded, HEARTBEAT_REFRESH_INTERVAL_MS)
  timer.unref()
  return timer
}
