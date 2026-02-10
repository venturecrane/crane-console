/**
 * Crane Context Worker - Idempotency Layer
 *
 * Retry-safe idempotency implementation with hybrid storage.
 * Implements patterns from ADR 025.
 */

import type { Env, IdempotencyKeyRecord } from './types'
import { sha256, nowIso, addSeconds, sizeInBytes } from './utils'
import { IDEMPOTENCY_TTL_SECONDS, MAX_IDEMPOTENCY_BODY_SIZE } from './constants'

// ============================================================================
// Idempotency Check
// ============================================================================

/**
 * Check if idempotency key exists and is not expired
 * Returns cached response if found, null if not found or expired
 *
 * Implements check-on-read expiry enforcement (ADR 025:435-445)
 *
 * @param db - D1 database binding
 * @param endpoint - API endpoint (/sod, /eod, /update)
 * @param key - Idempotency key from client
 * @returns Cached idempotency record or null
 */
export async function checkIdempotencyKey(
  db: D1Database,
  endpoint: string,
  key: string
): Promise<IdempotencyKeyRecord | null> {
  // Query for key with expiry check in SQL
  const query = `
    SELECT * FROM idempotency_keys
    WHERE endpoint = ?
      AND key = ?
      AND expires_at > datetime('now')
    LIMIT 1
  `

  const result = await db.prepare(query).bind(endpoint, key).first<IdempotencyKeyRecord>()

  if (!result) {
    // Opportunistic cleanup: delete expired keys
    // This runs in background, doesn't block response
    cleanupExpiredKeys(db).catch((err) => {
      console.error('Opportunistic cleanup failed:', err)
    })

    return null
  }

  return result
}

/**
 * Cleanup expired idempotency keys
 * Runs opportunistically when checking keys (non-blocking)
 *
 * Phase 1: Opportunistic cleanup
 * Phase 2: Add scheduled Cron Trigger for regular cleanup
 *
 * @param db - D1 database binding
 */
async function cleanupExpiredKeys(db: D1Database): Promise<void> {
  const query = `
    DELETE FROM idempotency_keys
    WHERE expires_at < datetime('now')
  `

  await db.prepare(query).run()
}

// ============================================================================
// Idempotency Storage
// ============================================================================

/**
 * Store idempotency key with response
 * Implements hybrid storage: full body <64KB, hash-only otherwise
 *
 * @param db - D1 database binding
 * @param endpoint - API endpoint
 * @param key - Idempotency key
 * @param response - Response object to cache
 * @param actorKeyId - Actor key ID for attribution
 * @param correlationId - Correlation ID for tracing
 */
export async function storeIdempotencyKey(
  db: D1Database,
  endpoint: string,
  key: string,
  response: Response,
  actorKeyId: string,
  correlationId: string
): Promise<void> {
  // Clone response to read body (responses can only be read once)
  const responseClone = response.clone()
  const body = await responseClone.text()
  const bodySize = sizeInBytes(body)
  const bodyHash = await sha256(body)

  // Hybrid storage: full body if <64KB, hash-only otherwise
  const storeFullBody = bodySize < MAX_IDEMPOTENCY_BODY_SIZE
  const truncated = !storeFullBody

  const now = nowIso()
  const expiresAt = addSeconds(IDEMPOTENCY_TTL_SECONDS)

  const query = `
    INSERT INTO idempotency_keys (
      endpoint, key,
      response_status, response_hash, response_body,
      response_size_bytes, response_truncated,
      created_at, expires_at,
      actor_key_id, correlation_id
    ) VALUES (
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?
    )
  `

  await db
    .prepare(query)
    .bind(
      endpoint,
      key,
      response.status,
      bodyHash,
      storeFullBody ? body : null,
      bodySize,
      truncated ? 1 : 0,
      now,
      expiresAt,
      actorKeyId,
      correlationId
    )
    .run()
}

/**
 * Reconstruct response from idempotency record
 * If full body was stored, return it; otherwise return minimal metadata
 *
 * @param record - Idempotency key record from database
 * @returns Response object
 */
export function reconstructResponse(record: IdempotencyKeyRecord): Response {
  if (record.response_body !== null) {
    // Full body was stored, return it (including empty string '')
    return new Response(record.response_body, {
      status: record.response_status,
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Hit': 'true',
      },
    })
  }

  // Body was truncated, return metadata
  const metadata = {
    idempotent: true,
    response_status: record.response_status,
    response_hash: record.response_hash,
    response_size_bytes: record.response_size_bytes,
    message: 'Response body was too large to cache. Original request succeeded.',
  }

  return new Response(JSON.stringify(metadata, null, 2), {
    status: 409, // Conflict - indicates idempotency violation
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Hit': 'true',
      'X-Idempotency-Truncated': 'true',
    },
  })
}

// ============================================================================
// Idempotency Helpers
// ============================================================================

/**
 * Extract idempotency key from request
 * Checks header first, then body field (for POST /update)
 *
 * @param request - Incoming request
 * @param bodyData - Optional parsed body data
 * @returns Idempotency key or null if not found
 */
export function extractIdempotencyKey(
  request: Request,
  bodyData?: { update_id?: string }
): string | null {
  // Check header first
  const headerKey = request.headers.get('Idempotency-Key')
  if (headerKey) {
    return headerKey
  }

  // Check body field (for POST /update)
  if (bodyData?.update_id) {
    return bodyData.update_id
  }

  return null
}

/**
 * Validate idempotency key format
 * Should be UUID or ULID format
 *
 * @param key - Idempotency key to validate
 * @returns True if valid format
 */
export function isValidIdempotencyKey(key: string): boolean {
  // Allow UUID v4 format
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  // Allow ULID format (26 characters, base32)
  const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/i

  // Allow reasonable length (min 10, max 200 chars)
  if (key.length < 10 || key.length > 200) {
    return false
  }

  return uuidPattern.test(key) || ulidPattern.test(key) || key.length >= 20
}

/**
 * Handle idempotent request
 * Checks for existing key and returns cached response if found
 *
 * @param db - D1 database binding
 * @param endpoint - API endpoint
 * @param key - Idempotency key
 * @returns Cached response if found, null if should proceed with request
 */
export async function handleIdempotentRequest(
  db: D1Database,
  endpoint: string,
  key: string | null
): Promise<Response | null> {
  if (!key) {
    return null // No idempotency key, proceed with request
  }

  // Validate key format
  if (!isValidIdempotencyKey(key)) {
    return new Response(
      JSON.stringify({
        error: 'Invalid idempotency key format',
        details: 'Key must be UUID v4, ULID, or 20-200 character string',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // Check if key exists
  const cached = await checkIdempotencyKey(db, endpoint, key)

  if (cached) {
    // Return cached response
    return reconstructResponse(cached)
  }

  // Key not found or expired, proceed with request
  return null
}
