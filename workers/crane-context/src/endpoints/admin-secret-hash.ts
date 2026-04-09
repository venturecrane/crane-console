/**
 * Crane Context Worker - Admin Secret Hash Endpoint
 *
 * Plan v3.1 §D.4. Returns sha256(secret_value || nonce) for an
 * allowlisted set of secrets, without ever echoing the raw value.
 *
 *   GET /admin/secret-hash?key=CRANE_ADMIN_KEY&nonce=<random>
 *     Auth: X-Admin-Key
 *     Response: { key, hash, nonce, plane: 'wrangler', environment }
 *
 * How it's used (scripts/secret-sync-audit.sh):
 *   1. Caller generates a per-run nonce (UUID)
 *   2. Caller computes sha256(INFISICAL_VALUE || nonce) locally
 *   3. Caller calls THIS endpoint to get sha256(WORKER_ENV_VALUE || nonce)
 *   4. Caller compares the two hashes — equal = in sync
 *
 * The nonce makes rainbow-table attacks infeasible. The allowlist
 * prevents this endpoint from becoming a general-purpose oracle.
 *
 * Key allowlist is HARDCODED (not env-driven) to prevent a malicious
 * env var from expanding the attack surface.
 */

import type { Env } from '../types'
import { verifyAdminKey } from './admin-shared'
import { jsonResponse, errorResponse, generateCorrelationId } from '../utils'
import { HTTP_STATUS } from '../constants'

// Hardcoded allowlist. Only keys in this set can be hashed via the
// endpoint. Adding a key to this list is a contract with the readiness
// audit — the key becomes verifiable across planes but also becomes a
// potential oracle target, so add only verified-safe keys.
const ALLOWED_KEYS = ['CONTEXT_RELAY_KEY', 'CONTEXT_ADMIN_KEY'] as const
type AllowedKey = (typeof ALLOWED_KEYS)[number]

function isAllowed(key: string): key is AllowedKey {
  return (ALLOWED_KEYS as readonly string[]).includes(key)
}

/**
 * Web Crypto SHA-256 → hex string.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function handleSecretHash(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    const nonce = url.searchParams.get('nonce')

    if (!key || !nonce) {
      return errorResponse(
        "Required query params: 'key' and 'nonce'",
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    // Nonce hygiene: must be 16-128 hex/alphanumeric chars to prevent
    // accidental empty nonce and provide adequate collision resistance.
    if (!/^[A-Za-z0-9._-]{16,128}$/.test(nonce)) {
      return errorResponse(
        'Invalid nonce (must be 16-128 chars [A-Za-z0-9._-])',
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    if (!isAllowed(key)) {
      return errorResponse(
        `Key '${key}' is not in the secret-hash allowlist`,
        HTTP_STATUS.BAD_REQUEST,
        correlationId
      )
    }

    // Read the value from the worker's env. Note: TypeScript's Env
    // interface types these as strings, so no dynamic evaluation.
    const value = env[key as keyof Env] as string | undefined
    if (!value) {
      return errorResponse(
        `Key '${key}' is not set in this worker's environment`,
        HTTP_STATUS.NOT_FOUND,
        correlationId
      )
    }

    const hash = await sha256Hex(value + nonce)

    return jsonResponse(
      {
        key,
        hash,
        nonce,
        plane: 'wrangler',
        environment: (env as unknown as { ENVIRONMENT?: string }).ENVIRONMENT || 'unknown',
        correlation_id: correlationId,
      },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('GET /admin/secret-hash error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}
