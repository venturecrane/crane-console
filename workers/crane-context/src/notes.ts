/**
 * Crane Context Worker - Notes Data Access Layer
 *
 * Core D1 operations for the enterprise knowledge store (VCMS).
 * Tags-only taxonomy - no categories.
 */

import type { NoteRecord } from './types'
import { MAX_NOTE_CONTENT_SIZE, VENTURES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { generateNoteId, nowIso, sizeInBytes, encodeCursor, decodeCursor } from './utils'

// ============================================================================
// Create Note
// ============================================================================

export async function createNote(
  db: D1Database,
  params: {
    title?: string
    content: string
    tags?: string[]
    venture?: string
    actor_key_id: string
  }
): Promise<NoteRecord> {
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
      `INSERT INTO notes (id, title, content, tags, venture, archived, created_at, updated_at, actor_key_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .bind(
      id,
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
  venture?: string
  tag?: string
  tags?: string[]
  q?: string
  include_archived?: boolean
  include_global?: boolean
  metadata_only?: boolean
  limit?: number
  cursor?: string
}

export interface ListNotesResult {
  notes: NoteRecord[]
  total_matching: number
  pagination?: {
    next_cursor?: string
  }
}

export async function listNotes(
  db: D1Database,
  filters: ListNotesFilters
): Promise<ListNotesResult> {
  // Build the filter clauses ONCE and reuse them for both the row query
  // (with cursor + limit) and the COUNT(*) query (without). The count is
  // the true total matching the filters — Plan §B.2/B.4 (defect #5).
  const filterConditions: string[] = []
  const filterBindings: unknown[] = []

  // Default: exclude archived
  if (!filters.include_archived) {
    filterConditions.push('archived = 0')
  }

  if (filters.venture) {
    if (filters.include_global) {
      filterConditions.push('(venture IS NULL OR venture = ?)')
    } else {
      filterConditions.push('venture = ?')
    }
    filterBindings.push(filters.venture)
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map(() => 'tags LIKE ?')
    filterConditions.push(`(${tagConditions.join(' OR ')})`)
    for (const t of filters.tags) {
      filterBindings.push(`%"${t}"%`)
    }
  } else if (filters.tag) {
    filterConditions.push('tags LIKE ?')
    filterBindings.push(`%"${filters.tag}"%`)
  }

  if (filters.q) {
    filterConditions.push('(title LIKE ? OR content LIKE ?)')
    const pattern = `%${filters.q}%`
    filterBindings.push(pattern, pattern)
  }

  // The row query layers cursor pagination on top of the filter conditions.
  const rowConditions = [...filterConditions]
  const rowBindings: unknown[] = [...filterBindings]
  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor)
    rowConditions.push('(created_at < ? OR (created_at = ? AND id < ?))')
    rowBindings.push(cursor.timestamp, cursor.timestamp, cursor.id)
  }

  const limit = Math.min(filters.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

  const rowWhere = rowConditions.length > 0 ? `WHERE ${rowConditions.join(' AND ')}` : ''
  const filterWhere = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''

  const selectClause = filters.metadata_only
    ? 'SELECT id, title, tags, venture, updated_at'
    : 'SELECT *'
  const rowQuery = `${selectClause} FROM notes ${rowWhere} ORDER BY created_at DESC, id DESC LIMIT ?`
  rowBindings.push(limit + 1)

  const countQuery = `SELECT COUNT(*) as total FROM notes ${filterWhere}`

  const [rowResult, countResult] = await db.batch<NoteRecord | { total: number }>([
    db.prepare(rowQuery).bind(...rowBindings),
    db.prepare(countQuery).bind(...filterBindings),
  ])

  const notes = (rowResult.results || []) as NoteRecord[]
  const totalMatching = ((countResult.results?.[0] as { total?: number } | undefined)?.total ??
    0) as number
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
    total_matching: totalMatching,
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
    actor_key_id: string
  }
): Promise<NoteRecord | null> {
  const existing = await getNote(db, id)
  if (!existing) {
    return null
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
// Fetch Enterprise Context (for SOD)
// ============================================================================

export async function fetchEnterpriseContext(
  db: D1Database,
  venture: string,
  options?: { limit?: number }
): Promise<NoteRecord[]> {
  const limitClause = options?.limit ? ` LIMIT ${options.limit}` : ''
  const result = await db
    .prepare(
      `SELECT * FROM notes
       WHERE tags LIKE '%"executive-summary"%'
         AND (venture IS NULL OR venture = ?)
         AND archived = 0
       ORDER BY created_at DESC${limitClause}`
    )
    .bind(venture)
    .all<NoteRecord>()
  return result.results
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
