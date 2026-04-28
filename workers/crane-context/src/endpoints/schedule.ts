/**
 * Crane Context Worker - Schedule Endpoints
 *
 * Cadence Engine: briefing surface and completion recording.
 * Status is computed at read time from last_completed_at + cadence_days.
 */

import type { Env, ScheduleItemRecord } from '../types'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse, nowIso } from '../utils'
import { HTTP_STATUS } from '../constants'

// ============================================================================
// Resilient name resolution
// ============================================================================
//
// The /sos briefing renders cadence items by display title (e.g. "Code Review
// (ke)") while the API key is the slug ("code-review-ke"). Agents reading the
// briefing reasonably guessed the display form and got 404s with no hint at
// the canonical key, so completions were silently dropped. These helpers
// accept either form and surface near-matches on a true miss.

// The route splits `pathname.split('/')[2]` and passes it through unmodified,
// so `Code Review (ke)` arrives URL-encoded as `Code%20Review%20(ke)`. We try
// the raw form first (preserves behavior for slug callers) then the decoded
// form (needed for callers that pass display titles with spaces or punctuation).
function candidateNames(input: string): string[] {
  const candidates = [input]
  try {
    const decoded = decodeURIComponent(input)
    if (decoded !== input) candidates.push(decoded)
  } catch {
    // Malformed percent-encoding — fall back to raw input only.
  }
  return candidates
}

// Resolve a /schedule/:name path parameter to a canonical schedule_items row.
// Tries each candidate (raw + URL-decoded) against `name` then `title`.
async function resolveScheduleItem(env: Env, input: string): Promise<ScheduleItemRecord | null> {
  for (const candidate of candidateNames(input)) {
    const bySlug = await env.DB.prepare('SELECT * FROM schedule_items WHERE name = ?')
      .bind(candidate)
      .first<ScheduleItemRecord>()
    if (bySlug) return bySlug

    const byTitle = await env.DB.prepare('SELECT * FROM schedule_items WHERE title = ?')
      .bind(candidate)
      .first<ScheduleItemRecord>()
    if (byTitle) return byTitle
  }

  return null
}

async function suggestScheduleNames(env: Env, input: string, limit = 5): Promise<string[]> {
  // Try the decoded form for substring matching when input is URL-encoded —
  // otherwise "Code%20Review" never matches "Code Review (ke)".
  let trimmed = input.trim()
  try {
    const decoded = decodeURIComponent(trimmed)
    if (decoded !== trimmed) trimmed = decoded.trim()
  } catch {
    // Keep raw input.
  }
  if (!trimmed) return []

  // Match either name or title that contains the input as a substring.
  const pattern = `%${trimmed}%`
  const matches = await env.DB.prepare(
    `SELECT name, title FROM schedule_items
     WHERE enabled = 1 AND (name LIKE ? OR title LIKE ?)
     ORDER BY priority ASC
     LIMIT ?`
  )
    .bind(pattern, pattern, limit)
    .all<{ name: string; title: string }>()

  if (matches.results && matches.results.length > 0) {
    return matches.results.map((row) => row.name)
  }

  // No substring match — return the highest-priority items as a fallback so
  // the caller at least sees what the registry contains.
  const fallback = await env.DB.prepare(
    `SELECT name FROM schedule_items
     WHERE enabled = 1
     ORDER BY priority ASC
     LIMIT ?`
  )
    .bind(limit)
    .all<{ name: string }>()

  return fallback.results?.map((row) => row.name) ?? []
}

function notFoundWithSuggestions(
  input: string,
  suggestions: string[],
  correlationId: string
): Response {
  const suggestionText = suggestions.length > 0 ? `. Did you mean: ${suggestions.join(', ')}` : ''
  return jsonResponse(
    {
      error: `Schedule item not found: ${input}${suggestionText}`,
      correlation_id: correlationId,
      available_names: suggestions,
    },
    HTTP_STATUS.NOT_FOUND,
    correlationId
  )
}

// ============================================================================
// Request/Response Types
// ============================================================================

