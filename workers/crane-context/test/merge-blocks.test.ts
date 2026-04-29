import { describe, it, expect } from 'vitest'
import { mergeSessionsIntoBlocks, type SessionForMerge } from '../src/endpoints/queries'

function session(
  start: string,
  endedAt: string,
  opts?: { displayEnd?: string; host?: string; repo?: string; branch?: string; issue?: number }
): SessionForMerge {
  return {
    start,
    ended_at: endedAt,
    display_end: opts?.displayEnd || endedAt,
    host: opts?.host || 'm16.local',
    repo: opts?.repo || 'crane-console',
    branch: opts?.branch || 'main',
    issue_number: opts?.issue || null,
  }
}

describe('mergeSessionsIntoBlocks', () => {
  it('returns empty array for empty input', () => {
    expect(mergeSessionsIntoBlocks([])).toEqual([])
  })

  it('single session produces one block', () => {
    const sessions = [session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z')]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      start: '2026-03-21T11:00:00Z',
      end: '2026-03-21T12:00:00Z',
      session_count: 1,
      hosts: ['m16.local'],
      repos: ['crane-console'],
      branches: ['main'],
      issues: [],
    })
  })

  it('two adjacent sessions (gap < 30 min) merge into one block', () => {
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z'),
      session('2026-03-21T12:15:00Z', '2026-03-21T13:00:00Z'),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].start).toBe('2026-03-21T11:00:00Z')
    expect(blocks[0].end).toBe('2026-03-21T13:00:00Z')
    expect(blocks[0].session_count).toBe(2)
  })

  it('two distant sessions (gap > 30 min) produce two blocks', () => {
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z'),
      session('2026-03-21T19:00:00Z', '2026-03-21T20:00:00Z'),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].start).toBe('2026-03-21T11:00:00Z')
    expect(blocks[0].end).toBe('2026-03-21T12:00:00Z')
    expect(blocks[1].start).toBe('2026-03-21T19:00:00Z')
    expect(blocks[1].end).toBe('2026-03-21T20:00:00Z')
  })

  it('gap exactly 30 min merges (≤ threshold)', () => {
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z'),
      // Exactly 30 minutes after ended_at
      session('2026-03-21T12:30:00Z', '2026-03-21T13:00:00Z'),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].session_count).toBe(2)
  })

  it('gap of 30 min + 1 ms creates separate blocks', () => {
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z'),
      // 30 minutes and 1 second after ended_at
      session('2026-03-21T12:30:01Z', '2026-03-21T13:00:00Z'),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(2)
  })

  it('overlapping sessions merge into one block', () => {
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:30:00Z'),
      session('2026-03-21T12:00:00Z', '2026-03-21T13:00:00Z'),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].start).toBe('2026-03-21T11:00:00Z')
    expect(blocks[0].end).toBe('2026-03-21T13:00:00Z')
    expect(blocks[0].session_count).toBe(2)
  })

  it('multiple merges in sequence: A-B adjacent, B-C adjacent, C-D distant → two blocks', () => {
    const sessions = [
      session('2026-03-21T10:00:00Z', '2026-03-21T10:30:00Z'), // A
      session('2026-03-21T10:45:00Z', '2026-03-21T11:15:00Z'), // B (15 min gap from A)
      session('2026-03-21T11:30:00Z', '2026-03-21T12:00:00Z'), // C (15 min gap from B)
      session('2026-03-21T15:00:00Z', '2026-03-21T16:00:00Z'), // D (3 hour gap from C)
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].start).toBe('2026-03-21T10:00:00Z')
    expect(blocks[0].end).toBe('2026-03-21T12:00:00Z')
    expect(blocks[0].session_count).toBe(3)
    expect(blocks[1].start).toBe('2026-03-21T15:00:00Z')
    expect(blocks[1].end).toBe('2026-03-21T16:00:00Z')
    expect(blocks[1].session_count).toBe(1)
  })

  it('uses display_end for block end time, ended_at for gap calculation', () => {
    // Session 1: ended_at is 12:00, but display_end (last_activity_at) is 11:50
    // Session 2: starts at 12:25 — gap from ended_at is 25 min (merge), but gap from display_end would be 35 min
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z', {
        displayEnd: '2026-03-21T11:50:00Z',
      }),
      session('2026-03-21T12:25:00Z', '2026-03-21T13:00:00Z'),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    // Should merge because gap is calculated from ended_at (25 min < 30 min threshold)
    expect(blocks).toHaveLength(1)
    // End time should use the later display_end
    expect(blocks[0].end).toBe('2026-03-21T13:00:00Z')
  })

  it('aggregates hosts, repos, branches, and issues across merged sessions', () => {
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z', {
        host: 'm16.local',
        repo: 'crane-console',
        branch: 'main',
        issue: 100,
      }),
      session('2026-03-21T12:10:00Z', '2026-03-21T13:00:00Z', {
        host: 'mac-mini.local',
        repo: 'dc-console',
        branch: 'feat/blocks',
        issue: 200,
      }),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].hosts).toEqual(['m16.local', 'mac-mini.local'])
    expect(blocks[0].repos).toEqual(['crane-console', 'dc-console'])
    expect(blocks[0].branches).toEqual(['feat/blocks', 'main'])
    expect(blocks[0].issues).toEqual([100, 200])
  })

  it('deduplicates metadata across merged sessions', () => {
    const sessions = [
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z', {
        host: 'm16.local',
        repo: 'crane-console',
        issue: 100,
      }),
      session('2026-03-21T12:10:00Z', '2026-03-21T13:00:00Z', {
        host: 'm16.local',
        repo: 'crane-console',
        issue: 100,
      }),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].hosts).toEqual(['m16.local'])
    expect(blocks[0].repos).toEqual(['crane-console'])
    expect(blocks[0].issues).toEqual([100])
  })

  it('handles out-of-order input by sorting before merging', () => {
    const sessions = [
      session('2026-03-21T13:00:00Z', '2026-03-21T14:00:00Z'),
      session('2026-03-21T11:00:00Z', '2026-03-21T12:00:00Z'),
      session('2026-03-21T12:10:00Z', '2026-03-21T12:50:00Z'),
    ]
    const blocks = mergeSessionsIntoBlocks(sessions)

    // Sessions 2 and 3 should merge (10 min gap), session 1 is separate (10 min gap from 12:50 to 13:00, merges)
    // Actually: 11:00-12:00, 12:10-12:50, 13:00-14:00
    // Gap between block ending at 12:50 (ended_at) and 13:00 start = 10 min → merges
    expect(blocks).toHaveLength(1)
    expect(blocks[0].start).toBe('2026-03-21T11:00:00Z')
    expect(blocks[0].end).toBe('2026-03-21T14:00:00Z')
    expect(blocks[0].session_count).toBe(3)
  })
})
