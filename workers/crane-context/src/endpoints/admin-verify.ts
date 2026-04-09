/**
 * Crane Context Worker - Admin Verify Schema Endpoint
 *
 * Plan v3.1 §D.2. Compares the live D1 sqlite_master against the
 * committed canonical schema hash. Surfaces drift that would otherwise
 * only be discovered when an endpoint tries to query a missing column.
 *
 *   GET /admin/verify-schema
 *     Auth: X-Admin-Key
 *     Response: {
 *       live_hash: string,
 *       expected_hash: string | null,
 *       matches: boolean,
 *       table_count: number,
 *       tables: string[],
 *       reason?: string  // if matches=false, explain the failure mode
 *     }
 *
 * The `expected_hash` is injected at build time from
 * workers/crane-context/migrations/schema.hash (via inject-version.mjs
 * into src/generated/build-info.ts). That file's hash is itself
 * authoritatively computed by scripts/compute-schema-hash.sh from the
 * base schema.sql + all incremental migrations.
 *
 * The live computation mirrors compute-schema-hash.sh's canonical format:
 * ORDER BY type DESC, name, with ';' + char(10) appended to every row,
 * SHA-256 of the concatenated string. This MUST match byte-for-byte what
 * the shell script produces; any divergence in the canonicalization logic
 * means false positives.
 */

import type { Env } from '../types'
import { verifyAdminKey } from './admin-shared'
import { BUILD_INFO } from '../generated/build-info'
import { jsonResponse, errorResponse, generateCorrelationId } from '../utils'
import { HTTP_STATUS } from '../constants'

/**
 * Web Crypto SHA-256 → hex string. Matches Node's `shasum -a 256` output.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function handleVerifySchema(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()
  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    // Query sqlite_master with the SAME canonical ordering as
    // scripts/compute-schema-hash.sh: type DESC, name ASC.
    // Filter out sqlite_% internal tables.
    const result = await env.DB.prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE type IN ('table','index')
         AND sql IS NOT NULL
         AND name NOT LIKE 'sqlite_%'
       ORDER BY type DESC, name ASC`
    ).all<{ type: string; name: string; sql: string }>()

    const rows = (result.results || []) as { type: string; name: string; sql: string }[]

    // Canonical format: each row's SQL followed by ';\n', concatenated.
    // Matches scripts/compute-schema-hash.sh line:
    //   SELECT sql || ';' || char(10) FROM sqlite_master ...
    const canonical = rows.map((r) => `${r.sql};\n`).join('')

    const liveHash = await sha256Hex(canonical)
    const expectedHash = BUILD_INFO.schema_hash ?? null

    const matches = expectedHash !== null && liveHash === expectedHash

    const tables = rows.filter((r) => r.type === 'table').map((r) => r.name)

    let reason: string | undefined
    if (!matches) {
      if (expectedHash === null) {
        reason =
          'build-info.ts has no schema_hash (inject-version was not run or schema.hash missing)'
      } else {
        reason = `live schema diverges from committed schema.hash — run 'bash workers/crane-context/scripts/compute-schema-hash.sh --update' if the codebase is correct, or investigate stray DDL on D1`
      }
    }

    return jsonResponse(
      {
        live_hash: liveHash,
        expected_hash: expectedHash,
        matches,
        table_count: tables.length,
        tables,
        reason,
        correlation_id: correlationId,
      },
      HTTP_STATUS.OK,
      correlationId
    )
  } catch (error) {
    console.error('GET /admin/verify-schema error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}
