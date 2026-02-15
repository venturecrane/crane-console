/**
 * Admin Endpoints - Shared Utilities
 *
 * Common authentication and helpers used across admin endpoint files.
 */

import type { Env } from '../types'
import { timingSafeEqual } from '../utils'

// ============================================================================
// Admin Authentication
// ============================================================================

/**
 * Verify admin key from X-Admin-Key header
 */
export async function verifyAdminKey(request: Request, env: Env): Promise<boolean> {
  const adminKey = request.headers.get('X-Admin-Key')

  if (!adminKey) {
    return false
  }

  // Use timing-safe comparison to prevent timing side-channel attacks
  return await timingSafeEqual(adminKey, env.CONTEXT_ADMIN_KEY || '')
}
