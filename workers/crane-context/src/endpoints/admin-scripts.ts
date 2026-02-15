/**
 * Admin Endpoints - Scripts Management
 *
 * Provides admin-only endpoints for uploading, listing, and deleting operational scripts.
 * Requires X-Admin-Key authentication (timing-safe comparison).
 */

import type { Env } from '../types'
import { HTTP_STATUS } from '../constants'
import { errorResponse, successResponse, generateCorrelationId, sha256 } from '../utils'
import { verifyAdminKey } from './admin-shared'

// ============================================================================
// Types
// ============================================================================

interface UploadScriptRequest {
  scope: string
  script_name: string
  content: string
  script_type?: string
  executable?: boolean
  description?: string
  source_repo?: string
  source_path?: string
  uploaded_by?: string
}

interface UploadScriptResponse {
  success: boolean
  scope: string
  script_name: string
  version: number
  content_hash: string
  content_size_bytes: number
  created: boolean
  previous_version?: number
}

// ============================================================================
// POST /admin/scripts - Upload or Update Script
// ============================================================================

export async function handleUploadScript(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()

  console.log('[POST /admin/scripts] Upload script request', { correlationId })

  if (!(await verifyAdminKey(request, env))) {
    console.warn('[POST /admin/scripts] Unauthorized', { correlationId })
    return errorResponse('Unauthorized - Invalid admin key', HTTP_STATUS.UNAUTHORIZED)
  }

  let body: UploadScriptRequest
  try {
    body = await request.json()
  } catch (error) {
    return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST)
  }

  if (!body.scope || !body.script_name || !body.content) {
    return errorResponse(
      'Missing required fields: scope, script_name, content',
      HTTP_STATUS.BAD_REQUEST
    )
  }

  if (body.scope !== 'global' && !/^[a-z]{2,3}$/.test(body.scope)) {
    return errorResponse('Invalid scope', HTTP_STATUS.BAD_REQUEST)
  }

  if (!/^[a-zA-Z0-9._-]+\.(sh|py|js|bash)$/.test(body.script_name)) {
    return errorResponse('Invalid script_name', HTTP_STATUS.BAD_REQUEST)
  }

  const contentHash = await sha256(body.content)
  const contentSizeBytes = new TextEncoder().encode(body.content).length

  if (contentSizeBytes > 512 * 1024) {
    return errorResponse('Content too large (max 500KB)', HTTP_STATUS.BAD_REQUEST)
  }

  const now = new Date().toISOString()
  const scriptType = body.script_type || 'bash'
  const executable = body.executable !== false

  try {
    const existing = await env.DB.prepare(
      'SELECT version FROM context_scripts WHERE scope = ? AND script_name = ?'
    )
      .bind(body.scope, body.script_name)
      .first<{ version: number }>()

    const isUpdate = !!existing
    const newVersion = isUpdate ? existing.version + 1 : 1

    if (isUpdate) {
      await env.DB.prepare(
        `
        UPDATE context_scripts
        SET content = ?, content_hash = ?, content_size_bytes = ?,
            script_type = ?, executable = ?, description = ?,
            version = ?, updated_at = ?, uploaded_by = ?,
            source_repo = ?, source_path = ?
        WHERE scope = ? AND script_name = ?
      `
      )
        .bind(
          body.content,
          contentHash,
          contentSizeBytes,
          scriptType,
          executable ? 1 : 0,
          body.description || null,
          newVersion,
          now,
          body.uploaded_by || 'admin',
          body.source_repo || null,
          body.source_path || null,
          body.scope,
          body.script_name
        )
        .run()
    } else {
      await env.DB.prepare(
        `
        INSERT INTO context_scripts (
          scope, script_name, content, content_hash, content_size_bytes,
          script_type, executable, description, version, created_at, updated_at,
          uploaded_by, source_repo, source_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
        .bind(
          body.scope,
          body.script_name,
          body.content,
          contentHash,
          contentSizeBytes,
          scriptType,
          executable ? 1 : 0,
          body.description || null,
          newVersion,
          now,
          now,
          body.uploaded_by || 'admin',
          body.source_repo || null,
          body.source_path || null
        )
        .run()
    }

    const response: UploadScriptResponse = {
      success: true,
      scope: body.scope,
      script_name: body.script_name,
      version: newVersion,
      content_hash: contentHash,
      content_size_bytes: contentSizeBytes,
      created: !isUpdate,
      previous_version: isUpdate ? existing.version : undefined,
    }

    return successResponse(response, isUpdate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED)
  } catch (error) {
    console.error('[POST /admin/scripts] Database error', { correlationId, error })
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}

// ============================================================================
// GET /admin/scripts - List All Scripts
// ============================================================================

export async function handleListScripts(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  const url = new URL(request.url)
  const scope = url.searchParams.get('scope')

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
  }

  try {
    let query = `
      SELECT scope, script_name, script_type, executable, description,
             content_size_bytes, content_hash, version,
             created_at, updated_at, source_repo, source_path
      FROM context_scripts
    `

    if (scope) {
      query += ' WHERE scope = ?'
    }

    query += ' ORDER BY scope ASC, script_name ASC'

    const stmt = scope ? env.DB.prepare(query).bind(scope) : env.DB.prepare(query)
    const result = await stmt.all()

    return successResponse(
      {
        success: true,
        scripts: result.results,
        count: result.results.length,
      },
      HTTP_STATUS.OK
    )
  } catch (error) {
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}

// ============================================================================
// DELETE /admin/scripts/:scope/:script_name - Delete Script
// ============================================================================

export async function handleDeleteScript(
  request: Request,
  env: Env,
  scope: string,
  scriptName: string
): Promise<Response> {
  const correlationId = generateCorrelationId()

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
  }

  try {
    const result = await env.DB.prepare(
      'DELETE FROM context_scripts WHERE scope = ? AND script_name = ?'
    )
      .bind(scope, scriptName)
      .run()

    if (result.meta.changes === 0) {
      return errorResponse('Script not found', HTTP_STATUS.NOT_FOUND)
    }

    return successResponse(
      {
        success: true,
        scope,
        script_name: scriptName,
        deleted: true,
      },
      HTTP_STATUS.OK
    )
  } catch (error) {
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}
