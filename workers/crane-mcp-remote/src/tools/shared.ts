import { getVenture, type VentureCode, type VentureRepo } from '../ventures.js'

export type TextContent = { type: 'text'; text: string }
export type ToolResult = { content: TextContent[]; isError?: true }

/**
 * Prepended (not appended) stale warning so the model sees it before
 * the data, instead of treating it as a quiet trailing tag.
 */
export function staleBanner(stale: boolean, cacheAgeSeconds?: number): string {
  if (!stale) return ''
  const ageHint =
    cacheAgeSeconds && cacheAgeSeconds > 0 ? ` (cache age: ${formatDuration(cacheAgeSeconds)})` : ''
  return `STALE DATA${ageHint} — crane-context was unreachable, returning cached values. Treat as approximate and mention this if relying on it.\n\n---\n\n`
}

export function textResult(text: string, isError?: true): ToolResult {
  const result: ToolResult = { content: [{ type: 'text' as const, text }] }
  if (isError) result.isError = isError
  return result
}

/**
 * Resolve the GitHub target for a tool call. Returns explicit args when
 * both are provided; falls back to the session venture's default repo
 * when both are omitted; errors when exactly one is provided.
 *
 * Contract: cross-venture queries are first-class — explicit owner+repo
 * always overrides venture defaults.
 */
export function resolveTarget(
  owner: string | undefined,
  repo: string | undefined,
  sessionVenture: VentureCode | null
): VentureRepo | { error: string } {
  if (owner && repo) return { owner, repo }
  if (owner || repo) {
    return {
      error: `Both owner and repo must be provided together (got owner=${owner ?? 'undefined'}, repo=${repo ?? 'undefined'}). To use the session venture's default repo, omit both.`,
    }
  }
  const venture = getVenture(sessionVenture)
  if (!venture) {
    return {
      error:
        'No GitHub target available: this MCP session is not bound to a venture, and no owner/repo was provided. Pass owner and repo explicitly, or connect via /mcp/{venture-code}.',
    }
  }
  return venture.repo
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return secs ? `${mins}m ${secs}s` : `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return remMins ? `${hours}h ${remMins}m` : `${hours}h`
}
