/**
 * SS engagement parsing and lookup helpers.
 */

import { ENGAGEMENT_REGISTRY, EngagementContext } from './constants.js'

/**
 * List all engagements registered for a given client under a venture.
 * Used to print helpful hints when the user types `crane ss/<client>` without
 * an engagement slug.
 */
export function listClientEngagements(code: string, clientSlug: string): EngagementContext[] {
  return Object.values(ENGAGEMENT_REGISTRY).filter(
    (e) => e.code === code && e.clientSlug === clientSlug
  )
}

/**
 * Parse a launcher argument and determine if it refers to an engagement.
 * Returns null for non-engagement args (bare venture codes).
 *
 * Engagement shape: `<code>/<client>/<engagement>` — exactly 3 segments.
 * Other slash-containing shapes return a partial result so the caller can
 * emit a precise error.
 */
export function parseEngagementArg(
  arg: string
):
  | { kind: 'venture'; code: string }
  | { kind: 'engagement'; code: string; clientSlug: string; engagementSlug: string }
  | { kind: 'missing-engagement'; code: string; clientSlug: string }
  | { kind: 'invalid'; raw: string } {
  const lower = arg.toLowerCase()
  if (!lower.includes('/')) return { kind: 'venture', code: lower }
  const parts = lower.split('/')
  if (parts.length === 2) {
    return { kind: 'missing-engagement', code: parts[0], clientSlug: parts[1] }
  }
  if (parts.length === 3 && parts.every((p) => p.length > 0)) {
    return {
      kind: 'engagement',
      code: parts[0],
      clientSlug: parts[1],
      engagementSlug: parts[2],
    }
  }
  return { kind: 'invalid', raw: arg }
}
