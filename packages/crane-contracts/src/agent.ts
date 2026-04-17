/**
 * Agent-identity contract.
 *
 * The authoritative source for the shape of `agent` values carried in
 * every session-lifecycle request (/sos, /eos, /mcp). The server validates
 * incoming values with `isValidAgent`; the client constructs its own value
 * with `buildAgentName`. Because both sides import from this module, the
 * pattern and the builder cannot drift.
 *
 * Pure TypeScript. No Node- or worker-specific imports. Safe to consume
 * from both packages/crane-mcp (Node runtime) and workers/crane-context
 * (workerd runtime) without compatibility flags.
 */

/**
 * Regex the server enforces on the `agent` field.
 *
 * Requires at least one `[a-z0-9]` run, followed by a hyphen, followed by
 * one or more `[a-z0-9-]` chars. Rejects dots, underscores, uppercase,
 * whitespace, and empty strings.
 */
export const AGENT_PATTERN = /^[a-z0-9]+-[a-z0-9-]+$/

/** Maximum total length of a valid agent value. DNS-segment convention. */
export const AGENT_MAX_LENGTH = 63

/** Length of the hash suffix appended by buildAgentName for collision-resistance. */
export const AGENT_HASH_SUFFIX_LENGTH = 4

/** Default prefix used by buildAgentName when the caller doesn't specify one. */
export const DEFAULT_AGENT_PREFIX = 'crane-mcp'

/** Sentinel sanitized-host value used when the raw hostname is missing or empty. */
export const UNKNOWN_HOST_SANITIZED = 'unknown'

/**
 * Validate an agent value against the canonical pattern.
 *
 * Returns true iff the string matches AGENT_PATTERN. Does NOT check
 * AGENT_MAX_LENGTH — callers that care about length should assert it
 * separately (the server does both).
 */
export function isValidAgent(agent: string): boolean {
  return AGENT_PATTERN.test(agent)
}

/**
 * Normalize a raw hostname into the sanitized token used inside an agent name.
 *
 * Algorithm (each step applied in order):
 *   1. null/undefined/empty -> UNKNOWN_HOST_SANITIZED
 *   2. lowercase
 *   3. replace runs of non-[a-z0-9] with a single hyphen
 *   4. trim leading + trailing hyphens
 *   5. if empty after trim -> UNKNOWN_HOST_SANITIZED
 *   6. truncate to maxLength; re-trim trailing hyphens
 *
 * Never returns a value containing dots, uppercase, whitespace, or
 * anything else outside [a-z0-9-]. Never returns empty.
 */
export function sanitizeHostnameForAgent(
  raw: string | null | undefined,
  maxLength: number = AGENT_MAX_LENGTH -
    DEFAULT_AGENT_PREFIX.length -
    1 -
    1 -
    AGENT_HASH_SUFFIX_LENGTH
): string {
  if (raw === null || raw === undefined || raw === '') {
    return UNKNOWN_HOST_SANITIZED
  }
  const lowered = raw.toLowerCase()
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-')
  const trimmed = replaced.replace(/^-+|-+$/g, '')
  if (trimmed === '') {
    return UNKNOWN_HOST_SANITIZED
  }
  const truncated = trimmed.slice(0, Math.max(1, maxLength)).replace(/-+$/g, '')
  return truncated === '' ? UNKNOWN_HOST_SANITIZED : truncated
}

/**
 * Deterministic short hash of a raw hostname, rendered as AGENT_HASH_SUFFIX_LENGTH
 * lowercase hex characters. djb2 variant truncated to 16 bits.
 *
 * Used as a collision-resistance suffix in buildAgentName so that two raw
 * hostnames that happen to sanitize to the same string (e.g., "mac.mini"
 * and "mac-mini") produce distinct final agent names.
 *
 * This is NOT a cryptographic hash. The input is trusted (a local hostname),
 * no adversary is trying to collide it, and 16 bits is sufficient for
 * avoiding accidental collisions across a fleet of tens of machines.
 */
export function hashHostname(raw: string | null | undefined): string {
  const input = raw ?? ''
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return ((hash >>> 0) & 0xffff).toString(16).padStart(AGENT_HASH_SUFFIX_LENGTH, '0')
}

/**
 * Construct a valid agent name from a raw hostname.
 *
 * Shape: `${prefix}-${sanitized}-${hash4}`. Always satisfies AGENT_PATTERN
 * and is always ≤ AGENT_MAX_LENGTH. The hash suffix is a pure function of
 * the raw input — same hostname in means same agent name out, stable
 * across processes and restarts.
 */
export function buildAgentName(
  rawHost: string | null | undefined,
  prefix: string = DEFAULT_AGENT_PREFIX
): string {
  const available = AGENT_MAX_LENGTH - prefix.length - 1 - 1 - AGENT_HASH_SUFFIX_LENGTH
  const sanitized = sanitizeHostnameForAgent(rawHost, available)
  const suffix = hashHostname(rawHost ?? '')
  return `${prefix}-${sanitized}-${suffix}`
}
