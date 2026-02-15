/**
 * Admin Endpoints - Documentation Management
 *
 * Provides admin-only endpoints for uploading, listing, and deleting operational documentation.
 * Requires X-Admin-Key authentication (timing-safe comparison).
 */

import type { Env } from '../types'
import { HTTP_STATUS } from '../constants'
import { errorResponse, successResponse, generateCorrelationId, sha256 } from '../utils'
import { verifyAdminKey } from './admin-shared'

// ============================================================================
// Types
// ============================================================================

interface UploadDocRequest {
  scope: string // 'global' or venture code (vc, dfg, sc)
  doc_name: string // e.g., 'workflow.md', 'track-coordinator.md'
  content: string // Full markdown content
  title?: string // Display title (optional, extracted from content if missing)
  description?: string // Brief description (optional)
  source_repo?: string // e.g., 'crane-console', 'dfg-console'
  source_path?: string // Original file path in repo
  uploaded_by?: string // e.g., 'github-actions', 'admin'
}

interface UploadDocResponse {
  success: boolean
  scope: string
  doc_name: string
  version: number
  content_hash: string
  content_size_bytes: number
  created: boolean // true if new doc, false if updated
  previous_version?: number
}

interface ListDocsResponse {
  success: boolean
  docs: Array<{
    scope: string
    doc_name: string
    title: string | null
    description: string | null
    content_size_bytes: number
    content_hash: string
    version: number
    created_at: string
    updated_at: string
    source_repo: string | null
    source_path: string | null
  }>
  count: number
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract title from markdown content (first # heading)
 */
function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

// ============================================================================
// POST /admin/docs - Upload or Update Documentation
// ============================================================================

export async function handleUploadDoc(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()

  console.log('[POST /admin/docs] Upload doc request', { correlationId })

  // Verify admin authentication
  if (!(await verifyAdminKey(request, env))) {
    console.warn('[POST /admin/docs] Unauthorized - invalid admin key', { correlationId })
    return errorResponse('Unauthorized - Invalid admin key', HTTP_STATUS.UNAUTHORIZED)
  }

  // Parse request body
  let body: UploadDocRequest
  try {
    body = await request.json()
  } catch (error) {
    console.error('[POST /admin/docs] Invalid JSON', { correlationId, error })
    return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST)
  }

  // Validate required fields
  if (!body.scope || !body.doc_name || !body.content) {
    return errorResponse(
      'Missing required fields: scope, doc_name, content',
      HTTP_STATUS.BAD_REQUEST
    )
  }

  // Validate scope (global or 2-3 letter venture code)
  if (body.scope !== 'global' && !/^[a-z]{2,3}$/.test(body.scope)) {
    return errorResponse(
      'Invalid scope: must be "global" or 2-3 letter venture code (e.g., vc, dfg, sc)',
      HTTP_STATUS.BAD_REQUEST
    )
  }

  // Validate doc_name (alphanumeric, hyphens, underscores, dots)
  if (!/^[a-zA-Z0-9._-]+\.(md|json)$/.test(body.doc_name)) {
    return errorResponse(
      'Invalid doc_name: must be alphanumeric with .md or .json extension',
      HTTP_STATUS.BAD_REQUEST
    )
  }

  // Calculate content metadata
  const contentHash = await sha256(body.content)
  const contentSizeBytes = new TextEncoder().encode(body.content).length

  // Check size limit (1MB max)
  if (contentSizeBytes > 1024 * 1024) {
    return errorResponse(
      `Content too large: ${contentSizeBytes} bytes (max 1MB)`,
      HTTP_STATUS.BAD_REQUEST
    )
  }

  // Extract title if not provided
  const title = body.title || extractTitle(body.content) || body.doc_name
  const now = new Date().toISOString()

  try {
    // Check if doc exists
    const existing = await env.DB.prepare(
      'SELECT version FROM context_docs WHERE scope = ? AND doc_name = ?'
    )
      .bind(body.scope, body.doc_name)
      .first<{ version: number }>()

    const isUpdate = !!existing
    const newVersion = isUpdate ? existing.version + 1 : 1

    // Upsert doc
    if (isUpdate) {
      // Update existing doc
      await env.DB.prepare(
        `
        UPDATE context_docs
        SET content = ?,
            content_hash = ?,
            content_size_bytes = ?,
            title = ?,
            description = ?,
            version = ?,
            updated_at = ?,
            uploaded_by = ?,
            source_repo = ?,
            source_path = ?
        WHERE scope = ? AND doc_name = ?
      `
      )
        .bind(
          body.content,
          contentHash,
          contentSizeBytes,
          title,
          body.description || null,
          newVersion,
          now,
          body.uploaded_by || 'admin',
          body.source_repo || null,
          body.source_path || null,
          body.scope,
          body.doc_name
        )
        .run()
    } else {
      // Insert new doc
      await env.DB.prepare(
        `
        INSERT INTO context_docs (
          scope, doc_name, content, content_hash, content_size_bytes,
          title, description, version, created_at, updated_at,
          uploaded_by, source_repo, source_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
        .bind(
          body.scope,
          body.doc_name,
          body.content,
          contentHash,
          contentSizeBytes,
          title,
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

    const response: UploadDocResponse = {
      success: true,
      scope: body.scope,
      doc_name: body.doc_name,
      version: newVersion,
      content_hash: contentHash,
      content_size_bytes: contentSizeBytes,
      created: !isUpdate,
      previous_version: isUpdate ? existing.version : undefined,
    }

    console.log('[POST /admin/docs] Doc uploaded successfully', {
      correlationId,
      scope: body.scope,
      doc_name: body.doc_name,
      version: newVersion,
      created: !isUpdate,
    })

    return successResponse(response, isUpdate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED)
  } catch (error) {
    console.error('[POST /admin/docs] Database error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}

// ============================================================================
// GET /admin/docs - List All Documentation
// ============================================================================

export async function handleListDocs(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  const url = new URL(request.url)
  const scope = url.searchParams.get('scope')

  console.log('[GET /admin/docs] List docs request', { correlationId, scope })

  // Verify admin authentication
  if (!(await verifyAdminKey(request, env))) {
    console.warn('[GET /admin/docs] Unauthorized - invalid admin key', { correlationId })
    return errorResponse('Unauthorized - Invalid admin key', HTTP_STATUS.UNAUTHORIZED)
  }

  try {
    // Build query
    let query = `
      SELECT
        scope, doc_name, title, description,
        content_size_bytes, content_hash, version,
        created_at, updated_at, source_repo, source_path
      FROM context_docs
    `

    if (scope) {
      query += ' WHERE scope = ?'
    }

    query += ' ORDER BY scope ASC, doc_name ASC'

    // Execute query
    const stmt = scope ? env.DB.prepare(query).bind(scope) : env.DB.prepare(query)

    const result = await stmt.all()

    const response: ListDocsResponse = {
      success: true,
      docs: result.results as ListDocsResponse['docs'],
      count: result.results.length,
    }

    console.log('[GET /admin/docs] Docs listed successfully', {
      correlationId,
      count: response.count,
      scope: scope || 'all',
    })

    return successResponse(response, HTTP_STATUS.OK)
  } catch (error) {
    console.error('[GET /admin/docs] Database error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}

// ============================================================================
// DELETE /admin/docs/:scope/:doc_name - Delete Documentation
// ============================================================================

export async function handleDeleteDoc(
  request: Request,
  env: Env,
  scope: string,
  docName: string
): Promise<Response> {
  const correlationId = generateCorrelationId()

  console.log('[DELETE /admin/docs] Delete doc request', {
    correlationId,
    scope,
    docName,
  })

  // Verify admin authentication
  if (!(await verifyAdminKey(request, env))) {
    console.warn('[DELETE /admin/docs] Unauthorized - invalid admin key', { correlationId })
    return errorResponse('Unauthorized - Invalid admin key', HTTP_STATUS.UNAUTHORIZED)
  }

  try {
    // Delete doc
    const result = await env.DB.prepare('DELETE FROM context_docs WHERE scope = ? AND doc_name = ?')
      .bind(scope, docName)
      .run()

    if (result.meta.changes === 0) {
      return errorResponse('Document not found', HTTP_STATUS.NOT_FOUND)
    }

    console.log('[DELETE /admin/docs] Doc deleted successfully', {
      correlationId,
      scope,
      docName,
    })

    return successResponse(
      {
        success: true,
        scope,
        doc_name: docName,
        deleted: true,
      },
      HTTP_STATUS.OK
    )
  } catch (error) {
    console.error('[DELETE /admin/docs] Database error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return errorResponse('Database error', HTTP_STATUS.INTERNAL_ERROR)
  }
}
