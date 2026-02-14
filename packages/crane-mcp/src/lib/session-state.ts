/**
 * Module-level session state cache.
 * Persists for the lifetime of the MCP server process.
 */

export interface SessionContext {
  sessionId: string
  venture: string
  repo: string
}

let sessionContext: SessionContext | null = null

export function setSession(id: string, venture: string, repo: string): void {
  sessionContext = { sessionId: id, venture, repo }
}

export function getSessionContext(): SessionContext | null {
  return sessionContext
}

export function clearSession(): void {
  sessionContext = null
}
