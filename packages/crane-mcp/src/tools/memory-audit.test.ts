/**
 * Integration tests for crane_memory_audit.
 *
 * Locks in the contract that audit Checks 4 (deprecated-but-surfaced) and 5
 * (zero-usage candidates) actually fire when seeded with real telemetry data.
 *
 * Regression context: from PR #794 merge until 2026-05-05, MemoryUsageStat
 * declared TS-only alias fields (surfaced_count, cited_count) that nothing
 * populated. Six call sites read undefined; both audit checks compared
 * undefined > 0 / undefined >= 10 and never fired. The audit-driven
 * deprecation pipeline was a silent no-op for months. These tests assert
 * each check fires on real data so a future regression at this boundary
 * fails CI before merge.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/crane-api.js', () => {
  const mockApi = {
    listNotes: vi.fn(),
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

beforeEach(async () => {
  process.env.CRANE_CONTEXT_KEY = 'test-key'
  // Clear call counts between tests; the mocked CraneApi instance is shared
  // across tests because it's created at module-mock time, so its mock.calls
  // would otherwise accumulate.
  const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
    _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
  }
  _mockApi.listNotes.mockReset()
  _mockApi.getMemoryUsage.mockReset()
})

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface MemoryFixture {
  id: string
  name: string
  status: 'draft' | 'stable' | 'deprecated'
  kind?: 'lesson' | 'anti-pattern' | 'runbook' | 'incident'
  daysOld?: number
  captainApproved?: boolean
}

function makeMemoryNote(fix: MemoryFixture) {
  const kind = fix.kind ?? 'lesson'
  const daysOld = fix.daysOld ?? 60
  const created = new Date(Date.now() - daysOld * 86_400_000).toISOString()
  const captainApproved = fix.captainApproved ?? true
  const content = `---
name: ${fix.name}
description: "Test memory ${fix.name}"
kind: ${kind}
scope: enterprise
owner: captain
status: ${fix.status}
captain_approved: ${captainApproved}
version: 1.0.0
---

Body of ${fix.name}.`
  return {
    id: fix.id,
    title: fix.name,
    content,
    tags: 'memory,lesson',
    venture: null,
    archived: 0,
    created_at: created,
    updated_at: created,
    actor_key_id: null,
    meta_json: null,
  }
}

function makeUsage(memoryId: string, surfaced: number, cited: number) {
  return {
    memory_id: memoryId,
    total_surfaced: surfaced,
    total_cited: cited,
    total_parse_error: 0,
    last_event_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Check 5: Zero-usage candidates
// ---------------------------------------------------------------------------

describe('runMemoryAudit — Check 5 (zero-usage candidates)', () => {
  it('fires when stable memory has ≥10 surfaces, 0 cites, age >30d', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({
          id: 'note_zerouse',
          name: 'over-surfaced-never-cited',
          status: 'stable',
          daysOld: 60,
        }),
      ],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_zerouse', 12, 0)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.usage_data_available).toBe(true)
    expect(result.zero_usage_candidates).toHaveLength(1)
    expect(result.zero_usage_candidates[0].id).toBe('note_zerouse')
    expect(result.zero_usage_candidates[0].surfaced_count).toBe(12)
    expect(result.zero_usage_candidates[0].cited_count).toBe(0)
  })

  it('does not fire at boundary: 9 surfaces (below threshold)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({
          id: 'note_below',
          name: 'below-threshold',
          status: 'stable',
          daysOld: 60,
        }),
      ],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_below', 9, 0)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.zero_usage_candidates).toHaveLength(0)
  })

  it('does not fire when memory is cited (rare-memory protection)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({ id: 'note_cited', name: 'cited-once', status: 'stable', daysOld: 60 }),
      ],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_cited', 20, 1)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.zero_usage_candidates).toHaveLength(0)
  })

  it('does not fire when memory is too new (<30d)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [makeMemoryNote({ id: 'note_new', name: 'too-new', status: 'stable', daysOld: 25 })],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_new', 50, 0)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.zero_usage_candidates).toHaveLength(0)
  })

  it('does not fire on draft memories (only stable are eligible)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({ id: 'note_draft', name: 'draft-noisy', status: 'draft', daysOld: 60 }),
      ],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_draft', 50, 0)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.zero_usage_candidates).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Check 4: Deprecated-but-surfaced
// ---------------------------------------------------------------------------

describe('runMemoryAudit — Check 4 (deprecated-but-surfaced)', () => {
  it('fires when deprecated memory has surface events (recall code may have a bug)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({
          id: 'note_deprecated',
          name: 'should-not-surface',
          status: 'deprecated',
          daysOld: 90,
        }),
      ],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_deprecated', 5, 2)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.deprecated_but_surfaced).toHaveLength(1)
    expect(result.deprecated_but_surfaced[0].id).toBe('note_deprecated')
    expect(result.deprecated_but_surfaced[0].reason).toContain('surfaced=5')
    expect(result.deprecated_but_surfaced[0].reason).toContain('cited=2')
  })

  it('does not fire for deprecated memory with zero events', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({
          id: 'note_quiet_deprecated',
          name: 'quietly-retired',
          status: 'deprecated',
          daysOld: 90,
        }),
      ],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_quiet_deprecated', 0, 0)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.deprecated_but_surfaced).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Pending-captain-approval — accurate counts (regression coverage)
// ---------------------------------------------------------------------------

describe('runMemoryAudit — pending_captain_approval has accurate counts', () => {
  it('reports actual surfaced/cited counts (not zero) for pending stable+unapproved memories', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({
          id: 'note_pending',
          name: 'awaiting-approval',
          status: 'stable',
          captainApproved: false,
          daysOld: 14,
        }),
      ],
    })
    _mockApi.getMemoryUsage.mockResolvedValueOnce([makeUsage('note_pending', 7, 3)])

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.pending_captain_approval).toHaveLength(1)
    expect(result.pending_captain_approval[0].id).toBe('note_pending')
    expect(result.pending_captain_approval[0].surfaced_count).toBe(7)
    expect(result.pending_captain_approval[0].cited_count).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// usage_data_available toggling
// ---------------------------------------------------------------------------

describe('runMemoryAudit — usage_data_available toggle', () => {
  it('sets usage_data_available=false when include_usage=false', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [
        makeMemoryNote({ id: 'note_x', name: 'no-usage-fetch', status: 'stable', daysOld: 60 }),
      ],
    })

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: false,
      auto_apply: false,
    })

    expect(result.usage_data_available).toBe(false)
    expect(result.deprecated_but_surfaced).toHaveLength(0)
    expect(result.zero_usage_candidates).toHaveLength(0)
    expect(_mockApi.getMemoryUsage).not.toHaveBeenCalled()
  })

  it('sets usage_data_available=false when API throws (graceful degradation)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { listNotes: ReturnType<typeof vi.fn>; getMemoryUsage: ReturnType<typeof vi.fn> }
    }
    _mockApi.listNotes.mockResolvedValueOnce({
      notes: [makeMemoryNote({ id: 'note_x', name: 'api-throws', status: 'stable', daysOld: 60 })],
    })
    _mockApi.getMemoryUsage.mockRejectedValueOnce(new Error('Network down'))

    const { runMemoryAudit } = await import('./memory-audit.js')
    const result = await runMemoryAudit({
      stale_threshold_days: 180,
      include_usage: true,
      auto_apply: false,
    })

    expect(result.usage_data_available).toBe(false)
  })
})
