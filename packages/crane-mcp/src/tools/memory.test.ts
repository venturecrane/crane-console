/**
 * Tests for crane_memory tool: parseFrontmatter, validateAndBuildRecord,
 * checkMemoryability, globMatchSimple, scoreMemory, severityWeight,
 * serializeFrontmatter, extractBody, and executeMemory top-level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/crane-api.js', () => {
  const mockApi = {
    listNotes: vi.fn(),
    createNote: vi.fn(),
    getNote: vi.fn(),
    updateNote: vi.fn(),
    recordMemoryInvocation: vi.fn(),
  }
  // Regular function (not arrow) so `new CraneApi(...)` works;
  // arrow functions cannot be used as constructors.
  function MockCraneApi() {
    return mockApi
  }
  return {
    CraneApi: MockCraneApi,
    _mockApi: mockApi,
  }
})

vi.mock('../lib/config.js', () => ({ getApiBase: () => 'https://api.example.com' }))

// ---------------------------------------------------------------------------
// Helpers for building valid note fixtures
// ---------------------------------------------------------------------------

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    title: 'test-lesson',
    content: `---
name: test-lesson
description: "A test lesson for testing"
kind: lesson
scope: enterprise
owner: captain
status: stable
captain_approved: true
version: 1.0.0
---

Always run tests before committing changes to avoid breaking the build.`,
    venture: null,
    tags: ['memory', 'lesson'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    ...overrides,
  }
}

function makeAntiPatternNote(overrides: Record<string, unknown> = {}) {
  return makeNote({
    id: 'note-2',
    title: 'never-skip-auth',
    content: `---
name: never-skip-auth
description: "Never skip authentication checks when calling APIs"
kind: anti-pattern
scope: enterprise
owner: captain
status: stable
captain_approved: true
version: 1.0.0
severity: P0
applies_when:
  commands: [/ship, /deploy]
  files: ["*.ts"]
---

Never skip authentication checks when calling external APIs. Always verify tokens are valid before use.`,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', async () => {
    const { parseFrontmatter } = await import('./memory.js')
    const content = `---
name: my-lesson
description: "A lesson about things"
kind: lesson
scope: enterprise
status: stable
captain_approved: true
---
Body text`
    const result = parseFrontmatter(content)
    expect(result.name).toBe('my-lesson')
    expect(result.kind).toBe('lesson')
    expect(result.captain_approved).toBe(true)
  })

  it('returns empty object for content without frontmatter', async () => {
    const { parseFrontmatter } = await import('./memory.js')
    const result = parseFrontmatter('Just plain text without frontmatter')
    expect(result).toEqual({})
  })

  // Regression: #829 — empty inline-array `supersedes: []` must parse as a real
  // empty array (not the literal string "[]"), so downstream `.join()` calls don't crash.
  it('parses empty inline-array supersedes as a real array', async () => {
    const { parseFrontmatter } = await import('./memory.js')
    const content = `---
name: test
description: "test"
kind: lesson
scope: enterprise
status: stable
captain_approved: false
version: 1.0.0
supersedes: []
---
Body`
    const result = parseFrontmatter(content)
    expect(Array.isArray(result.supersedes)).toBe(true)
    expect(result.supersedes).toEqual([])
  })

  it('parses non-empty inline-array supersedes as a real array', async () => {
    const { parseFrontmatter } = await import('./memory.js')
    const content = `---
name: test
description: "test"
kind: lesson
scope: enterprise
status: stable
captain_approved: false
version: 1.0.0
supersedes: [note_a, note_b]
---
Body`
    const result = parseFrontmatter(content)
    expect(Array.isArray(result.supersedes)).toBe(true)
    expect(result.supersedes).toEqual(['note_a', 'note_b'])
  })

  it('normalizes ISO date scalar to YYYY-MM-DD string', async () => {
    const { parseFrontmatter } = await import('./memory.js')
    const content = `---
name: test
description: "test"
kind: lesson
scope: enterprise
status: stable
captain_approved: false
version: 1.0.0
last_validated_on: 2026-05-05
---
Body`
    const result = parseFrontmatter(content)
    expect(typeof result.last_validated_on).toBe('string')
    expect(result.last_validated_on).toBe('2026-05-05')
  })
})

// ---------------------------------------------------------------------------
// extractBody
// ---------------------------------------------------------------------------

describe('extractBody', () => {
  it('extracts body after frontmatter block', async () => {
    const { extractBody } = await import('./memory.js')
    const content = `---
name: test
---

The actual body content here.`
    expect(extractBody(content)).toBe('The actual body content here.')
  })

  it('returns full content when no frontmatter present', async () => {
    const { extractBody } = await import('./memory.js')
    expect(extractBody('plain text')).toBe('plain text')
  })
})

// ---------------------------------------------------------------------------
// validateAndBuildRecord
// ---------------------------------------------------------------------------

describe('validateAndBuildRecord', () => {
  it('returns valid record for well-formed note', async () => {
    const { validateAndBuildRecord } = await import('./memory.js')
    const note = makeNote()
    const record = validateAndBuildRecord(note)
    expect(record.parse_error).toBeUndefined()
    expect(record.frontmatter.name).toBe('test-lesson')
    expect(record.frontmatter.kind).toBe('lesson')
    expect(record.frontmatter.status).toBe('stable')
    expect(record.frontmatter.captain_approved).toBe(true)
  })

  it('returns parse_error record when required field missing', async () => {
    const { validateAndBuildRecord } = await import('./memory.js')
    const note = makeNote({
      content: `---
name: broken-lesson
kind: lesson
scope: enterprise
status: stable
---
Body`,
    })
    const record = validateAndBuildRecord(note)
    expect(record.parse_error).toBe(true)
    expect(record.frontmatter.status).toBe('parse_error')
  })

  it('returns parse_error record for invalid kind', async () => {
    const { validateAndBuildRecord } = await import('./memory.js')
    const note = makeNote({
      content: `---
name: bad-kind-lesson
description: "A lesson"
kind: bad-kind
scope: enterprise
owner: captain
status: stable
---
Body`,
    })
    const record = validateAndBuildRecord(note)
    expect(record.parse_error).toBe(true)
  })

  it('accepts venture: scoped memories', async () => {
    const { validateAndBuildRecord } = await import('./memory.js')
    const note = makeNote({
      content: `---
name: venture-lesson
description: "A venture lesson"
kind: lesson
scope: venture:ke
owner: captain
status: stable
captain_approved: false
version: 1.0.0
---
Always check the KE-specific config before deploying.`,
    })
    const record = validateAndBuildRecord(note)
    expect(record.parse_error).toBeUndefined()
    expect(record.frontmatter.scope).toBe('venture:ke')
  })
})

// ---------------------------------------------------------------------------
// checkMemoryability
// ---------------------------------------------------------------------------

describe('checkMemoryability', () => {
  it('passes a good lesson body', async () => {
    const { checkMemoryability } = await import('./memory.js')
    const result = checkMemoryability(
      'Always run the integration tests before merging any database migration changes.',
      'lesson',
      [],
      'run-integration-tests'
    )
    expect(result.ok).toBe(true)
    expect(result.failed_test).toBeUndefined()
  })

  it('fails when body is not actionable (no imperative verb)', async () => {
    const { checkMemoryability } = await import('./memory.js')
    const result = checkMemoryability(
      'The integration tests exist for database migrations and have been useful.',
      'lesson',
      [],
      'some-lesson'
    )
    expect(result.ok).toBe(false)
    expect(result.failed_test).toMatch(/Actionable/)
  })

  it('fails when body is too short (non-obvious test)', async () => {
    const { checkMemoryability } = await import('./memory.js')
    const result = checkMemoryability('Always use it.', 'lesson', [], 'short-lesson')
    expect(result.ok).toBe(false)
    expect(result.failed_test).toMatch(/Non-obvious/)
  })

  it('fails when duplicate name exists (non-obvious test)', async () => {
    const { checkMemoryability } = await import('./memory.js')
    const result = checkMemoryability(
      'Always run tests before merging to avoid unexpected regressions in production.',
      'lesson',
      ['existing-lesson'],
      'existing-lesson'
    )
    expect(result.ok).toBe(false)
    expect(result.failed_test).toMatch(/Non-obvious/)
  })

  it('warns when body contains one-off identifier without general rule', async () => {
    const { checkMemoryability } = await import('./memory.js')
    const result = checkMemoryability(
      'Never commit PR#123 patterns again because they break the build.',
      'anti-pattern',
      [],
      'pr123-lesson'
    )
    expect(result.ok).toBe(true)
    expect(result.warning).toMatch(/General-enough/)
  })

  it('skips memoryability checks for runbook kind', async () => {
    const { checkMemoryability } = await import('./memory.js')
    const result = checkMemoryability('short', 'runbook', [], 'my-runbook')
    expect(result.ok).toBe(true)
  })

  it('skips memoryability checks for incident kind', async () => {
    const { checkMemoryability } = await import('./memory.js')
    const result = checkMemoryability('short', 'incident', [], 'my-incident')
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// globMatchSimple (tested via scoreMemory with file patterns)
// ---------------------------------------------------------------------------

describe('scoreMemory with file pattern matching', () => {
  it('matches exact filename pattern', async () => {
    const { scoreMemory, validateAndBuildRecord } = await import('./memory.js')
    const note = makeAntiPatternNote({
      content: `---
name: never-skip-auth
description: "Never skip auth"
kind: anti-pattern
scope: enterprise
owner: captain
status: stable
captain_approved: true
version: 1.0.0
applies_when:
  files: ["wrangler.toml"]
---
Never skip auth.`,
    })
    const record = validateAndBuildRecord(note)
    expect(record.parse_error).toBeUndefined()
    const score = scoreMemory(record, { files: ['/project/wrangler.toml'] })
    expect(score).toBeGreaterThan(0)
  })

  it('matches suffix wildcard pattern (*.toml)', async () => {
    const { scoreMemory, validateAndBuildRecord } = await import('./memory.js')
    const note = makeNote({
      content: `---
name: toml-lesson
description: "A toml lesson"
kind: lesson
scope: enterprise
owner: captain
status: stable
captain_approved: true
version: 1.0.0
applies_when:
  files: ["*.toml"]
---
Always validate toml syntax before deploying configuration changes.`,
    })
    const record = validateAndBuildRecord(note)
    const score = scoreMemory(record, { files: ['config/wrangler.toml'] })
    expect(score).toBeGreaterThan(0)
  })

  it('returns 0 score when no context matches applies_when', async () => {
    const { scoreMemory, validateAndBuildRecord } = await import('./memory.js')
    const note = makeAntiPatternNote()
    const record = validateAndBuildRecord(note)
    const score = scoreMemory(record, { files: ['unrelated.js'] })
    expect(score).toBe(0)
  })

  it('returns 1 when no applies_when defined', async () => {
    const { scoreMemory, validateAndBuildRecord } = await import('./memory.js')
    const note = makeNote()
    const record = validateAndBuildRecord(note)
    expect(record.frontmatter.applies_when).toBeUndefined()
    const score = scoreMemory(record, { files: ['anything.ts'] })
    expect(score).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// severityWeight
// ---------------------------------------------------------------------------

describe('severityWeight', () => {
  it('returns 100 for P0', async () => {
    const { severityWeight } = await import('./memory.js')
    expect(severityWeight('P0')).toBe(100)
  })

  it('returns 10 for P1', async () => {
    const { severityWeight } = await import('./memory.js')
    expect(severityWeight('P1')).toBe(10)
  })

  it('returns 1 for P2', async () => {
    const { severityWeight } = await import('./memory.js')
    expect(severityWeight('P2')).toBe(1)
  })

  it('returns 1 for undefined severity', async () => {
    const { severityWeight } = await import('./memory.js')
    expect(severityWeight(undefined)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// serializeFrontmatter round-trip
// ---------------------------------------------------------------------------

describe('serializeFrontmatter', () => {
  it('round-trips basic fields', async () => {
    const { serializeFrontmatter, parseFrontmatter } = await import('./memory.js')
    const fm = {
      name: 'test-memory',
      description: 'A test memory',
      kind: 'lesson' as const,
      scope: 'enterprise' as const,
      owner: 'captain',
      status: 'stable' as const,
      captain_approved: true,
      version: '1.0.0',
    }
    const serialized = serializeFrontmatter(fm)
    expect(serialized).toMatch(/^---/)
    expect(serialized).toMatch(/name: test-memory/)
    expect(serialized).toMatch(/kind: lesson/)
    expect(serialized).toMatch(/captain_approved: true/)
    expect(serialized).toMatch(/---$/)

    const parsed = parseFrontmatter(`${serialized}\n\nBody`)
    expect(parsed.name).toBe('test-memory')
    expect(parsed.kind).toBe('lesson')
    expect(parsed.captain_approved).toBe(true)
  })

  // Regression: #829 — defensive coercion should keep serializer from crashing
  // even if a non-array supersedes leaks through.
  it('does not crash when supersedes is the literal string "[]" (legacy data)', async () => {
    const { serializeFrontmatter } = await import('./memory.js')
    const fm = {
      name: 'test',
      kind: 'lesson' as const,
      scope: 'enterprise' as const,
      status: 'stable' as const,
      captain_approved: false,
      version: '1.0.0',
      // Force the broken shape past the type system to simulate legacy data
      supersedes: '[]' as unknown as string[],
    }
    const serialized = serializeFrontmatter(fm)
    expect(serialized).toMatch(/supersedes: \[\]/)
  })

  it('round-trips supersedes with values', async () => {
    const { serializeFrontmatter, parseFrontmatter } = await import('./memory.js')
    const fm = {
      name: 'test',
      kind: 'lesson' as const,
      scope: 'enterprise' as const,
      status: 'stable' as const,
      captain_approved: true,
      version: '1.0.0',
      supersedes: ['note_a', 'note_b'],
    }
    const serialized = serializeFrontmatter(fm)
    expect(serialized).toMatch(/supersedes: \[note_a, note_b\]/)
    const parsed = parseFrontmatter(`${serialized}\n\nBody`)
    expect(parsed.supersedes).toEqual(['note_a', 'note_b'])
  })

  // Prong 3: verify-ledger evidence linkage. Block-list shape mirrors
  // supersedes_source so /memory-audit can render IDs alongside paths.
  it('round-trips evidence_verify_ids as block list', async () => {
    const { serializeFrontmatter, parseFrontmatter } = await import('./memory.js')
    const id1 = 'vfy_01KQZH6GHT3CC1A6AVZTH1TN1M'
    const id2 = 'vfy_01KQZH6VZ9B4B16ACRK7BWDBP2'
    const fm = {
      name: 'test',
      kind: 'lesson' as const,
      scope: 'enterprise' as const,
      status: 'draft' as const,
      captain_approved: false,
      version: '1.0.0',
      evidence_verify_ids: [id1, id2],
    }
    const serialized = serializeFrontmatter(fm)
    expect(serialized).toMatch(/evidence_verify_ids:\n {2}- vfy_/)
    expect(serialized).toContain(`  - ${id1}`)
    expect(serialized).toContain(`  - ${id2}`)
    const parsed = parseFrontmatter(`${serialized}\n\nBody`)
    expect(parsed.evidence_verify_ids).toEqual([id1, id2])
  })

  it('omits evidence_verify_ids block when empty (mirrors supersedes_source behavior)', async () => {
    const { serializeFrontmatter } = await import('./memory.js')
    const fm = {
      name: 'test',
      kind: 'lesson' as const,
      scope: 'enterprise' as const,
      status: 'stable' as const,
      captain_approved: false,
      version: '1.0.0',
    }
    const serialized = serializeFrontmatter(fm)
    expect(serialized).not.toMatch(/evidence_verify_ids/)
  })
})

describe('VERIFY_ID_REGEX', () => {
  it('accepts a real ULID-shaped vfy_ ID', async () => {
    const { VERIFY_ID_REGEX } = await import('./memory.js')
    expect(VERIFY_ID_REGEX.test('vfy_01KQZH6GHT3CC1A6AVZTH1TN1M')).toBe(true)
  })

  it('rejects non-vfy prefix', async () => {
    const { VERIFY_ID_REGEX } = await import('./memory.js')
    expect(VERIFY_ID_REGEX.test('note_01KQZH6GHT3CC1A6AVZTH1TN1M')).toBe(false)
  })

  it('rejects wrong-length suffix', async () => {
    const { VERIFY_ID_REGEX } = await import('./memory.js')
    expect(VERIFY_ID_REGEX.test('vfy_01KQZH6GHT')).toBe(false)
    expect(VERIFY_ID_REGEX.test('vfy_01KQZH6GHT3CC1A6AVZTH1TN1MEXTRA')).toBe(false)
  })

  it('rejects lowercase Crockford characters', async () => {
    const { VERIFY_ID_REGEX } = await import('./memory.js')
    expect(VERIFY_ID_REGEX.test('vfy_01kqzh6ght3cc1a6avzth1tn1m')).toBe(false)
  })

  it('rejects Crockford-excluded characters (I, L, O, U)', async () => {
    const { VERIFY_ID_REGEX } = await import('./memory.js')
    // Position the disallowed letter inside the suffix; rest is valid
    expect(VERIFY_ID_REGEX.test('vfy_01KQZH6GHT3CC1A6AVZTHI1N1M')).toBe(false)
    expect(VERIFY_ID_REGEX.test('vfy_01KQZH6GHT3CC1A6AVZTHL1N1M')).toBe(false)
    expect(VERIFY_ID_REGEX.test('vfy_01KQZH6GHT3CC1A6AVZTHO1N1M')).toBe(false)
    expect(VERIFY_ID_REGEX.test('vfy_01KQZH6GHT3CC1A6AVZTHU1N1M')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// executeMemory - top-level
// ---------------------------------------------------------------------------

describe('executeMemory', () => {
  let mockApi: {
    listNotes: ReturnType<typeof vi.fn>
    createNote: ReturnType<typeof vi.fn>
    getNote: ReturnType<typeof vi.fn>
    updateNote: ReturnType<typeof vi.fn>
    recordMemoryInvocation: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    const mod = await import('../lib/crane-api.js')
    mockApi = (mod as unknown as { _mockApi: typeof mockApi })._mockApi
    vi.clearAllMocks()
  })

  it('returns error when CRANE_CONTEXT_KEY not set', async () => {
    const { executeMemory } = await import('./memory.js')
    const savedKey = process.env.CRANE_CONTEXT_KEY
    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeMemory({
      action: 'list',
      limit: 10,
    })

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/CRANE_CONTEXT_KEY/)

    if (savedKey) process.env.CRANE_CONTEXT_KEY = savedKey
  })

  // Regression: #829 — get/update both crashed with `fm.supersedes.join is not a function`
  // because parseFrontmatter's `require('gray-matter')` always threw in the ESM dist
  // and the simple-YAML fallback returned `supersedes` as the literal string "[]".
  it('get succeeds for a note with empty inline-array supersedes', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'
    const note = makeNote({
      id: 'note-supersedes-empty',
      content: `---
name: agent-owns-commit-push-merge-deploy
description: "User is the Captain; I'm the agent."
kind: lesson
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
supersedes: []
last_validated_on: 2026-05-05
---

Body content.`,
    })
    mockApi.getNote.mockResolvedValue(note)

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({ action: 'get', id: 'note-supersedes-empty' })

    expect(result.success).toBe(true)
    expect(result.message).toMatch(/agent-owns-commit-push-merge-deploy/)
    expect(result.message).not.toMatch(/fm\.supersedes\.join/)
  })

  it('update succeeds for a note with empty inline-array supersedes', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'
    const note = makeNote({
      id: 'note-supersedes-empty',
      content: `---
name: agent-owns-commit-push-merge-deploy
description: "User is the Captain; I'm the agent."
kind: lesson
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
supersedes: []
---

Body content.`,
    })
    mockApi.getNote.mockResolvedValue(note)
    mockApi.updateNote.mockImplementation(async (_id, body) => ({ ...note, ...body }))

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'update',
      id: 'note-supersedes-empty',
      description: 'Updated description',
    })

    expect(result.success).toBe(true)
    expect(result.message).not.toMatch(/fm\.supersedes\.join/)
    expect(mockApi.updateNote).toHaveBeenCalledOnce()
    const [, updateBody] = mockApi.updateNote.mock.calls[0]
    expect(updateBody.content).toMatch(/supersedes: \[\]/)
    expect(updateBody.content).toMatch(/description: "Updated description"/)
  })

  it('save rejects body that fails actionable test', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'
    mockApi.listNotes.mockResolvedValue({ notes: [] })

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'save',
      name: 'passive-lesson',
      description: 'A passive description',
      kind: 'lesson',
      body: 'The thing that happened was that something occurred which was noteworthy.',
      scope: 'enterprise',
      owner: 'captain',
      status: 'draft',
      captain_approved: false,
      version: '1.0.0',
    })

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Actionable/)
  })

  it('recall excludes deprecated memories', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const deprecatedNote = makeNote({
      id: 'note-dep',
      content: `---
name: deprecated-lesson
description: "Old lesson"
kind: lesson
scope: enterprise
owner: captain
status: deprecated
captain_approved: true
version: 1.0.0
---
Always do the thing that was deprecated.`,
    })
    const stableNote = makeNote({
      id: 'note-stable',
      content: `---
name: stable-lesson
description: "Good lesson"
kind: lesson
scope: enterprise
owner: captain
status: stable
captain_approved: true
version: 1.0.0
---
Always run tests before merging changes to prevent regressions in production.`,
    })
    mockApi.listNotes.mockResolvedValue({ notes: [deprecatedNote, stableNote] })

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'recall',
      captain_approved_only: true,
      limit: 10,
    })

    expect(result.success).toBe(true)
    expect(result.message).not.toMatch(/deprecated-lesson/)
    expect(result.message).toMatch(/stable-lesson/)
  })

  it('recall excludes unapproved memories when captain_approved_only is true', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const unapprovedNote = makeNote({
      id: 'note-unapp',
      content: `---
name: unapproved-lesson
description: "Not yet approved"
kind: lesson
scope: enterprise
owner: captain
status: stable
captain_approved: false
version: 1.0.0
---
Always check with captain before deploying any infrastructure changes to production.`,
    })
    const approvedNote = makeNote({
      id: 'note-app',
      content: `---
name: approved-lesson
description: "Approved"
kind: lesson
scope: enterprise
owner: captain
status: stable
captain_approved: true
version: 1.0.0
---
Always run tests before merging to avoid regressions in the main branch.`,
    })
    mockApi.listNotes.mockResolvedValue({ notes: [unapprovedNote, approvedNote] })

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'recall',
      captain_approved_only: true,
      limit: 10,
    })

    expect(result.success).toBe(true)
    expect(result.message).not.toMatch(/unapproved-lesson/)
    expect(result.message).toMatch(/approved-lesson/)
  })

  it('recall includes unapproved memories when captain_approved_only is false', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const unapprovedNote = makeNote({
      id: 'note-unapp2',
      content: `---
name: unapproved-lesson-2
description: "Not yet approved"
kind: lesson
scope: enterprise
owner: captain
status: stable
captain_approved: false
version: 1.0.0
---
Always check with captain before deploying any infrastructure changes to production.`,
    })
    mockApi.listNotes.mockResolvedValue({ notes: [unapprovedNote] })

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'recall',
      captain_approved_only: false,
      limit: 10,
    })

    expect(result.success).toBe(true)
    expect(result.message).toMatch(/unapproved-lesson-2/)
  })

  it('recall excludes parse_error memories', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const brokenNote = makeNote({
      id: 'note-broken',
      content: `---
name: broken-lesson
---
Body without required fields.`,
    })
    mockApi.listNotes.mockResolvedValue({ notes: [brokenNote] })

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'recall',
      captain_approved_only: false,
      limit: 10,
    })

    expect(result.success).toBe(true)
    expect(result.message).toMatch(/No matching memories found/)
  })

  it('recall with query routes through FTS5 (q parameter passed to listNotes)', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const note = makeNote({ id: 'note-q' })
    mockApi.listNotes.mockResolvedValue({ notes: [note] })
    mockApi.recordMemoryInvocation.mockResolvedValue({})

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'recall',
      query: 'authentication test',
      captain_approved_only: false,
      limit: 5,
    })

    expect(result.success).toBe(true)
    // listNotes must be called with q param so the worker FTS5 path engages
    expect(mockApi.listNotes).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'authentication test', tag: 'memory' })
    )
  })

  it('recall query mode includes draft memories (no draft filter on query path)', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const draftNote = makeNote({
      id: 'note-draft',
      content: `---
name: draft-lesson
description: "A draft lesson"
kind: lesson
scope: enterprise
owner: agent-team
status: draft
captain_approved: false
version: 1.0.0
---
Always verify before opining.`,
    })
    mockApi.listNotes.mockResolvedValue({ notes: [draftNote] })
    mockApi.recordMemoryInvocation.mockResolvedValue({})

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'recall',
      query: 'verify',
      captain_approved_only: false,
    })

    expect(result.success).toBe(true)
    expect(result.message).toMatch(/draft-lesson/)
  })

  it('recall captain_approved_only default is false (drops gate on pull recall)', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const unapproved = makeNote({
      id: 'note-unapproved',
      content: `---
name: unapproved-lesson
description: "An unapproved lesson"
kind: lesson
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
---
This memory has not been Captain-approved.`,
    })
    mockApi.listNotes.mockResolvedValue({ notes: [unapproved] })
    mockApi.recordMemoryInvocation.mockResolvedValue({})

    const { executeMemory } = await import('./memory.js')
    // No captain_approved_only specified — must default to false and surface the unapproved entry
    const result = await executeMemory({ action: 'recall', query: 'unapproved' })

    expect(result.success).toBe(true)
    expect(result.message).toMatch(/unapproved-lesson/)
  })

  it('recall hybrid scoring places higher-severity entries above lower at equal FTS rank', async () => {
    process.env.CRANE_CONTEXT_KEY = 'test-key'

    const lowSev = makeNote({
      id: 'note-low',
      content: `---
name: low-severity
description: "Low severity"
kind: anti-pattern
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
severity: P2
---
Always run verify when shipping changes.`,
    })
    const highSev = makeNote({
      id: 'note-high',
      content: `---
name: high-severity
description: "High severity"
kind: anti-pattern
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
severity: P0
---
Always run verify when shipping changes.`,
    })
    // FTS5 returns lowSev first (lower rank score = better in raw bm25),
    // but hybrid scoring with severity should re-rank highSev above.
    mockApi.listNotes.mockResolvedValue({ notes: [lowSev, highSev] })
    mockApi.recordMemoryInvocation.mockResolvedValue({})

    const { executeMemory } = await import('./memory.js')
    const result = await executeMemory({
      action: 'recall',
      query: 'verify shipping',
      captain_approved_only: false,
    })

    expect(result.success).toBe(true)
    const highIdx = result.message.indexOf('high-severity')
    const lowIdx = result.message.indexOf('low-severity')
    expect(highIdx).toBeGreaterThan(-1)
    expect(lowIdx).toBeGreaterThan(-1)
    expect(highIdx).toBeLessThan(lowIdx)
  })
})
