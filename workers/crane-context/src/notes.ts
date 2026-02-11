/**
 * Crane Context Worker - Notes Data Access Layer
 *
 * Core D1 operations for the enterprise knowledge store:
 * Captain's Log, reference data, contacts, ideas, governance notes.
 */

import type { NoteRecord } from './types'
import {
  NOTE_CATEGORIES,
  MAX_NOTE_CONTENT_SIZE,
  VENTURES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'
import type { NoteCategory } from './constants'
import { generateNoteId, nowIso, sizeInBytes, encodeCursor, decodeCursor } from './utils'

// ============================================================================
// Create Note
// ============================================================================

export async function createNote(
  db: D1Database,
  params: {
    category: string
    title?: string
    content: string
    tags?: string[]
    venture?: string
    actor_key_id: string
  }
): Promise<NoteRecord> {
  // Validate category
  if (!NOTE_CATEGORIES.includes(params.category as NoteCategory)) {
    throw new Error(
      `Invalid category: ${params.category}. Must be one of: ${NOTE_CATEGORIES.join(', ')}`
    )
  }

  // Validate content size
  if (sizeInBytes(params.content) > MAX_NOTE_CONTENT_SIZE) {
    throw new Error(`Content exceeds maximum size of ${MAX_NOTE_CONTENT_SIZE} bytes`)
  }

  // Validate venture if provided
  if (params.venture && !VENTURES.includes(params.venture)) {
    throw new Error(`Invalid venture: ${params.venture}`)
  }

  // Validate tags if provided
  if (params.tags) {
    if (params.tags.length > 20) {
      throw new Error('Maximum 20 tags allowed')
    }
    for (const tag of params.tags) {
      if (typeof tag !== 'string' || tag.length > 50) {
        throw new Error('Each tag must be a string of at most 50 characters')
      }
    }
  }

  const id = generateNoteId()
  const now = nowIso()

  await db
    .prepare(
      `INSERT INTO notes (id, category, title, content, tags, venture, archived, created_at, updated_at, actor_key_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .bind(
      id,
      params.category,
      params.title ?? null,
      params.content,
      params.tags ? JSON.stringify(params.tags) : null,
      params.venture ?? null,
      now,
      now,
      params.actor_key_id
    )
    .run()

  const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()

  return note!
}

// ============================================================================
// List / Search Notes
// ============================================================================

export interface ListNotesFilters {
  category?: string
  venture?: string
  tag?: string
  q?: string
  include_archived?: boolean
  limit?: number
  cursor?: string
}

export interface ListNotesResult {
  notes: NoteRecord[]
  pagination?: {
    next_cursor?: string
  }
}

export async function listNotes(
  db: D1Database,
  filters: ListNotesFilters
): Promise<ListNotesResult> {
  const conditions: string[] = []
  const bindings: unknown[] = []

  // Default: exclude archived
  if (!filters.include_archived) {
    conditions.push('archived = 0')
  }

  if (filters.category) {
    conditions.push('category = ?')
    bindings.push(filters.category)
  }

  if (filters.venture) {
    conditions.push('venture = ?')
    bindings.push(filters.venture)
  }

  if (filters.tag) {
    conditions.push('tags LIKE ?')
    bindings.push(`%"${filters.tag}"%`)
  }

  if (filters.q) {
    conditions.push('(title LIKE ? OR content LIKE ?)')
    const pattern = `%${filters.q}%`
    bindings.push(pattern, pattern)
  }

  // Cursor-based pagination
  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor)
    conditions.push('(created_at < ? OR (created_at = ? AND id < ?))')
    bindings.push(cursor.timestamp, cursor.timestamp, cursor.id)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(filters.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

  // Fetch one extra to determine if there's a next page
  const query = `SELECT * FROM notes ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
  bindings.push(limit + 1)

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<NoteRecord>()

  const notes = result.results
  let nextCursor: string | undefined

  if (notes.length > limit) {
    notes.pop()
    const lastNote = notes[notes.length - 1]
    nextCursor = encodeCursor({
      timestamp: lastNote.created_at,
      id: lastNote.id,
    })
  }

  return {
    notes,
    ...(nextCursor && { pagination: { next_cursor: nextCursor } }),
  }
}

// ============================================================================
// Get Note by ID
// ============================================================================

export async function getNote(db: D1Database, id: string): Promise<NoteRecord | null> {
  return await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()
}

// ============================================================================
// Update Note
// ============================================================================

export async function updateNote(
  db: D1Database,
  id: string,
  params: {
    title?: string
    content?: string
    tags?: string[]
    venture?: string | null
    category?: string
    actor_key_id: string
  }
): Promise<NoteRecord | null> {
  const existing = await getNote(db, id)
  if (!existing) {
    return null
  }

  // Validate category if changing
  if (params.category && !NOTE_CATEGORIES.includes(params.category as NoteCategory)) {
    throw new Error(
      `Invalid category: ${params.category}. Must be one of: ${NOTE_CATEGORIES.join(', ')}`
    )
  }

  // Validate content size if changing
  if (params.content && sizeInBytes(params.content) > MAX_NOTE_CONTENT_SIZE) {
    throw new Error(`Content exceeds maximum size of ${MAX_NOTE_CONTENT_SIZE} bytes`)
  }

  // Validate venture if changing
  if (
    params.venture !== undefined &&
    params.venture !== null &&
    !VENTURES.includes(params.venture)
  ) {
    throw new Error(`Invalid venture: ${params.venture}`)
  }

  // Validate tags if changing
  if (params.tags) {
    if (params.tags.length > 20) {
      throw new Error('Maximum 20 tags allowed')
    }
    for (const tag of params.tags) {
      if (typeof tag !== 'string' || tag.length > 50) {
        throw new Error('Each tag must be a string of at most 50 characters')
      }
    }
  }

  const now = nowIso()
  const setClauses: string[] = []
  const bindings: unknown[] = []

  if (params.title !== undefined) {
    setClauses.push('title = ?')
    bindings.push(params.title)
  }
  if (params.content !== undefined) {
    setClauses.push('content = ?')
    bindings.push(params.content)
  }
  if (params.tags !== undefined) {
    setClauses.push('tags = ?')
    bindings.push(JSON.stringify(params.tags))
  }
  if (params.venture !== undefined) {
    setClauses.push('venture = ?')
    bindings.push(params.venture)
  }
  if (params.category !== undefined) {
    setClauses.push('category = ?')
    bindings.push(params.category)
  }

  // Always update timestamp and actor
  setClauses.push('updated_at = ?')
  bindings.push(now)
  setClauses.push('actor_key_id = ?')
  bindings.push(params.actor_key_id)

  bindings.push(id)

  await db
    .prepare(`UPDATE notes SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run()

  return await getNote(db, id)
}

// ============================================================================
// Archive Note (Soft Delete)
// ============================================================================

export async function archiveNote(
  db: D1Database,
  id: string,
  actor_key_id: string
): Promise<NoteRecord | null> {
  const existing = await getNote(db, id)
  if (!existing) {
    return null
  }

  const now = nowIso()

  await db
    .prepare('UPDATE notes SET archived = 1, updated_at = ?, actor_key_id = ? WHERE id = ?')
    .bind(now, actor_key_id, id)
    .run()

  return await getNote(db, id)
}
