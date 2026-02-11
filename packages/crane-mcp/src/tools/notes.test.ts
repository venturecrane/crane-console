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

  it('creates a log note', async () => {
    const { executeNote } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: {
          id: 'note_01ABC',
          category: 'log',
          title: null,
          content: 'Decided to push KE beta to March.',
          tags: null,
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
      category: 'log',
      content: 'Decided to push KE beta to March.',
      venture: 'ke',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('note_01ABC')
    expect(result.message).toContain('log')
  })

  it('creates a reference note with title and tags', async () => {
    const { executeNote } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        note: {
          id: 'note_01DEF',
          category: 'reference',
          title: 'Cloudflare Account ID',
          content: 'ab6cc9362f7e51ba9a610aec1fc3a833',
          tags: '["cloudflare","infra"]',
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
      category: 'reference',
      title: 'Cloudflare Account ID',
      content: 'ab6cc9362f7e51ba9a610aec1fc3a833',
      tags: ['cloudflare', 'infra'],
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
      category: 'log',
      content: 'test',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY not found')
  })

  it('returns error when category missing for create', async () => {
    const { executeNote } = await getModule()

    const result = await executeNote({
      action: 'create',
      content: 'test',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Category is required')
  })

  it('returns error when content missing for create', async () => {
    const { executeNote } = await getModule()

    const result = await executeNote({
      action: 'create',
      category: 'log',
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
          category: 'reference',
          title: 'Cloudflare Account ID',
          content: '123abc',
          tags: '["cloudflare","infra"]',
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
      category: 'log',
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
            category: 'log',
            title: 'KE Beta Decision',
            content: 'Decided to push KE beta to March.',
            tags: null,
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

  it('filters by category and venture', async () => {
    const { executeNotes } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notes: [],
        count: 0,
      }),
    })

    const result = await executeNotes({
      category: 'log',
      venture: 'ke',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('No notes found')
    expect(result.message).toContain('category=log')
    expect(result.message).toContain('venture=ke')

    // Verify query params passed correctly
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('category=log')
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
            category: 'reference',
            title: 'Cloudflare Account ID',
            content: 'ab6cc9362f7e51ba9a610aec1fc3a833',
            tags: '["cloudflare"]',
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
