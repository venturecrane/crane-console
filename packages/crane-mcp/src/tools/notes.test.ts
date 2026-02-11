/**
 * Tests for notes.ts tools (crane_note / crane_notes)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getModule = async () => {
  vi.resetModules()
  return import('./notes.js')
}

describe('crane_note tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' }

    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates a note with tags', async () => {
    const { executeNote } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: {
          id: 'note_01ABC',
          title: null,
          content: 'Decided to push KE beta to March.',
          tags: '["strategy"]',
          venture: 'ke',
          archived: 0,
          created_at: '2026-02-10T00:00:00.000Z',
          updated_at: '2026-02-10T00:00:00.000Z',
          actor_key_id: 'abc123',
          meta_json: null,
        },
      }),
    })

    const result = await executeNote({
      action: 'create',
      content: 'Decided to push KE beta to March.',
      tags: ['strategy'],
      venture: 'ke',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('note_01ABC')
    expect(result.message).toContain('strategy')
  })

  it('creates a note with title and multiple tags', async () => {
    const { executeNote } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: {
          id: 'note_01DEF',
          title: 'Cloudflare Account ID',
          content: 'ab6cc9362f7e51ba9a610aec1fc3a833',
          tags: '["methodology","governance"]',
          venture: null,
          archived: 0,
          created_at: '2026-02-10T00:00:00.000Z',
          updated_at: '2026-02-10T00:00:00.000Z',
          actor_key_id: 'abc123',
          meta_json: null,
        },
      }),
    })

    const result = await executeNote({
      action: 'create',
      title: 'Cloudflare Account ID',
      content: 'ab6cc9362f7e51ba9a610aec1fc3a833',
      tags: ['methodology', 'governance'],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('note_01DEF')
    expect(result.message).toContain('Cloudflare Account ID')
  })

  it('returns error when API key missing', async () => {
    const { executeNote } = await getModule()

    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeNote({
      action: 'create',
      content: 'test',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not found')
  })

  it('returns error when content missing for create', async () => {
    const { executeNote } = await getModule()

    const result = await executeNote({
      action: 'create',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Content is required')
  })

  it('updates an existing note', async () => {
    const { executeNote } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: {
          id: 'note_01ABC',
          title: 'Cloudflare Account ID',
          content: '123abc',
          tags: '["governance"]',
          venture: null,
          archived: 0,
          created_at: '2026-02-10T00:00:00.000Z',
          updated_at: '2026-02-10T01:00:00.000Z',
          actor_key_id: 'abc123',
          meta_json: null,
        },
      }),
    })

    const result = await executeNote({
      action: 'update',
      id: 'note_01ABC',
      content: '123abc',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('Note updated')
    expect(result.message).toContain('note_01ABC')
  })

  it('returns error when ID missing for update', async () => {
    const { executeNote } = await getModule()

    const result = await executeNote({
      action: 'update',
      content: 'new content',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Note ID is required')
  })

  it('handles API errors on create', async () => {
    const { executeNote } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })

    const result = await executeNote({
      action: 'create',
      content: 'test',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to create note')
  })
})

describe('crane_notes tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' }

    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('lists notes with no filters', async () => {
    const { executeNotes } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notes: [
          {
            id: 'note_01ABC',
            title: 'KE Beta Decision',
            content: 'Decided to push KE beta to March.',
            tags: '["strategy"]',
            venture: 'ke',
            archived: 0,
            created_at: '2026-02-10T00:00:00.000Z',
            updated_at: '2026-02-10T00:00:00.000Z',
            actor_key_id: 'abc123',
            meta_json: null,
          },
        ],
        count: 1,
      }),
    })

    const result = await executeNotes({})

    expect(result.success).toBe(true)
    expect(result.message).toContain('1 note')
    expect(result.message).toContain('KE Beta Decision')
    expect(result.message).toContain('note_01ABC')
  })

  it('filters by tag and venture', async () => {
    const { executeNotes } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notes: [],
        count: 0,
      }),
    })

    const result = await executeNotes({
      tag: 'executive-summary',
      venture: 'ke',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('No notes found')
    expect(result.message).toContain('tag=executive-summary')
    expect(result.message).toContain('venture=ke')

    // Verify query params passed correctly
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('tag=executive-summary')
    expect(url).toContain('venture=ke')
  })

  it('searches by text query', async () => {
    const { executeNotes } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notes: [
          {
            id: 'note_01DEF',
            title: 'Cloudflare Account ID',
            content: 'ab6cc9362f7e51ba9a610aec1fc3a833',
            tags: '["governance"]',
            venture: null,
            archived: 0,
            created_at: '2026-02-10T00:00:00.000Z',
            updated_at: '2026-02-10T00:00:00.000Z',
            actor_key_id: 'abc123',
            meta_json: null,
          },
        ],
        count: 1,
      }),
    })

    const result = await executeNotes({ q: 'cloudflare' })

    expect(result.success).toBe(true)
    expect(result.message).toContain('Cloudflare Account ID')
  })

  it('returns error when API key missing', async () => {
    const { executeNotes } = await getModule()

    delete process.env.CRANE_CONTEXT_KEY

    const result = await executeNotes({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not found')
  })

  it('handles API errors', async () => {
    const { executeNotes } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await executeNotes({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to search notes')
  })
})
