/**
 * Admin Endpoints - Documentation and Scripts Management
 *
 * Provides admin-only endpoints for uploading and managing operational documentation and scripts.
 * Requires X-Admin-Key authentication (SHA-256 hashed).
 */

import type { Env } from '../types'
import { HTTP_STATUS } from '../constants'
import { errorResponse, successResponse, generateCorrelationId, sha256 } from '../utils'

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
// Admin Authentication
// ============================================================================

/**
 * Verify admin key from X-Admin-Key header
 */
async function verifyAdminKey(request: Request, env: Env): Promise<boolean> {
  const adminKey = request.headers.get('X-Admin-Key')

  if (!adminKey) {
    return false
  }

  // Compare SHA-256 hashes to prevent timing attacks
  const providedHash = await sha256(adminKey)
  const expectedHash = await sha256(env.CONTEXT_ADMIN_KEY || '')

  return providedHash === expectedHash
}

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
      docs: result.results as any,
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
// DELETE /admin/docs/:scope/:doc_name - Delete Documentation (Optional)
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

// ============================================================================
// POST /admin/scripts - Upload or Update Script
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

// GET /admin/scripts
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
// POST /admin/doc-requirements - Create/Update Requirement
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

// DELETE /admin/scripts/:scope/:script_name
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
