/**
 * MCP Rate Limiting
 *
 * D1-backed rate limit checks for MCP requests.
 * Pattern: rl:<sha256(key)>:<minute>
 */

const RATE_LIMIT_REQUESTS = 100
const RATE_LIMIT_WINDOW_SECONDS = 60

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: string
}

/**
 * Cleanup expired rate limit entries.
 * Runs opportunistically after each rate limit check (non-blocking).
 */
async function cleanupExpiredRateLimits(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE expires_at < datetime('now')").run()
}

/**
 * Check rate limit for MCP requests.
 * Uses D1 counter pattern: rl:<sha256(key)>:<minute>
 */
export async function checkRateLimit(db: D1Database, actorKeyId: string): Promise<RateLimitResult> {
  const now = new Date()
  const minute = Math.floor(now.getTime() / 1000 / 60)
  const key = `rl:${actorKeyId}:${minute}`
  const resetAt = new Date((minute + 1) * 60 * 1000).toISOString()

  try {
    const result = await db
      .prepare(
        `INSERT INTO rate_limits (key, count, expires_at)
         VALUES (?, 1, datetime('now', '+${RATE_LIMIT_WINDOW_SECONDS} seconds'))
         ON CONFLICT(key) DO UPDATE SET count = count + 1
         RETURNING count`
      )
      .bind(key)
      .first<{ count: number }>()

    const count = result?.count || 1
    const remaining = Math.max(0, RATE_LIMIT_REQUESTS - count)

    // Opportunistic cleanup: delete expired rate limit entries.
    // Non-blocking — does not affect response time.
    cleanupExpiredRateLimits(db).catch((err) => {
      console.error('Rate limit cleanup failed:', err)
    })

    return {
      allowed: count <= RATE_LIMIT_REQUESTS,
      remaining,
      resetAt,
    }
  } catch (error) {
    // If rate limit table doesn't exist, allow request (graceful degradation)
    console.warn('Rate limit check failed, allowing request:', error)
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS, resetAt }
  }
}
