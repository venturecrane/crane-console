import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
  invoke,
  installWorkerdPolyfills,
} from '@venturecrane/crane-test-harness'
import worker from '../../src/index'
import type { Env } from '../../src/types'
import type { D1Database } from '@cloudflare/workers-types'

beforeAll(() => {
  installWorkerdPolyfills()
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'migrations')

interface NoteRecord {
  id: string
  title: string | null
  content: string
  tags: string | null
  venture: string | null
  archived: number
  created_at: string
  updated_at: string
  actor_key_id: string | null
}

interface NoteResponse {
  note: NoteRecord
  correlation_id: string
}

interface ListNotesResponse {
  notes: NoteRecord[]
  count: number
  total_matching: number
  correlation_id: string
  pagination?: { next_cursor?: string }
}

describe('Notes endpoints (via harness)', () => {
  let db: D1Database
  let env: Env

  const headers = { 'X-Relay-Key': 'test-relay-key' }

  beforeEach(async () => {
    db = createTestD1()
    await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
    env = {
      DB: db,
      CONTEXT_RELAY_KEY: 'test-relay-key',
      CONTEXT_ADMIN_KEY: 'test-admin-key',
      CONTEXT_SESSION_STALE_MINUTES: '45',
      IDEMPOTENCY_TTL_SECONDS: '3600',
      HEARTBEAT_INTERVAL_SECONDS: '600',
      HEARTBEAT_JITTER_SECONDS: '120',
    }
  })

  // ============================================================
  // POST /notes — create
  // ============================================================

  it('POST /notes: creates a note and returns 201 with the note record', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Hello from test', title: 'Test Note', tags: ['test'], venture: 'vc' },
      env,
    })

    expect(res.status).toBe(201)
    const json = (await res.json()) as NoteResponse
    expect(json.note).toBeDefined()
    expect(json.note.id).toMatch(/^note_/)
    expect(json.note.content).toBe('Hello from test')
    expect(json.note.title).toBe('Test Note')
    expect(JSON.parse(json.note.tags!)).toEqual(['test'])
    expect(json.note.venture).toBe('vc')
    expect(json.note.archived).toBe(0)
    expect(json.correlation_id).toBeDefined()

    // Verify DB side effect
    const row = await db
      .prepare('SELECT * FROM notes WHERE id = ?')
      .bind(json.note.id)
      .first<NoteRecord>()
    expect(row).not.toBeNull()
    expect(row!.content).toBe('Hello from test')
  })

  it('POST /notes: creates note without optional fields', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Minimal note' },
      env,
    })

    expect(res.status).toBe(201)
    const json = (await res.json()) as NoteResponse
    expect(json.note.title).toBeNull()
    expect(json.note.tags).toBeNull()
    expect(json.note.venture).toBeNull()
  })

  it('POST /notes: missing auth returns 401', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers: {},
      body: { content: 'No auth' },
      env,
    })
    expect(res.status).toBe(401)
  })

  it('POST /notes: wrong auth key returns 401', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers: { 'X-Relay-Key': 'wrong-key' },
      body: { content: 'Bad auth' },
      env,
    })
    expect(res.status).toBe(401)
  })

  it('POST /notes: missing content returns 400', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { title: 'No content here' },
      env,
    })
    expect(res.status).toBe(400)
  })

  it('POST /notes: invalid venture code returns 400', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Test', venture: 'invalid-venture-xyz' },
      env,
    })
    expect(res.status).toBe(400)
  })

  // ============================================================
  // GET /notes — list
  // ============================================================

  it('GET /notes: lists all non-archived notes', async () => {
    // Create two notes
    await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'First', tags: ['prd'] },
      env,
    })
    await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Second', tags: ['bio'] },
      env,
    })

    const res = await invoke(worker, { method: 'GET', path: '/notes', headers, env })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ListNotesResponse
    expect(json.notes).toHaveLength(2)
    expect(json.count).toBe(2)
    expect(json.total_matching).toBe(2)
  })

  it('GET /notes: filters by tag', async () => {
    await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Tagged prd', tags: ['prd'] },
      env,
    })
    await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Tagged bio', tags: ['bio'] },
      env,
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/notes?tag=prd',
      headers,
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ListNotesResponse
    expect(json.notes).toHaveLength(1)
    expect(json.notes[0].content).toBe('Tagged prd')
  })

  it('GET /notes: full-text search with ?q', async () => {
    await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'The quick brown fox' },
      env,
    })
    await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Lazy dog sits' },
      env,
    })

    const res = await invoke(worker, { method: 'GET', path: '/notes?q=quick', headers, env })
    expect(res.status).toBe(200)
    const json = (await res.json()) as ListNotesResponse
    expect(json.notes).toHaveLength(1)
    expect(json.notes[0].content).toContain('quick')
  })

  it('GET /notes: excludes archived notes by default', async () => {
    const createRes = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Will be archived' },
      env,
    })
    const { note } = (await createRes.json()) as NoteResponse

    // Archive it
    await invoke(worker, {
      method: 'POST',
      path: `/notes/${note.id}/archive`,
      headers,
      body: {},
      env,
    })

    const res = await invoke(worker, { method: 'GET', path: '/notes', headers, env })
    const json = (await res.json()) as ListNotesResponse
    expect(json.notes).toHaveLength(0)
  })

  it('GET /notes: includes archived when include_archived=true', async () => {
    const createRes = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Will be archived' },
      env,
    })
    const { note } = (await createRes.json()) as NoteResponse

    await invoke(worker, {
      method: 'POST',
      path: `/notes/${note.id}/archive`,
      headers,
      body: {},
      env,
    })

    const res = await invoke(worker, {
      method: 'GET',
      path: '/notes?include_archived=true',
      headers,
      env,
    })
    const json = (await res.json()) as ListNotesResponse
    expect(json.notes).toHaveLength(1)
    expect(json.notes[0].archived).toBe(1)
  })

  it('GET /notes: missing auth returns 401', async () => {
    const res = await invoke(worker, { method: 'GET', path: '/notes', headers: {}, env })
    expect(res.status).toBe(401)
  })

  // ============================================================
  // GET /notes/:id — get by id
  // ============================================================

  it('GET /notes/:id: returns a specific note by id', async () => {
    const createRes = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Find me', title: 'Findable' },
      env,
    })
    const { note } = (await createRes.json()) as NoteResponse

    const res = await invoke(worker, {
      method: 'GET',
      path: `/notes/${note.id}`,
      headers,
      env,
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as NoteResponse
    expect(json.note.id).toBe(note.id)
    expect(json.note.content).toBe('Find me')
    expect(json.note.title).toBe('Findable')
  })

  it('GET /notes/:id: returns 404 for unknown id', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/notes/note_0000000000000000000000000',
      headers,
      env,
    })
    expect(res.status).toBe(404)
  })

  it('GET /notes/:id: missing auth returns 401', async () => {
    const res = await invoke(worker, {
      method: 'GET',
      path: '/notes/note_anything',
      headers: {},
      env,
    })
    expect(res.status).toBe(401)
  })

  // ============================================================
  // POST /notes/:id/update — update
  // ============================================================

  it('POST /notes/:id/update: updates note fields and persists to DB', async () => {
    const createRes = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'Original', title: 'Old Title', tags: ['old'] },
      env,
    })
    const { note } = (await createRes.json()) as NoteResponse

    const updateRes = await invoke(worker, {
      method: 'POST',
      path: `/notes/${note.id}/update`,
      headers,
      body: { content: 'Updated content', title: 'New Title', tags: ['new'] },
      env,
    })
    expect(updateRes.status).toBe(200)
    const json = (await updateRes.json()) as NoteResponse
    expect(json.note.content).toBe('Updated content')
    expect(json.note.title).toBe('New Title')
    expect(JSON.parse(json.note.tags!)).toEqual(['new'])

    // Verify DB side effect
    const row = await db
      .prepare('SELECT content, title, tags FROM notes WHERE id = ?')
      .bind(note.id)
      .first<{ content: string; title: string; tags: string }>()
    expect(row!.content).toBe('Updated content')
    expect(row!.title).toBe('New Title')
  })

  it('POST /notes/:id/update: returns 404 for unknown id', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes/note_0000000000000000000000000/update',
      headers,
      body: { content: 'Does not exist' },
      env,
    })
    expect(res.status).toBe(404)
  })

  it('POST /notes/:id/update: missing auth returns 401', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes/note_anything/update',
      headers: {},
      body: { content: 'x' },
      env,
    })
    expect(res.status).toBe(401)
  })

  // ============================================================
  // POST /notes/:id/archive — soft delete
  // ============================================================

  it('POST /notes/:id/archive: archives note and sets archived=1 in DB', async () => {
    const createRes = await invoke(worker, {
      method: 'POST',
      path: '/notes',
      headers,
      body: { content: 'To be archived' },
      env,
    })
    const { note } = (await createRes.json()) as NoteResponse

    const archiveRes = await invoke(worker, {
      method: 'POST',
      path: `/notes/${note.id}/archive`,
      headers,
      body: {},
      env,
    })
    expect(archiveRes.status).toBe(200)
    const json = (await archiveRes.json()) as { note: NoteRecord; archived: boolean }
    expect(json.archived).toBe(true)
    expect(json.note.archived).toBe(1)

    // Verify DB side effect
    const row = await db
      .prepare('SELECT archived FROM notes WHERE id = ?')
      .bind(note.id)
      .first<{ archived: number }>()
    expect(row!.archived).toBe(1)
  })

  it('POST /notes/:id/archive: returns 404 for unknown id', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes/note_0000000000000000000000000/archive',
      headers,
      body: {},
      env,
    })
    expect(res.status).toBe(404)
  })

  it('POST /notes/:id/archive: missing auth returns 401', async () => {
    const res = await invoke(worker, {
      method: 'POST',
      path: '/notes/note_anything/archive',
      headers: {},
      body: {},
      env,
    })
    expect(res.status).toBe(401)
  })
})
