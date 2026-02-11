/**
 * Crane Context Worker - Notes Endpoints
 *
 * Handlers for the enterprise knowledge store:
 * create, list/search, get, update, and archive notes.
 */

import type { Env } from '../types'
import { createNote, listNotes, getNote, updateNote, archiveNote } from '../notes'
import { buildRequestContext, isResponse } from '../auth'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS, NOTE_CATEGORIES } from '../constants'

// ============================================================================
// POST /notes - Create a Note
// ============================================================================

export async function handleCreateNote(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as any

    // Validate required fields
    if (!body.category || typeof body.category !== 'string') {
      return validationErrorResponse(
        [{ field: 'category', message: `Required. Must be one of: ${NOTE_CATEGORIES.join(', ')}` }],
        context.correlationId
      )
    }

    if (!body.content || typeof body.content !== 'string') {
      return validationErrorResponse(
        [{ field: 'content', message: 'Required string field' }],
        context.correlationId
      )
    }

    const note = await createNote(env.DB, {
      category: body.category,
      title: body.title,
      content: body.content,
      tags: body.tags,
      venture: body.venture,
      actor_key_id: context.actorKeyId,
    })

    return jsonResponse(
      {
        note,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.CREATED,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /notes error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status =
      message.includes('Invalid') || message.includes('Maximum') || message.includes('exceeds')
        ? HTTP_STATUS.BAD_REQUEST
        : HTTP_STATUS.INTERNAL_ERROR
    return errorResponse(message, status, context.correlationId)
  }
}

// ============================================================================
// GET /notes - List / Search Notes
// ============================================================================

export async function handleListNotes(request: Request, env: Env): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const url = new URL(request.url)

    const result = await listNotes(env.DB, {
      category: url.searchParams.get('category') || undefined,
      venture: url.searchParams.get('venture') || undefined,
      tag: url.searchParams.get('tag') || undefined,
      q: url.searchParams.get('q') || undefined,
      include_archived: url.searchParams.get('include_archived') === 'true',
      limit: url.searchParams.has('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined,
      cursor: url.searchParams.get('cursor') || undefined,
    })

    return jsonResponse(
      {
        notes: result.notes,
        count: result.notes.length,
        ...(result.pagination && { pagination: result.pagination }),
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /notes error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// GET /notes/:id - Get Single Note
// ============================================================================

export async function handleGetNote(request: Request, env: Env, noteId: string): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const note = await getNote(env.DB, noteId)

    if (!note) {
      return errorResponse('Note not found', HTTP_STATUS.NOT_FOUND, context.correlationId)
    }

    return jsonResponse(
      {
        note,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('GET /notes/:id error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}

// ============================================================================
// POST /notes/:id/update - Update a Note
// ============================================================================

export async function handleUpdateNote(
  request: Request,
  env: Env,
  noteId: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const body = (await request.json()) as any

    const note = await updateNote(env.DB, noteId, {
      title: body.title,
      content: body.content,
      tags: body.tags,
      venture: body.venture,
      category: body.category,
      actor_key_id: context.actorKeyId,
    })

    if (!note) {
      return errorResponse('Note not found', HTTP_STATUS.NOT_FOUND, context.correlationId)
    }

    return jsonResponse(
      {
        note,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /notes/:id/update error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status =
      message.includes('Invalid') || message.includes('Maximum') || message.includes('exceeds')
        ? HTTP_STATUS.BAD_REQUEST
        : HTTP_STATUS.INTERNAL_ERROR
    return errorResponse(message, status, context.correlationId)
  }
}

// ============================================================================
// POST /notes/:id/archive - Soft Delete a Note
// ============================================================================

export async function handleArchiveNote(
  request: Request,
  env: Env,
  noteId: string
): Promise<Response> {
  const context = await buildRequestContext(request, env)
  if (isResponse(context)) {
    return context
  }

  try {
    const note = await archiveNote(env.DB, noteId, context.actorKeyId)

    if (!note) {
      return errorResponse('Note not found', HTTP_STATUS.NOT_FOUND, context.correlationId)
    }

    return jsonResponse(
      {
        note,
        archived: true,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    )
  } catch (error) {
    console.error('POST /notes/:id/archive error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    )
  }
}
