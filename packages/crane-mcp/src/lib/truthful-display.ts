/**
 * Truthful Display: branded type for paginated/limited query results.
 *
 * Plan §B.2: every operator-facing display must show either the EXACT
 * total or both `shown` and `total`. Operators must never see `${array.length}`
 * for an array that came from a paginated query - they cannot distinguish
 * "the system returned 10 because there are 10" from "the system returned
 * 10 because that's where the slice ended."
 *
 * The `Truncated<T>` brand prevents accidental `.length` reads on paginated
 * results: the wrapping interface has `shown` (the visible items), `total`
 * (the true count), and `more` (the difference). Display helpers take a
 * `Truncated<T>` and produce a string that includes both numbers.
 *
 * The branded property `[TruncatedBrand]: true` makes this a nominal type:
 * a plain `{ shown, total, more }` object cannot be assigned to `Truncated<T>`
 * without going through `truncate()` or `exact()`. This prevents the most
 * common foot-gun: hand-constructing a fake "Truncated" with `shown.length`
 * as the total.
 */

// Real runtime symbol for the brand. The unique symbol type ensures the
// branded interface is nominal at compile time, while having a real value
// means the interface implementation works at runtime.
const TruncatedBrand: unique symbol = Symbol('Truncated')

/**
 * A wrapped result from a paginated/limited query. The `shown` array is
 * the items the operator will see; `total` is the true count of all
 * matching items in the underlying store; `more` is `total - shown.length`.
 */
export interface Truncated<T> {
  readonly [TruncatedBrand]: true
  readonly shown: readonly T[]
  readonly total: number
  readonly more: number
}

/**
 * Wrap items + a true count into a `Truncated<T>`. Use when calling a
 * paginated API: pass the items returned and the total reported by the
 * server's count endpoint.
 *
 * If `total < items.length` (server told us there are fewer items than
 * we received), this is a server bug — we trust `items.length` as the
 * minimum and report it as the total.
 */
export function truncate<T>(items: readonly T[], total: number): Truncated<T> {
  const safeTotal = Math.max(total, items.length)
  return {
    [TruncatedBrand]: true,
    shown: items,
    total: safeTotal,
    more: Math.max(0, safeTotal - items.length),
  } as Truncated<T>
}

/**
 * Wrap items as `Truncated<T>` when you KNOW the array is the complete set
 * (e.g., a fixed-size enum, an in-memory computation, a server response
 * that returns ALL matches without pagination). Marked as Truncated so
 * the same display helpers work uniformly.
 */
export function exact<T>(items: readonly T[]): Truncated<T> {
  return {
    [TruncatedBrand]: true,
    shown: items,
    total: items.length,
    more: 0,
  } as Truncated<T>
}

/**
 * Wrap items as `Truncated<T>` when the true total is unavailable (e.g.,
 * the count endpoint failed or is not implemented). Renders as
 * "(at least N) — total unknown" so the operator knows the count is a
 * floor, not an exact value.
 */
export function unknownTotal<T>(items: readonly T[]): Truncated<T> {
  return {
    [TruncatedBrand]: true,
    shown: items,
    total: items.length,
    more: -1, // Sentinel: unknown
  } as Truncated<T>
}

/**
 * Format a `Truncated<T>` as a count string. Three rendering modes:
 *
 *   exact (shown === total):              "10 alerts"
 *   truncated (more > 0):                 "270 alerts (showing 10, +260 more — run crane_notifications)"
 *   unknown total:                        "10 alerts (count unknown — see crane_notifications)"
 */
export function formatTruthfulCount<T>(
  result: Truncated<T>,
  noun: string,
  options: { hint?: string; verb?: string } = {}
): string {
  const verb = options.verb ?? 'showing'

  // Unknown total
  if (result.more === -1) {
    const hint = options.hint ? ` — ${options.hint}` : ''
    return `${result.shown.length} ${noun} (count unknown${hint})`
  }

  // Exact (no truncation)
  if (result.more === 0) {
    return `${result.total} ${noun}`
  }

  // Truncated
  const hint = options.hint ? `, ${options.hint}` : ''
  return `${result.total} ${noun} (${verb} ${result.shown.length}, +${result.more} more${hint})`
}

/**
 * Render a count line that always shows the total, even when truncated.
 * Useful for headers like "**CI/CD Alerts** — 270 total (12 critical, 45 warning)".
 *
 * Returns `null` when there's nothing to show (total === 0).
 */
export function formatHeaderCount<T>(result: Truncated<T>, noun: string): string | null {
  if (result.total === 0 && result.more !== -1) return null
  if (result.more === -1) return `${result.shown.length}+ ${noun}`
  return `${result.total} ${noun}`
}
