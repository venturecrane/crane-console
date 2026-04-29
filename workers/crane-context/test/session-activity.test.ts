import { describe, it, expect } from 'vitest'
import {
  floorToMinute,
  matchActivityRoute,
  ACTIVITY_RETENTION_DAYS,
} from '../src/endpoints/session-activity'
import { buildActivityRanges } from '../src/endpoints/queries'

describe('matchActivityRoute', () => {
  it('extracts session id from valid path', () => {
    expect(matchActivityRoute('/sessions/sess_01ABC/activity')).toBe('sess_01ABC')
  })

  it('returns null for non-matching paths', () => {
    expect(matchActivityRoute('/sessions/sess_01ABC')).toBeNull()
    expect(matchActivityRoute('/sessions//activity')).toBeNull()
    expect(matchActivityRoute('/foo/sess_01ABC/activity')).toBeNull()
    expect(matchActivityRoute('/sessions/sess_01ABC/activity/extra')).toBeNull()
  })
})

describe('floorToMinute', () => {
  it('strips seconds and milliseconds', () => {
    expect(floorToMinute('2026-04-29T14:32:47.123Z')).toBe('2026-04-29T14:32:00Z')
  })

  it('handles already-floored timestamps', () => {
    expect(floorToMinute('2026-04-29T14:32:00Z')).toBe('2026-04-29T14:32:00Z')
  })

  it('preserves the date and minute', () => {
    expect(floorToMinute('2026-12-31T23:59:59.999Z')).toBe('2026-12-31T23:59:00Z')
  })
})

describe('ACTIVITY_RETENTION_DAYS', () => {
  it('is set to a defensible window for client-billing audits', () => {
    expect(ACTIVITY_RETENTION_DAYS).toBeGreaterThanOrEqual(90)
    expect(ACTIVITY_RETENTION_DAYS).toBeLessThanOrEqual(365)
  })
})

describe('buildActivityRanges', () => {
  it('returns empty array for empty input', () => {
    expect(buildActivityRanges([])).toEqual([])
  })

  it('single bucket yields a 1-minute range', () => {
    const ranges = buildActivityRanges(['2026-04-29T14:00:00Z'])
    expect(ranges).toEqual([{ start: '2026-04-29T14:00:00Z', end: '2026-04-29T14:01:00.000Z' }])
  })

  it('contiguous buckets coalesce into one range', () => {
    const ranges = buildActivityRanges([
      '2026-04-29T14:00:00Z',
      '2026-04-29T14:01:00Z',
      '2026-04-29T14:02:00Z',
    ])
    expect(ranges).toHaveLength(1)
    expect(ranges[0].start).toBe('2026-04-29T14:00:00Z')
    expect(ranges[0].end).toBe('2026-04-29T14:03:00.000Z')
  })

  it('gap of 30 minutes does NOT split (matches block-merger threshold)', () => {
    const ranges = buildActivityRanges([
      '2026-04-29T14:00:00Z',
      '2026-04-29T14:30:00Z', // exactly 30 min after — merges
    ])
    expect(ranges).toHaveLength(1)
  })

  it('gap of 31+ minutes splits into separate ranges', () => {
    const ranges = buildActivityRanges(['2026-04-29T14:00:00Z', '2026-04-29T14:31:00Z'])
    expect(ranges).toHaveLength(2)
    expect(ranges[0].start).toBe('2026-04-29T14:00:00Z')
    expect(ranges[1].start).toBe('2026-04-29T14:31:00Z')
  })

  it('multiple ranges with overnight gap', () => {
    const ranges = buildActivityRanges([
      '2026-04-29T20:00:00Z',
      '2026-04-29T22:00:00Z', // 2hr gap → split
      '2026-04-30T09:00:00Z', // 11hr gap → split
      '2026-04-30T11:00:00Z', // 2hr gap → split
    ])
    // 4 isolated points, all gaps > 30 min ⇒ 4 ranges
    expect(ranges).toHaveLength(4)
    expect(ranges[0].start).toBe('2026-04-29T20:00:00Z')
    expect(ranges[3].start).toBe('2026-04-30T11:00:00Z')
  })

  it('mixed in-session activity: contiguous burst then long gap then burst', () => {
    const ranges = buildActivityRanges([
      // Burst 1: 9:00-9:05 contiguous
      '2026-04-29T09:00:00Z',
      '2026-04-29T09:01:00Z',
      '2026-04-29T09:02:00Z',
      '2026-04-29T09:05:00Z',
      // Long gap (2hr) → split
      '2026-04-29T11:30:00Z',
      '2026-04-29T11:31:00Z',
    ])
    expect(ranges).toHaveLength(2)
    expect(ranges[0].start).toBe('2026-04-29T09:00:00Z')
    expect(ranges[0].end).toBe('2026-04-29T09:06:00.000Z')
    expect(ranges[1].start).toBe('2026-04-29T11:30:00Z')
    expect(ranges[1].end).toBe('2026-04-29T11:32:00.000Z')
  })

  it('out-of-order input is sorted defensively', () => {
    const ranges = buildActivityRanges([
      '2026-04-29T14:02:00Z',
      '2026-04-29T14:00:00Z',
      '2026-04-29T14:01:00Z',
    ])
    expect(ranges).toHaveLength(1)
    expect(ranges[0].start).toBe('2026-04-29T14:00:00Z')
  })
})
