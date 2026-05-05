/**
 * Tests for crane_memory_usage formatter — regression coverage for the
 * surfaced/cited=undefined bug where the formatter read non-existent alias
 * fields (surfaced_count/cited_count) instead of the canonical names the
 * worker emits (total_surfaced/total_cited).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/crane-api.js', () => {
  const mockApi = {
    getMemoryUsage: vi.fn(),
  }
  function MockCraneApi() {
    return mockApi
  }
  return {
    CraneApi: MockCraneApi,
    _mockApi: mockApi,
  }
})

vi.mock('../lib/config.js', () => ({ getApiBase: () => 'https://api.example.com' }))

beforeEach(() => {
  process.env.CRANE_CONTEXT_KEY = 'test-key'
})

describe('executeMemoryUsage formatter', () => {
  it('renders surfaced/cited counts from total_surfaced/total_cited fields', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.getMemoryUsage.mockResolvedValueOnce([
      {
        memory_id: 'note_ABC',
        total_surfaced: 7,
        total_cited: 3,
        total_parse_error: 0,
        last_event_at: '2026-05-05T12:00:00Z',
      },
    ])

    const { executeMemoryUsage } = await import('./memory-invoke.js')
    const result = await executeMemoryUsage({ since: '90d' })

    expect(result.success).toBe(true)
    expect(result.message).toContain('surfaced=7')
    expect(result.message).toContain('cited=3')
    expect(result.message).not.toContain('undefined')
  })

  it('returns the empty-state message when no events exist', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.getMemoryUsage.mockResolvedValueOnce([])

    const { executeMemoryUsage } = await import('./memory-invoke.js')
    const result = await executeMemoryUsage({ since: '30d' })

    expect(result.success).toBe(true)
    expect(result.message).toContain('No memory invocations recorded')
  })
})
