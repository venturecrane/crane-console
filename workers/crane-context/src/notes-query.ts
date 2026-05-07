/**
 * Crane Context Worker - Notes Query Builders
 *
 * SQL assembly helpers for listNotes. Separated to keep each concern
 * within the function-line and complexity ceilings.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { decodeCursor } from './utils'
import type { ListNotesFilters } from './notes'

// ---------------------------------------------------------------------------
// FTS5 query builder (canonical home; re-exported from notes.ts)
// ---------------------------------------------------------------------------

/**
 * Convert a freeform user query into a safe FTS5 MATCH expression.
 * Strategy: split on whitespace, drop tokens shorter than 2 chars or
 * containing only non-alphanumerics, double-quote each survivor (escaping
 * embedded double quotes by doubling), and AND-join with space (FTS5
 * default conjunction). Returns null for queries that yield zero usable
 * tokens; caller should fall back to LIKE in that case (the wrapper here
 * just returns the empty string and lets bm25 sort an empty match set).
 */
export function buildFts5MatchExpr(q: string): string {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]+/gu, ''))
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) {
    return '""'
  }
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterClause {
  conditions: string[]
  bindings: unknown[]
}

export interface QuerySet {
  rowQuery: string
  rowBindings: unknown[]
  countQuery: string
  countBindings: unknown[]
  limit: number
}

// ---------------------------------------------------------------------------
// Filter clause builder
// ---------------------------------------------------------------------------

/**
 * Build the WHERE-level conditions that apply to both the row query and the
 * COUNT query (i.e. everything except cursor pagination).
 */
export function buildFilterClause(filters: ListNotesFilters): FilterClause {
  const conditions: string[] = []
  const bindings: unknown[] = []

  if (!filters.include_archived) {
    conditions.push('archived = 0')
  }

  if (filters.venture) {
    if (filters.include_global) {
      conditions.push('(venture IS NULL OR venture = ?)')
    } else {
      conditions.push('venture = ?')
    }
    bindings.push(filters.venture)
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map(() => 'tags LIKE ?')
    conditions.push(`(${tagConditions.join(' OR ')})`)
    for (const t of filters.tags) {
      bindings.push(`%"${t}"%`)
    }
  } else if (filters.tag) {
    conditions.push('tags LIKE ?')
    bindings.push(`%"${filters.tag}"%`)
  }

  // FTS5 routing is handled at query-build time; non-FTS text search appended here.
  const isMemoryFtsQuery =
    !!filters.q && (filters.tag === 'memory' || !!filters.tags?.includes('memory'))

  if (filters.q && !isMemoryFtsQuery) {
    conditions.push('(title LIKE ? OR content LIKE ?)')
    const pattern = `%${filters.q}%`
    bindings.push(pattern, pattern)
  }

  return { conditions, bindings }
}

// ---------------------------------------------------------------------------
// Row + count query assembler
// ---------------------------------------------------------------------------

/**
 * Assemble the paired row and count queries from the filter clause.
 * Cursor pagination is applied only to the row query.
 */
export function buildQuerySet(filters: ListNotesFilters, filter: FilterClause): QuerySet {
  const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

  const isMemoryFtsQuery =
    !!filters.q && (filters.tag === 'memory' || !!filters.tags?.includes('memory'))
  const fts5MatchExpr = isMemoryFtsQuery ? buildFts5MatchExpr(filters.q!) : null

  // Row query: filter conditions + cursor predicate
  const rowConditions = [...filter.conditions]
  const rowBindings: unknown[] = [...filter.bindings]

  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor)
    rowConditions.push('(created_at < ? OR (created_at = ? AND id < ?))')
    rowBindings.push(cursor.timestamp, cursor.timestamp, cursor.id)
  }

  const filterWhere = filter.conditions.length > 0 ? `WHERE ${filter.conditions.join(' AND ')}` : ''

  let rowQuery: string
  if (isMemoryFtsQuery) {
    rowQuery = buildFtsRowQuery(filters, fts5MatchExpr!, rowConditions)
    rowBindings.unshift(fts5MatchExpr!)
  } else {
    const selectClause = filters.metadata_only
      ? 'SELECT id, title, tags, venture, updated_at'
      : 'SELECT *'
    const rowWhere = rowConditions.length > 0 ? `WHERE ${rowConditions.join(' AND ')}` : ''
    rowQuery = `${selectClause} FROM notes ${rowWhere} ORDER BY created_at DESC, id DESC LIMIT ?`
  }
  rowBindings.push(limit + 1)

  // Count query: filter conditions only (no cursor, no limit)
  const countQuery = isMemoryFtsQuery
    ? buildFtsCountQuery(filter.conditions, fts5MatchExpr!)
    : `SELECT COUNT(*) as total FROM notes ${filterWhere}`
  const countBindings: unknown[] = isMemoryFtsQuery
    ? [fts5MatchExpr!, ...filter.bindings]
    : [...filter.bindings]

  return { rowQuery, rowBindings, countQuery, countBindings, limit }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildFtsRowQuery(
  filters: ListNotesFilters,
  matchExpr: string,
  rowConditions: string[]
): string {
  const ftsRowConditions = rowConditions.filter((c) => c !== '(title LIKE ? OR content LIKE ?)')
  const ftsWhere = ftsRowConditions.length > 0 ? `AND ${ftsRowConditions.join(' AND ')}` : ''
  const tableSelect = filters.metadata_only
    ? 'n.id, n.title, n.tags, n.venture, n.updated_at'
    : 'n.*'
  return `SELECT ${tableSelect} FROM notes_fts JOIN notes n ON notes_fts.rowid = n.rowid WHERE notes_fts MATCH ? ${ftsWhere} ORDER BY bm25(notes_fts) ASC LIMIT ?`
}

function buildFtsCountQuery(filterConditions: string[], _matchExpr: string): string {
  const extra = filterConditions.length > 0 ? `AND ${filterConditions.join(' AND ')}` : ''
  return `SELECT COUNT(*) as total FROM notes_fts JOIN notes n ON notes_fts.rowid = n.rowid WHERE notes_fts MATCH ? ${extra}`
}
