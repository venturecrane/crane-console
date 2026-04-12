/**
 * Module-level session state cache.
 * Persists for the lifetime of the MCP server process.
 */

export interface SessionContext {
  sessionId: string
  venture: string
  repo: string
}

/**
 * Debounce interval for heartbeat refresh calls. Matches the server's
 * HEARTBEAT_INTERVAL_SECONDS (600s in workers/crane-context/src/constants.ts)
 * and gives a 3x safety margin under the 45-minute staleness threshold.
 */
export const HEARTBEAT_REFRESH_INTERVAL_MS = 10 * 60 * 1000

let sessionContext: SessionContext | null = null
let lastHeartbeatAttemptAt: number = 0

export function setSession(id: string, venture: string, repo: string): void {
  sessionContext = { sessionId: id, venture, repo }
  // A fresh /sos already set last_heartbeat_at server-side, so we do
  // not need another client-side refresh until the debounce window
  // elapses. Record the implicit "attempt" at setSession time.
  lastHeartbeatAttemptAt = Date.now()
}

export function getSessionContext(): SessionContext | null {
  return sessionContext
}

export function clearSession(): void {
  sessionContext = null
  lastHeartbeatAttemptAt = 0
}

/**
 * Debounce check: has enough time passed since the last heartbeat attempt
 * (success or failure) to justify another refresh?
 *
 * Keyed on attempts, not successes, so persistent failures cannot cause
 * a thundering-herd retry on every MCP tool call. The tradeoff: if a
 * heartbeat fails, we will not retry until the debounce window elapses.
 * That is acceptable because the background timer in heartbeat-refresh.ts
 * provides the redundant attempt path.
 */
export function shouldRefreshHeartbeat(): boolean {
  return Date.now() - lastHeartbeatAttemptAt >= HEARTBEAT_REFRESH_INTERVAL_MS
}

/**
 * Record that a heartbeat refresh was attempted. Called before the
 * network call fires so synchronous repeat calls within the debounce
 * window are correctly skipped.
 */
export function markHeartbeatAttempted(): void {
  lastHeartbeatAttemptAt = Date.now()
}
