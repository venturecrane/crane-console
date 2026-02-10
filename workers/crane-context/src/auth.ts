/**
 * Crane Context Worker - Authentication Middleware
 *
 * Handles X-Relay-Key validation, actor key ID derivation, and correlation ID generation.
 * Implements auth patterns from ADR 025.
 */

import type { Env, AuthContext, RequestContext } from './types'
import { deriveActorKeyId, generateCorrelationId, unauthorizedResponse } from './utils'

// ============================================================================
// Auth Validation
// ============================================================================

/**
 * Validate X-Relay-Key header against environment secret
 *
 * @param request - Incoming request
 * @param env - Worker environment bindings
 * @returns Actor key ID if valid, null if invalid
 */
export async function validateRelayKey(request: Request, env: Env): Promise<string | null> {
  const key = request.headers.get('X-Relay-Key')

  if (!key) {
    return null
  }

  if (key !== env.CONTEXT_RELAY_KEY) {
    return null
  }

  // Derive actor key ID from valid key
  return await deriveActorKeyId(key)
}

/**
 * Require authentication for request
 * Returns 401 response if authentication fails
 *
 * @param request - Incoming request
 * @param env - Worker environment bindings
 * @param correlationId - Optional correlation ID (generated if not provided)
 * @returns AuthContext if authenticated, Response with 401 if not
 */
export async function requireAuth(
  request: Request,
  env: Env,
  correlationId?: string
): Promise<AuthContext | Response> {
  const actorKeyId = await validateRelayKey(request, env)
  const corrId = correlationId || generateCorrelationId()

  if (!actorKeyId) {
    return unauthorizedResponse(corrId)
  }

  return {
    actorKeyId,
    correlationId: corrId,
  }
}

// ============================================================================
// Request Context Middleware
// ============================================================================

/**
 * Build full request context with auth, correlation ID, and timing
 * This enriches the request with all metadata needed for logging and tracing
 *
 * @param request - Incoming request
 * @param env - Worker environment bindings
 * @returns RequestContext if authenticated, Response with 401 if not
 */
export async function buildRequestContext(
  request: Request,
  env: Env
): Promise<RequestContext | Response> {
  const url = new URL(request.url)
  const correlationId = generateCorrelationId()

  const actorKeyId = await validateRelayKey(request, env)

  if (!actorKeyId) {
    return unauthorizedResponse(correlationId)
  }

  return {
    actorKeyId,
    correlationId,
    startTime: Date.now(),
    endpoint: url.pathname,
    method: request.method,
  }
}

/**
 * Check if value is a Response object (used for type narrowing)
 *
 * @param value - Value to check
 * @returns True if value is a Response
 */
export function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

// ============================================================================
// CORS Handling (if needed in future)
// ============================================================================

/**
 * Handle CORS preflight requests
 * Currently not used (internal API), but available for future use
 *
 * @returns Response with CORS headers
 */
export function handleCorsPrelight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // Restrict in production
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Key, Idempotency-Key',
      'Access-Control-Max-Age': '86400',
    },
  })
}

/**
 * Add CORS headers to response
 * Currently not used (internal API), but available for future use
 *
 * @param response - Response to add headers to
 * @returns Response with CORS headers added
 */
export function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers)
  newHeaders.set('Access-Control-Allow-Origin', '*') // Restrict in production

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}