interface CompleteScheduleBody {
  result: 'success' | 'warning' | 'failure' | 'skipped'
  summary?: string
  completed_by?: string
}

interface LinkCalendarBody {
  gcal_event_id: string | null
}

interface BriefingItem {
  name: string
  title: string
  description: string | null
  cadence_days: number
  scope: string
  priority: number
  status: 'overdue' | 'due' | 'untracked'
  days_since: number | null
  last_completed_at: string | null
  last_completed_by: string | null
  last_result: string | null
  last_result_summary: string | null
}

interface ScheduleItem {
  name: string
  title: string
  description: string | null
  cadence_days: number
  scope: string
  priority: number
  status: 'overdue' | 'due' | 'untracked' | 'current'
  days_since: number | null
  last_completed_at: string | null
  last_completed_by: string | null
  last_result: string | null
  last_result_summary: string | null
  gcal_event_id: string | null
  next_due_date: string | null
}

// ============================================================================
// GET /schedule/briefing - Compute and return non-current items
// ============================================================================

export async function handleGetScheduleBriefing(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope')

    // Query all enabled items, optionally filtered by scope
    let query: string
    let params: string[]

    if (scope && scope === 'vc') {
      // VC is the enterprise venture — show venture-specific + global cadence items
      query =
        'SELECT * FROM schedule_items WHERE enabled = 1 AND (scope = ?1 OR scope = ?2) ORDER BY priority ASC'
      params = [scope, 'global']
    } else if (scope) {
      // Non-VC ventures only see their own venture-scoped items
      query = 'SELECT * FROM schedule_items WHERE enabled = 1 AND scope = ?1 ORDER BY priority ASC'
      params = [scope]
    } else {
      query = 'SELECT * FROM schedule_items WHERE enabled = 1 ORDER BY priority ASC'
      params = []
    }

    const result = scope
      ? await env.DB.prepare(query)
          .bind(...params)
          .all<ScheduleItemRecord>()
      : await env.DB.prepare(query).all<ScheduleItemRecord>()

    const rows = result.results || []
    const now = Date.now()
    const DAY_MS = 86400000

    const items: BriefingItem[] = []
    let overdueCount = 0
    let dueCount = 0
    let untrackedCount = 0

    for (const row of rows) {
      const daysSince = row.last_completed_at
        ? Math.floor((now - Date.parse(row.last_completed_at)) / DAY_MS)
        : null

      const status =
        daysSince === null
          ? 'untracked'
          : daysSince >= row.cadence_days * 2
            ? 'overdue'
            : daysSince >= row.cadence_days
              ? 'due'
              : 'current'

      if (status === 'current') continue

      if (status === 'overdue') overdueCount++
      else if (status === 'due') dueCount++
      else untrackedCount++

      items.push({
        name: row.name,
        title: row.title,
        description: row.description,
        cadence_days: row.cadence_days,
        scope: row.scope,
        priority: row.priority,
        status,
        days_since: daysSince,
        last_completed_at: row.last_completed_at,
        last_completed_by: row.last_completed_by,
        last_result: row.last_result,
        last_result_summary: row.last_result_summary,
      })
    }

    // Sort: priority ASC, then days overdue DESC (nulls last for untracked)
    items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      const aDays = a.days_since ?? -1
      const bDays = b.days_since ?? -1
      return bDays - aDays
    })

    return jsonResponse(
      {
        items,
        overdue_count: overdueCount,
        due_count: dueCount,
        untracked_count: untrackedCount,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /schedule/briefing error:', error)
    return errorResponse(
      'Failed to compute schedule briefing',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /schedule/items - All enabled items with computed status and calendar state
// ============================================================================

export async function handleGetScheduleItems(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const result = await env.DB.prepare(
      'SELECT * FROM schedule_items WHERE enabled = 1 ORDER BY priority ASC'
    ).all<ScheduleItemRecord>()

    const rows = result.results || []
    const now = Date.now()
    const DAY_MS = 86400000

    const items: ScheduleItem[] = []

    for (const row of rows) {
      const daysSince = row.last_completed_at
        ? Math.floor((now - Date.parse(row.last_completed_at)) / DAY_MS)
        : null

      const status =
        daysSince === null
          ? 'untracked'
          : daysSince >= row.cadence_days * 2
            ? 'overdue'
            : daysSince >= row.cadence_days
              ? 'due'
              : 'current'

      // Compute next due date
      let nextDueDate: string | null = null
      if (row.last_completed_at) {
        const lastDate = new Date(row.last_completed_at)
        lastDate.setDate(lastDate.getDate() + row.cadence_days)
        nextDueDate = lastDate.toISOString().split('T')[0]
      }

      items.push({
        name: row.name,
        title: row.title,
        description: row.description,
        cadence_days: row.cadence_days,
        scope: row.scope,
        priority: row.priority,
        status,
        days_since: daysSince,
        last_completed_at: row.last_completed_at,
        last_completed_by: row.last_completed_by,
        last_result: row.last_result,
        last_result_summary: row.last_result_summary,
        gcal_event_id: row.gcal_event_id,
        next_due_date: nextDueDate,
      })
    }

    return jsonResponse(
      {
        items,
        count: items.length,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /schedule/items error:', error)
    return errorResponse(
      'Failed to fetch schedule items',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /schedule/:name/link-calendar - Store or clear gcal_event_id
// ============================================================================

export async function handleLinkScheduleCalendar(
  request: Request,
  env: Env,
  name: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as LinkCalendarBody

    const resolved = await resolveScheduleItem(env, name)
    if (!resolved) {
      const suggestions = await suggestScheduleNames(env, name)
      return notFoundWithSuggestions(name, suggestions, context.correlationId)
    }
    const canonicalName = resolved.name

    const now = nowIso()

    await env.DB.prepare(
      `UPDATE schedule_items
       SET gcal_event_id = ?1,
           updated_at = ?2
       WHERE name = ?3`
    )
      .bind(body.gcal_event_id, now, canonicalName)
      .run()

    return jsonResponse(
      {
        name: canonicalName,
        gcal_event_id: body.gcal_event_id,
        updated_at: now,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error(`POST /schedule/${name}/link-calendar error:`, error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}

// ============================================================================
// POST /schedule/:name/complete - Record completion
// ============================================================================

export async function handleCompleteScheduleItem(
  request: Request,
  env: Env,
  name: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as CompleteScheduleBody

    // Validate result field
    const validResults = ['success', 'warning', 'failure', 'skipped']
    if (!body.result || !validResults.includes(body.result)) {
      return validationErrorResponse(
        [
          {
            field: 'result',
            message: `Required, must be one of: ${validResults.join(', ')}`,
          },
        ],
        context.correlationId
      )
    }

    const resolved = await resolveScheduleItem(env, name)
    if (!resolved) {
      const suggestions = await suggestScheduleNames(env, name)
      return notFoundWithSuggestions(name, suggestions, context.correlationId)
    }
    const canonicalName = resolved.name
    const existing = resolved

    const now = nowIso()

    await env.DB.prepare(
      `UPDATE schedule_items
       SET last_completed_at = ?1,
           last_completed_by = ?2,
           last_result = ?3,
           last_result_summary = ?4,
           updated_at = ?5
       WHERE name = ?6`
    )
      .bind(
        now,
        body.completed_by || context.actorKeyId,
        body.result,
        body.summary || null,
        now,
        canonicalName
      )
      .run()

    // Compute next due date
    const nextDueDate = new Date(now)
    nextDueDate.setDate(nextDueDate.getDate() + existing.cadence_days)
    const nextDueDateStr = nextDueDate.toISOString().split('T')[0]

    return jsonResponse(
      {
        name: canonicalName,
        completed_at: now,
        result: body.result,
        gcal_event_id: existing.gcal_event_id,
        next_due_date: nextDueDateStr,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error(`POST /schedule/${name}/complete error:`, error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return errorResponse(message, HTTP_STATUS.INTERNAL_ERROR, context.correlationId)
  }
}
