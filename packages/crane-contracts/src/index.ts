/**
 * @venturecrane/crane-contracts
 *
 * Shared validation contracts consumed by both the crane-mcp client
 * (packages/crane-mcp) and the crane-context worker (workers/crane-context).
 * The package exists to prevent drift between client-generated values
 * and server-side validators — see ADR / post-mortem on agent-identity
 * contract drift (2026-04).
 *
 * Pure TypeScript, zero runtime dependencies. Safe to import from any
 * JS runtime that ships the standard Temporal-era APIs.
 */

export {
  AGENT_PATTERN,
  AGENT_MAX_LENGTH,
  AGENT_HASH_SUFFIX_LENGTH,
  DEFAULT_AGENT_PREFIX,
  UNKNOWN_HOST_SANITIZED,
  isValidAgent,
  sanitizeHostnameForAgent,
  hashHostname,
  buildAgentName,
} from './agent.js'
