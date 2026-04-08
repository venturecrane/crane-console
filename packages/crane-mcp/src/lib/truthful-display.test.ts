/**
 * Unit tests for truthful-display
 */

import { describe, it, expect } from 'vitest'
import {
  truncate,
  exact,
  unknownTotal,
  formatTruthfulCount,
  formatHeaderCount,
  type Truncated,
} from './truthful-display'

describe('truncate', () => {
  it('wraps items with the true total', () => {
    const result = truncate([1, 2, 3], 100)
    expect(result.shown).toEqual([1, 2, 3])
    expect(result.total).toBe(100)
    expect(result.more).toBe(97)
  })

  it('reports more = 0 when total equals items length', () => {
    const result = truncate([1, 2, 3], 3)
    expect(result.more).toBe(0)
  })

  it('clamps total to items.length when server reports a lower total', () => {
    // Server bug: should never happen, but if it does we trust the items.
    const result = truncate([1, 2, 3, 4, 5], 2)
    expect(result.total).toBe(5)
    expect(result.more).toBe(0)
  })

  it('handles empty items', () => {
    const result = truncate([], 0)
    expect(result.shown).toEqual([])
    expect(result.total).toBe(0)
    expect(result.more).toBe(0)
  })

  it('handles empty items with non-zero total (filter mismatch)', () => {
    const result = truncate([], 10)
    expect(result.total).toBe(10)
    expect(result.more).toBe(10)
  })
})

describe('exact', () => {
  it('marks items as the complete set', () => {
    const result = exact([1, 2, 3])
    expect(result.total).toBe(3)
    expect(result.more).toBe(0)
  })

  it('handles empty', () => {
    const result = exact([])
    expect(result.total).toBe(0)
    expect(result.more).toBe(0)
  })
})

describe('unknownTotal', () => {
  it('uses sentinel more=-1', () => {
    const result = unknownTotal([1, 2, 3])
    expect(result.shown).toEqual([1, 2, 3])
    expect(result.total).toBe(3)
    expect(result.more).toBe(-1)
  })
})

describe('formatTruthfulCount', () => {
  it('renders exact count when more=0', () => {
    const result = exact([1, 2, 3])
    expect(formatTruthfulCount(result, 'alerts')).toBe('3 alerts')
  })

  it('renders truncated count with showing X, +N more', () => {
    const result = truncate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 270)
    expect(formatTruthfulCount(result, 'alerts')).toBe('270 alerts (showing 10, +260 more)')
  })

  it('appends hint to truncated count', () => {
    const result = truncate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 270)
    expect(formatTruthfulCount(result, 'alerts', { hint: 'run crane_notifications' })).toBe(
      '270 alerts (showing 10, +260 more, run crane_notifications)'
    )
  })

  it('renders unknown total with sentinel', () => {
    const result = unknownTotal([1, 2, 3])
    expect(formatTruthfulCount(result, 'alerts')).toBe('3 alerts (count unknown)')
  })

  it('renders unknown total with hint', () => {
    const result = unknownTotal([1, 2, 3])
    expect(formatTruthfulCount(result, 'alerts', { hint: 'count endpoint down' })).toBe(
      '3 alerts (count unknown — count endpoint down)'
    )
  })

  it('handles empty exact result', () => {
    expect(formatTruthfulCount(exact([]), 'alerts')).toBe('0 alerts')
  })

  it('uses custom verb', () => {
    const result = truncate([1, 2, 3], 10)
    expect(formatTruthfulCount(result, 'items', { verb: 'displaying' })).toBe(
      '10 items (displaying 3, +7 more)'
    )
  })

  it('boundary case: 1 of 1', () => {
    expect(formatTruthfulCount(exact([1]), 'alert')).toBe('1 alert')
  })

  it('boundary case: 0 of N truncated (filter returned empty slice)', () => {
    const result = truncate([], 5)
    expect(formatTruthfulCount(result, 'alerts')).toBe('5 alerts (showing 0, +5 more)')
  })
})

describe('formatHeaderCount', () => {
  it('returns null for empty exact result', () => {
    expect(formatHeaderCount(exact([]), 'alerts')).toBeNull()
  })

  it('returns total for non-empty result', () => {
    expect(formatHeaderCount(truncate([1, 2, 3], 100), 'alerts')).toBe('100 alerts')
  })

  it('returns floor for unknown total', () => {
    expect(formatHeaderCount(unknownTotal([1, 2, 3]), 'alerts')).toBe('3+ alerts')
  })
})

describe('compile-time brand enforcement', () => {
  it('Truncated<T> brand prevents accidental .length on items array', () => {
    // This test exists to document the intended use; the real enforcement
    // is via TypeScript at compile time. The branded interface has `shown`
    // (an array) and `total` (a number), so reading `.shown.length` works
    // but does NOT replace the count - operators must use formatTruthfulCount.
    const result: Truncated<number> = truncate([1, 2, 3], 100)
    expect(result.shown.length).toBe(3) // shown count, not total
    expect(result.total).toBe(100) // true total
    // Display code that wants the count must use the helper:
    expect(formatTruthfulCount(result, 'items')).toContain('100')
  })
})
