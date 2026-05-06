/**
 * Crane Context Worker - Notes Data Access Layer
 *
 * Core D1 operations for the enterprise knowledge store (VCMS).
 * Tags-only taxonomy - no categories.
 */

import type { NoteRecord } from './types'
import { VENTURES } from './constants'
import { generateNoteId, nowIso, encodeCursor } from './utils'
import { assertContentSize, assertValidVenture, assertValidTags } from './notes-validate'
import { buildFilterClause, buildQuerySet } from './notes-query'

// Re-export so callers that import buildFts5MatchExpr from './notes' keep working.
export { buildFts5MatchExpr } from './notes-query'

// ============================================================================
// Public interfaces
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
    source_hash?: string
    authored_by_session_id?: string
  }
): Promise<NoteRecord> {
  assertContentSize(params.content)
  if (params.venture) assertValidVenture(params.venture)
  if (params.tags) assertValidTags(params.tags)

  // UPSERT by source_hash: if a note with this source_hash already exists,
  // update its body in place (provenance idempotency for migrate scripts).
  if (params.source_hash) {
    const upserted = await upsertBySourceHash(db, params)
    if (upserted) return upserted
  }

  return insertNewNote(db, params)
}

// ---------------------------------------------------------------------------
// createNote helpers
// ---------------------------------------------------------------------------

async function upsertBySourceHash(
  db: D1Database,
  params: Parameters<typeof createNote>[1]
): Promise<NoteRecord | null> {
  const existing = await db
    .prepare('SELECT id FROM notes WHERE source_hash = ? LIMIT 1')
    .bind(params.source_hash!)
    .first<{ id: string }>()
  if (!existing) return null

  const now = nowIso()
  await db
    .prepare(
      `UPDATE notes
         SET title = ?, content = ?, tags = ?, venture = ?, updated_at = ?,
             authored_by_session_id = COALESCE(?, authored_by_session_id)
       WHERE id = ?`
    )
    .bind(
      params.title ?? null,
      params.content,
      params.tags ? JSON.stringify(params.tags) : null,
      params.venture ?? null,
      now,
      params.authored_by_session_id ?? null,
      existing.id
    )
    .run()

  return db.prepare('SELECT * FROM notes WHERE id = ?').bind(existing.id).first<NoteRecord>()
}

async function insertNewNote(
  db: D1Database,
  params: Parameters<typeof createNote>[1]
): Promise<NoteRecord> {
  const id = generateNoteId()
  const now = nowIso()

  await db
    .prepare(
      `INSERT INTO notes (id, title, content, tags, venture, archived, created_at, updated_at, actor_key_id, source_hash, authored_by_session_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.title ?? null,
      params.content,
      params.tags ? JSON.stringify(params.tags) : null,
      params.venture ?? null,
      now,
      now,
      params.actor_key_id,
      params.source_hash ?? null,
      params.authored_by_session_id ?? null
    )
    .run()

  return (await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>())!
}

// ============================================================================
// List / Search Notes
// ============================================================================

export async function listNotes(
  db: D1Database,
  filters: ListNotesFilters
): Promise<ListNotesResult> {
  // Build the filter clauses ONCE and reuse them for both the row query
  // (with cursor + limit) and the COUNT(*) query (without). The count is
  // the true total matching the filters — Plan §B.2/B.4 (defect #5).
  const filter = buildFilterClause(filters)
  const { rowQuery, rowBindings, countQuery, countBindings, limit } = buildQuerySet(filters, filter)

  const [rowResult, countResult] = await db.batch<NoteRecord | { total: number }>([
    db.prepare(rowQuery).bind(...rowBindings),
    db.prepare(countQuery).bind(...countBindings),
  ])

  const notes = (rowResult.results || []) as NoteRecord[]
  const totalMatching = ((countResult.results?.[0] as { total?: number } | undefined)?.total ??
    0) as number

  let nextCursor: string | undefined
  if (notes.length > limit) {
    notes.pop()
    const lastNote = notes[notes.length - 1]
    nextCursor = encodeCursor({ timestamp: lastNote.created_at, id: lastNote.id })
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
  if (!existing) return null

  if (params.content) assertContentSize(params.content)
  if (params.venture !== undefined && params.venture !== null) assertValidVenture(params.venture)
  if (params.tags) assertValidTags(params.tags)

  const { setClauses, bindings } = buildUpdateFields(params)

  // Always update timestamp and actor
  setClauses.push('updated_at = ?', 'actor_key_id = ?')
  bindings.push(nowIso(), params.actor_key_id, id)

  await db
    .prepare(`UPDATE notes SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run()

  return getNote(db, id)
}

// ---------------------------------------------------------------------------
// updateNote helper
// ---------------------------------------------------------------------------

function buildUpdateFields(params: {
  title?: string
  content?: string
  tags?: string[]
  venture?: string | null
}): { setClauses: string[]; bindings: unknown[] } {
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

  return { setClauses, bindings }
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
  if (!existing) return null

  const now = nowIso()
  await db
    .prepare('UPDATE notes SET archived = 1, updated_at = ?, actor_key_id = ? WHERE id = ?')
    .bind(now, actor_key_id, id)
    .run()

  return getNote(db, id)
}

// ============================================================================
// Validation re-exports (for callers that test these directly)
// ============================================================================

export { assertContentSize, assertValidVenture, assertValidTags } from './notes-validate'

// Venture list is not part of the notes module's core contract, but some
// endpoints reference it via the notes import path; keep the re-export for
// backward compatibility.
export { VENTURES }
