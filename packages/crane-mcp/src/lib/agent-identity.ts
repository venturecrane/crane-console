/**
 * Client-side agent-identity helpers.
 *
 * All crane-mcp tools that send an `agent` field to the crane-context API
 * go through `getAgentId()` here. The actual shape + sanitization logic
 * lives in @venturecrane/crane-contracts so the server and client cannot
 * drift — this module is a thin Node-runtime wrapper that reads the host
 * and delegates.
 *
 * Related files (and why each one matters):
 *   - packages/crane-mcp/src/tools/sos.ts      — calls getAgentId() on /sos
 *   - packages/crane-mcp/src/tools/handoff.ts  — calls getAgentId() on /eos
 *   - packages/crane-mcp/src/lib/crane-api.ts  — uses getHostForRegistry()
 *                                                for the separate `host` field
 */

import { hostname } from 'node:os'
import { DEFAULT_AGENT_PREFIX, buildAgentName, isValidAgent } from '@venturecrane/crane-contracts'

/**
 * Cached result of the first getAgentId() computation.
 *
 * The hostname is stable for the lifetime of a process, so computing it
 * once and caching eliminates a string concat + hash on every request.
 */
let cachedAgentId: string | null = null

/**
 * Read the raw hostname from the environment. Prefers HOSTNAME (honored
 * by CI runners and shells) over `os.hostname()` (which on macOS returns
 * the `.local` mDNS suffix and on containers can be an ephemeral hex id).
 *
 * Exported so callers (machine registry, observability tags) can read
 * the unsanitized value. Do NOT use this value as an agent name — run it
 * through `buildAgentName()` first via `getAgentId()`.
 */
export function getHostForRegistry(): string {
  const raw = process.env.HOSTNAME || hostname() || ''
  return raw
}

/**
 * Compute the client-side agent identifier, cached per process.
 *
 * Shape: `crane-mcp-${sanitized-host}-${hash4}`. Always satisfies
 * AGENT_PATTERN. Two machines with the same sanitized hostname produce
 * different agent ids because the hash suffix is derived from the raw
 * hostname before sanitization.
 *
 * Defense-in-depth: if for any reason the composed value fails
 * AGENT_PATTERN (should never happen given the contract), fall back to
 * the unknown-host constant and warn loudly on stderr. A silent fallback
 * to an invalid identifier is how the original bug hid for a week.
 */
export function getAgentId(): string {
  if (cachedAgentId !== null) {
    return cachedAgentId
  }
  const raw = getHostForRegistry()
  const candidate = buildAgentName(raw)
  if (isValidAgent(candidate)) {
    cachedAgentId = candidate
    return candidate
  }
  const fallback = `${DEFAULT_AGENT_PREFIX}-unknown-0000`
  process.stderr.write(
    `[crane-mcp] WARNING: buildAgentName(${JSON.stringify(raw)}) produced an invalid ` +
      `agent id ${JSON.stringify(candidate)}; falling back to ${JSON.stringify(fallback)}. ` +
      `This indicates a bug in @venturecrane/crane-contracts and should be reported.\n`
  )
  cachedAgentId = fallback
  return fallback
}

/**
 * Reset the cache. Used exclusively by tests that vary HOSTNAME between
 * cases. Never call from production code.
 */
export function resetAgentIdCacheForTesting(): void {
  cachedAgentId = null
}
