/**
 * Unit tests for crane_verify_audit (Prong 3).
 *
 * Mocks CraneApi (the network boundary) and exercises the tool's report
 * formatter, memory-draft creation path, and apply-flag gating. Local file
 * collection (git log + classifier) is best-effort and falls through to
 * empty arrays when not in a git repo, which is fine for these tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/crane-api.js', () => {
  const mockApi = {
    getVerifyAudit: vi.fn(),
    completeScheduleItem: vi.fn(),
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

vi.mock('./memory.js', async () => {
  const actual = await vi.importActual<typeof import('./memory.js')>('./memory.js')
  return {
    ...actual,
    executeMemory: vi.fn(),
  }
})

beforeEach(async () => {
  process.env.CRANE_CONTEXT_KEY = 'test-key'
  const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
    _mockApi: {
      getVerifyAudit: ReturnType<typeof vi.fn>
      completeScheduleItem: ReturnType<typeof vi.fn>
    }
  }
  _mockApi.getVerifyAudit.mockReset()
  _mockApi.completeScheduleItem.mockReset()
  _mockApi.completeScheduleItem.mockResolvedValue({
    name: 'verify-audit-weekly',
    completed_at: '2026-05-06T12:00:00Z',
    result: 'success',
    gcal_event_id: null,
    next_due_date: null,
  })

  const memMod = await import('./memory.js')
  ;(memMod.executeMemory as ReturnType<typeof vi.fn>).mockReset()
})

// ---------------------------------------------------------------------------
// Empty-shape fixture
// ---------------------------------------------------------------------------

const EMPTY_AUDIT = {
  window: { days: 7, since_iso: '2026-04-29T00:00:00Z' },
  cache: { age_seconds: 0, served_from: 'fresh' as const },
  coverage_gap: [],
  unverified_surface_files: [],
  override_audit: { pr_merge_gate: 0, verify_coverage_gate: 0, total_handoffs_done: 0 },
  integrity_samples: [],
  truncation_drift: [],
  source_distribution: { manual: 0, tool: 0, hook: 0 },
  memory_candidates: [],
  memory_candidates_suppressed: 0,
  generated_at: '2026-05-06T12:00:00Z',
}

const RECURRING_CANDIDATE = {
  pattern: 'recurring_command_hash_per_repo' as const,
  command_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  repo: 'venturecrane/crane-console',
  sample_command: 'wrangler d1 execute crane-context-db-staging --remote',
  method: 'fresh_process',
  occurrences: 4,
  first_seen: '2026-04-30T00:00:00Z',
  last_seen: '2026-05-05T00:00:00Z',
  verify_ids: [
    'vfy_01HQXV3NK8YXM3G5ZXQXAAAAAA',
    'vfy_01HQXV3NK8YXM3G5ZXQXBBBBBB',
    'vfy_01HQXV3NK8YXM3G5ZXQXCCCCCC',
    'vfy_01HQXV3NK8YXM3G5ZXQXDDDDDD',
  ],
  suggested_kind: 'lesson' as const,
  files_touched_union: ['workers/crane-context/src/endpoints/foo.ts'],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeVerifyAudit — read-only', () => {
  it('returns success with empty-state report shape', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getVerifyAudit: ReturnType<typeof vi.fn> }
    }
    _mockApi.getVerifyAudit.mockResolvedValue(EMPTY_AUDIT)

    const { executeVerifyAudit } = await import('./verify-audit.js')
    const result = await executeVerifyAudit({
      window_days: 7,
      auto_apply: false,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(result.status).toBe('success')
    expect(result.message).toContain('Verify-ledger audit — 7d window')
    expect(result.message).toContain('Coverage gap (windowed)')
    expect(result.message).toContain('All windowed surface files have at least one verify row.')
    expect(result.message).toContain('All surface-class files have at least one verify row.')
    expect(result.message).toContain('Memory candidates (recurring patterns)')
    expect(result.message).toContain('No recurring patterns detected')
  })

  it('returns success with non-empty memory candidates and a hint to apply', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getVerifyAudit: ReturnType<typeof vi.fn> }
    }
    _mockApi.getVerifyAudit.mockResolvedValue({
      ...EMPTY_AUDIT,
      memory_candidates: [RECURRING_CANDIDATE],
    })

    const { executeVerifyAudit } = await import('./verify-audit.js')
    const result = await executeVerifyAudit({
      window_days: 7,
      auto_apply: false,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(result.status).toBe('success')
    expect(result.message).toContain('venturecrane/crane-console')
    expect(result.message).toContain('× 4')
    expect(result.message).toContain('vfy_01HQXV3NK8YXM3G5ZXQXAAAAAA')
    expect(result.message).toContain('Re-run with `--apply`')
  })

  it('does not call executeMemory when auto_apply is false', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getVerifyAudit: ReturnType<typeof vi.fn> }
    }
    _mockApi.getVerifyAudit.mockResolvedValue({
      ...EMPTY_AUDIT,
      memory_candidates: [RECURRING_CANDIDATE],
    })

    const { executeVerifyAudit } = await import('./verify-audit.js')
    await executeVerifyAudit({
      window_days: 7,
      auto_apply: false,
      max_memory_candidates: 5,
      fresh: false,
    })

    const memMod = await import('./memory.js')
    expect(memMod.executeMemory).not.toHaveBeenCalled()
  })

  it('surfaces suppressed-count when cap drops candidates', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getVerifyAudit: ReturnType<typeof vi.fn> }
    }
    _mockApi.getVerifyAudit.mockResolvedValue({
      ...EMPTY_AUDIT,
      memory_candidates: [RECURRING_CANDIDATE],
      memory_candidates_suppressed: 3,
    })

    const { executeVerifyAudit } = await import('./verify-audit.js')
    const result = await executeVerifyAudit({
      window_days: 7,
      auto_apply: false,
      max_memory_candidates: 5,
      fresh: false,
    })
    expect(result.message).toContain('3 additional candidate(s) suppressed')
    expect(result.message).toContain('Re-run with --max=4')
  })
})

describe('executeVerifyAudit — apply path', () => {
  it('creates a draft per memory candidate via executeMemory', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getVerifyAudit: ReturnType<typeof vi.fn> }
    }
    _mockApi.getVerifyAudit.mockResolvedValue({
      ...EMPTY_AUDIT,
      memory_candidates: [RECURRING_CANDIDATE],
    })

    const memMod = await import('./memory.js')
    const executeMemoryMock = memMod.executeMemory as ReturnType<typeof vi.fn>
    executeMemoryMock.mockResolvedValue({
      success: true,
      message: 'Memory saved.',
    })

    const { executeVerifyAudit } = await import('./verify-audit.js')
    const result = await executeVerifyAudit({
      window_days: 7,
      auto_apply: true,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(executeMemoryMock).toHaveBeenCalledTimes(1)
    const call = executeMemoryMock.mock.calls[0][0]
    expect(call.action).toBe('save')
    expect(call.kind).toBe('lesson')
    expect(call.scope).toBe('enterprise')
    expect(call.owner).toBe('agent-team')
    expect(call.status).toBe('draft')
    expect(call.captain_approved).toBe(false)
    expect(call.evidence_verify_ids).toEqual(RECURRING_CANDIDATE.verify_ids)
    expect(call.applies_when?.files).toEqual(RECURRING_CANDIDATE.files_touched_union)
    expect(call.name).toMatch(/^recurring-command-abcdef12-/)
    expect(call.name).toContain('venturecrane-crane-console')
    expect(result.message).toContain('Memory drafts')
    expect(result.message).toContain('Created: 1')
  })

  it('counts a memoryability-rejected save as a skip, not an error', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getVerifyAudit: ReturnType<typeof vi.fn> }
    }
    _mockApi.getVerifyAudit.mockResolvedValue({
      ...EMPTY_AUDIT,
      memory_candidates: [RECURRING_CANDIDATE],
    })

    const memMod = await import('./memory.js')
    const executeMemoryMock = memMod.executeMemory as ReturnType<typeof vi.fn>
    executeMemoryMock.mockResolvedValue({
      success: false,
      message: 'Memory rejected: Non-obvious: a memory named "foo" already exists.',
    })

    const { executeVerifyAudit } = await import('./verify-audit.js')
    const result = await executeVerifyAudit({
      window_days: 7,
      auto_apply: true,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(result.message).toContain('Skipped (duplicate or memoryability): 1')
    expect(result.message).toContain('Created: 0')
  })

  it('records a hard error when executeMemory throws', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: { getVerifyAudit: ReturnType<typeof vi.fn> }
    }
    _mockApi.getVerifyAudit.mockResolvedValue({
      ...EMPTY_AUDIT,
      memory_candidates: [RECURRING_CANDIDATE],
    })

    const memMod = await import('./memory.js')
    const executeMemoryMock = memMod.executeMemory as ReturnType<typeof vi.fn>
    executeMemoryMock.mockRejectedValue(new Error('network hiccup'))

    const { executeVerifyAudit } = await import('./verify-audit.js')
    const result = await executeVerifyAudit({
      window_days: 7,
      auto_apply: true,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(result.message).toContain('Errors:')
    expect(result.message).toContain('network hiccup')
  })
})

describe('executeVerifyAudit — schedule completion', () => {
  it('marks schedule "warning" when sections are non-empty', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: {
        getVerifyAudit: ReturnType<typeof vi.fn>
        completeScheduleItem: ReturnType<typeof vi.fn>
      }
    }
    _mockApi.getVerifyAudit.mockResolvedValue({
      ...EMPTY_AUDIT,
      memory_candidates: [RECURRING_CANDIDATE],
    })

    const { executeVerifyAudit } = await import('./verify-audit.js')
    await executeVerifyAudit({
      window_days: 7,
      auto_apply: false,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(_mockApi.completeScheduleItem).toHaveBeenCalledWith(
      'verify-audit-weekly',
      expect.objectContaining({ result: 'warning' })
    )
  })

  it('marks schedule "success" when all sections are clean', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: {
        getVerifyAudit: ReturnType<typeof vi.fn>
        completeScheduleItem: ReturnType<typeof vi.fn>
      }
    }
    _mockApi.getVerifyAudit.mockResolvedValue(EMPTY_AUDIT)

    const { executeVerifyAudit } = await import('./verify-audit.js')
    await executeVerifyAudit({
      window_days: 7,
      auto_apply: false,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(_mockApi.completeScheduleItem).toHaveBeenCalledWith(
      'verify-audit-weekly',
      expect.objectContaining({ result: 'success' })
    )
  })

  it('does not throw when schedule completion fails (best-effort)', async () => {
    const { _mockApi } = (await import('../lib/crane-api.js')) as unknown as {
      _mockApi: {
        getVerifyAudit: ReturnType<typeof vi.fn>
        completeScheduleItem: ReturnType<typeof vi.fn>
      }
    }
    _mockApi.getVerifyAudit.mockResolvedValue(EMPTY_AUDIT)
    _mockApi.completeScheduleItem.mockRejectedValue(new Error('schedule down'))

    const { executeVerifyAudit } = await import('./verify-audit.js')
    const result = await executeVerifyAudit({
      window_days: 7,
      auto_apply: false,
      max_memory_candidates: 5,
      fresh: false,
    })

    expect(result.status).toBe('success')
  })
})
