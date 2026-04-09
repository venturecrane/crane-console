/**
 * Crane Context Worker - Version Endpoint
 *
 * Plan v3.1 §D.1. Public endpoint that reports what this worker believes
 * about its deployed state. Consumed by:
 *
 *   - system-readiness-audit.sh (invariant I-1: deployed commit matches main)
 *   - system-readiness-audit.sh (invariant I-1b: CF API cross-check)
 *   - system-readiness-audit.sh (invariant I-3: all committed migrations applied)
 *   - smoke-test-e2e.sh (scenario 1: /version reachable and consistent)
 *
 * Intentionally public (no X-Relay-Key or X-Admin-Key required) because:
 *   1. Readiness audit runs from CI without secrets
 *   2. /version exposes only non-sensitive build metadata
 *   3. The `features_enabled` field is a hardcoded allowlist; no env sweep
 *   4. `migrations_applied` reads the d1_migrations tracking table,
 *      which contains only migration file names (no user data)
 *
 * Response shape:
 *
 *   {
 *     "service": "crane-context",
 *     "commit": "a1b2c3d...",
 *     "commit_short": "a1b2c3d",
 *     "build_timestamp": "2026-04-09T03:20:00Z",
 *     "deployed_at": "2026-04-09T03:25:17Z",
 *     "schema_hash": "afe8ce3c...",
 *     "schema_version": 27,
 *     "migrations_applied": ["0003_add_context_docs.sql", ...],
 *     "features_enabled": { "NOTIFICATIONS_AUTO_RESOLVE_ENABLED": true },
 *     "environment": "production" | "staging"
 *   }
 */

import type { Env } from '../types'
import { BUILD_INFO } from '../generated/build-info'
import { jsonResponse, errorResponse } from '../utils'
import { HTTP_STATUS } from '../constants'

// Cold-start timestamp: the first time this module is loaded by the
// Cloudflare Workers runtime. Captured once and returned by every
// /version request until the next cold start (at which point it resets).
const COLD_START_AT = new Date().toISOString()

// Allowlist of env feature flags safe to expose via /version. DO NOT add
// secrets or any env variable that could carry sensitive data. Any flag
// added here becomes a public signal; treat that as a contract with
// downstream readiness audit invariants.
const FEATURE_FLAG_KEYS = ['NOTIFICATIONS_AUTO_RESOLVE_ENABLED'] as const
type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number]

function readFeatures(env: Env): Record<FeatureFlagKey, boolean> {
  const out = {} as Record<FeatureFlagKey, boolean>
  for (const key of FEATURE_FLAG_KEYS) {
    const raw = (env as unknown as Record<string, string | undefined>)[key]
    out[key] = raw === 'true'
  }
  return out
}

function detectEnvironment(env: Env): 'production' | 'staging' | 'unknown' {
  // Cloudflare sets `ENVIRONMENT` on env.production wrangler.toml blocks
  // via [env.production.vars] ENVIRONMENT = "production". If not set,
  // fall back to the D1 database name convention:
  // - crane-context-db-prod    → production
  // - crane-context-db-staging → staging
  const explicit = (env as unknown as { ENVIRONMENT?: string }).ENVIRONMENT
  if (explicit === 'production' || explicit === 'staging') return explicit
  // No explicit marker; rely on the binding name if we can infer it.
  // Cloudflare does not expose D1 binding names at runtime, so we fall
  // back to 'unknown' rather than guess.
  return 'unknown'
}

export async function handleGetVersion(request: Request, env: Env): Promise<Response> {
  try {
    // Read applied migrations from d1_migrations. If the table is missing,
    // return an empty array rather than erroring — the endpoint should
    // always respond, and invariant I-3 will flag the missing tracking.
    let migrations_applied: string[] = []
    let schema_version: number | null = null
    try {
      const result = await env.DB.prepare(`SELECT name FROM d1_migrations ORDER BY name`).all<{
        name: string
      }>()
      migrations_applied = (result.results || []).map((row) => row.name)

      // Extract the numeric schema version as the largest NNNN prefix
      // from any row of the form '00NN_*.sql'. Falls back to null if no
      // numeric migrations found.
      let max = 0
      for (const name of migrations_applied) {
        const m = name.match(/^(\d+)_/)
        if (m) {
          const n = parseInt(m[1], 10)
          if (Number.isFinite(n) && n > max) max = n
        }
      }
      schema_version = max > 0 ? max : null
    } catch {
      // d1_migrations does not exist yet (pre-H-1 state) or another SQL
      // error. Return what we have; readiness audit will flag the gap.
      migrations_applied = []
      schema_version = null
    }

    return jsonResponse(
      {
        service: BUILD_INFO.service,
        commit: BUILD_INFO.commit,
        commit_short: BUILD_INFO.commit_short,
        build_timestamp: BUILD_INFO.build_timestamp,
        deployed_at: COLD_START_AT,
        schema_hash: BUILD_INFO.schema_hash ?? null,
        schema_version,
        migrations_applied,
        features_enabled: readFeatures(env),
        environment: detectEnvironment(env),
      },
      HTTP_STATUS.OK
    )
  } catch (error) {
    console.error('GET /version error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR
    )
  }
}
