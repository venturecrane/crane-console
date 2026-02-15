/**
 * Admin Endpoints - Documentation Requirements Management
 *
 * Provides admin-only endpoints for creating, listing, and deleting documentation requirements.
 * Requires X-Admin-Key authentication (timing-safe comparison).
 */

import type { Env } from '../types'
import { HTTP_STATUS } from '../constants'
import { errorResponse, successResponse, generateCorrelationId } from '../utils'
import { verifyAdminKey } from './admin-shared'

// ============================================================================
// Types
// ============================================================================

interface DocRequirementRequest {
  doc_name_pattern: string
  scope_type: string // 'global', 'all_ventures', 'venture'
  scope_venture?: string | null
  required?: boolean
  condition?: string | null
  description?: string | null
  staleness_days?: number
  auto_generate?: boolean
  generation_sources?: string // JSON array string
}

// ============================================================================
// POST /admin/doc-requirements - Create/Update Requirement
// ============================================================================

export async function handleCreateDocRequirement(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized - Invalid admin key', HTTP_STATUS.UNAUTHORIZED)
  }

  let body: DocRequirementRequest
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST)
  }

  if (!body.doc_name_pattern || !body.scope_type) {
    return errorResponse(
      'Missing required fields: doc_name_pattern, scope_type',
      HTTP_STATUS.BAD_REQUEST
    )
  }

  if (!['global', 'all_ventures', 'venture'].includes(body.scope_type)) {
    return errorResponse('Invalid scope_type', HTTP_STATUS.BAD_REQUEST)
  }

  if (body.scope_type === 'venture' && !body.scope_venture) {
    return errorResponse(
      'scope_venture required when scope_type is "venture"',
      HTTP_STATUS.BAD_REQUEST
    )
  }

  const now = new Date().toISOString()

  try {
    // Upsert based on unique constraint
    const existing = await env.DB.prepare(
      `SELECT id FROM doc_requirements
       WHERE doc_name_pattern = ? AND scope_type = ? AND scope_venture IS ?`
    )
      .bind(body.doc_name_pattern, body.scope_type, body.scope_venture || null)
      .first<{ id: number }>()

    if (existing) {
      await env.DB.prepare(
        `UPDATE doc_requirements
         SET required = ?, condition = ?, description = ?,
             staleness_days = ?, auto_generate = ?, generation_sources = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(
          body.required !== false ? 1 : 0,
          body.condition || null,
          body.description || null,
          body.staleness_days ?? 90,
          body.auto_generate !== false ? 1 : 0,
          body.generation_sources || null,
          now,
          existing.id
        )
        .run()

      return successResponse(
        {
          success: true,
          id: existing.id,
          created: false,
        },
        HTTP_STATUS.OK
      )
    }

    const result = await env.DB.prepare(
      `INSERT INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required,
       condition, description, staleness_days, auto_generate, generation_sources,
       created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.doc_name_pattern,
        body.scope_type,
        body.scope_venture || null,
        body.required !== false ? 1 : 0,
        body.condition || null,
        body.description || null,
        body.staleness_days ?? 90,
        body.auto_generate !== false ? 1 : 0,
        body.generation_sources || null,
        now,
        now
      )
      .run()

    return successResponse(
      {
        success: true,
        id: result.meta.last_row_id,
        created: true,
      },
      HTTP_STATUS.CREATED
    )
  } catch (error) {
    console.error('[POST /admin/doc-requirements] Database error', { correlationId, error })
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}

// ============================================================================
// GET /admin/doc-requirements - List Requirements
// ============================================================================

export async function handleListDocRequirements(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized - Invalid admin key', HTTP_STATUS.UNAUTHORIZED)
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, doc_name_pattern, scope_type, scope_venture, required,
              condition, description, staleness_days, auto_generate, generation_sources,
              created_at, updated_at
       FROM doc_requirements
       ORDER BY scope_type ASC, doc_name_pattern ASC`
    ).all()

    return successResponse(
      {
        success: true,
        requirements: result.results,
        count: result.results.length,
      },
      HTTP_STATUS.OK
    )
  } catch (error) {
    console.error('[GET /admin/doc-requirements] Database error', { correlationId, error })
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}

// ============================================================================
// DELETE /admin/doc-requirements/:id - Delete Requirement
// ============================================================================

export async function handleDeleteDocRequirement(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const correlationId = generateCorrelationId()

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized - Invalid admin key', HTTP_STATUS.UNAUTHORIZED)
  }

  const parsedId = parseInt(id, 10)
  if (isNaN(parsedId)) {
    return errorResponse('Invalid requirement ID', HTTP_STATUS.BAD_REQUEST)
  }

  try {
    const result = await env.DB.prepare('DELETE FROM doc_requirements WHERE id = ?')
      .bind(parsedId)
      .run()

    if (result.meta.changes === 0) {
      return errorResponse('Requirement not found', HTTP_STATUS.NOT_FOUND)
    }

    return successResponse(
      {
        success: true,
        id: parsedId,
        deleted: true,
      },
      HTTP_STATUS.OK
    )
  } catch (error) {
    console.error('[DELETE /admin/doc-requirements] Database error', { correlationId, error })
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}
