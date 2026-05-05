/**
 * POST /admin/sessions/ingest - fleet-wide session JSONL ingest.
 *
 * The per-machine push cron (scripts/push-session-jsonls.sh) hits this
 * endpoint daily with each modified session JSONL gzipped + base64-encoded.
 * UPSERT on claude_session_id so re-pushes overwrite cleanly.
 *
 * Auth: X-Admin-Key (CONTEXT_ADMIN_KEY).
 *
 * Request body:
 *   {
 *     machine: string,                  // hostname pushing the file
 *     project: string,                  // ~/.claude/projects/<project> dir
 *     claude_session_id: string,        // UUID from filename
 *     content_jsonl_gz_base64: string,  // gzip(jsonl) base64-encoded
 *     line_count: number,               // pre-gzip line count
 *     source_size_bytes: number         // pre-gzip source size in bytes
 *   }
 *
 * Returns 201 with { id } on insert/upsert.
 */

import type { Env } from '../types'
import { jsonResponse, errorResponse, validationErrorResponse } from '../utils'
import { HTTP_STATUS } from '../constants'
import { verifyAdminKey } from './admin-shared'

interface IngestBody {
  machine: string
  project: string
  claude_session_id: string
  content_jsonl_gz_base64: string
  line_count: number
  source_size_bytes: number
}

const MAX_COMPRESSED_SIZE = 5 * 1024 * 1024 // 5 MB ceiling on the base64 payload

function generateId(): string {
  return `sxt_${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}`
}

export async function handleAdminSessionsIngest(request: Request, env: Env): Promise<Response> {
  const correlationId = request.headers.get('X-Correlation-Id') ?? `corr_${crypto.randomUUID()}`

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  let body: IngestBody
  try {
    body = (await request.json()) as IngestBody
  } catch {
    return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST, correlationId)
  }

  const errors: { field: string; message: string }[] = []
  if (!body.machine || typeof body.machine !== 'string')
    errors.push({ field: 'machine', message: 'Required string field' })
  if (!body.project || typeof body.project !== 'string')
    errors.push({ field: 'project', message: 'Required string field' })
  if (!body.claude_session_id || typeof body.claude_session_id !== 'string')
    errors.push({ field: 'claude_session_id', message: 'Required string field' })
  if (!body.content_jsonl_gz_base64 || typeof body.content_jsonl_gz_base64 !== 'string')
    errors.push({ field: 'content_jsonl_gz_base64', message: 'Required string field' })
  if (typeof body.line_count !== 'number')
    errors.push({ field: 'line_count', message: 'Required number field' })
  if (typeof body.source_size_bytes !== 'number')
    errors.push({ field: 'source_size_bytes', message: 'Required number field' })

  if (errors.length > 0) {
    return validationErrorResponse(errors, correlationId)
  }

  if (body.content_jsonl_gz_base64.length > MAX_COMPRESSED_SIZE) {
    return errorResponse(
      `content_jsonl_gz_base64 exceeds 5 MB ceiling`,
      HTTP_STATUS.BAD_REQUEST,
      correlationId
    )
  }

  // Decode base64 to binary blob (Workers runtime supports atob).
  let blob: Uint8Array
  try {
    const bin = atob(body.content_jsonl_gz_base64)
    blob = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) blob[i] = bin.charCodeAt(i)
  } catch {
    return errorResponse(
      'content_jsonl_gz_base64 is not valid base64',
      HTTP_STATUS.BAD_REQUEST,
      correlationId
    )
  }

  try {
    // UPSERT on claude_session_id (UNIQUE). Re-pushes overwrite the prior
    // content blob; ingested_at refreshes via DEFAULT on the new row plus
    // explicit set on UPDATE.
    const existing = await env.DB.prepare(
      'SELECT id FROM session_transcripts WHERE claude_session_id = ? LIMIT 1'
    )
      .bind(body.claude_session_id)
      .first<{ id: string }>()

    let id: string
    if (existing) {
      id = existing.id
      await env.DB.prepare(
        `UPDATE session_transcripts
           SET machine = ?, project = ?, content_jsonl_gz = ?,
               line_count = ?, source_size_bytes = ?,
               ingested_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      )
        .bind(body.machine, body.project, blob, body.line_count, body.source_size_bytes, id)
        .run()
    } else {
      id = generateId()
      await env.DB.prepare(
        `INSERT INTO session_transcripts (
           id, claude_session_id, machine, project, content_jsonl_gz,
           line_count, source_size_bytes
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          body.claude_session_id,
          body.machine,
          body.project,
          blob,
          body.line_count,
          body.source_size_bytes
        )
        .run()
    }

    return jsonResponse(
      { id, claude_session_id: body.claude_session_id, correlation_id: correlationId },
      HTTP_STATUS.CREATED,
      correlationId
    )
  } catch (err) {
    console.error('POST /admin/sessions/ingest error:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}
