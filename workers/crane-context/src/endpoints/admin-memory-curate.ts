/**
 * POST /admin/memory/curate - manually trigger the daily curator pass.
 *
 * The cron (wrangler.toml triggers `17 4 * * *`) calls this on a schedule.
 * Captain or operators can also POST here for an out-of-band run, e.g.
 * after a corpus migration or when validating new curator logic.
 *
 * Auth: X-Admin-Key (CONTEXT_ADMIN_KEY).
 *
 * Returns the full CuratorReport. The shape is suitable for spot-checking
 * what the daily run will produce before flipping MEMORY_INJECTION_GATE
 * out of bake-in mode.
 */

import type { Env } from '../types'
import { runMemoryCurator } from '../lib/memory-curator'
import { jsonResponse, errorResponse } from '../utils'
import { HTTP_STATUS } from '../constants'
import { verifyAdminKey } from './admin-shared'

export async function handleAdminMemoryCurate(request: Request, env: Env): Promise<Response> {
  const correlationId = request.headers.get('X-Correlation-Id') ?? `corr_${crypto.randomUUID()}`

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED, correlationId)
  }

  try {
    const report = await runMemoryCurator(env)
    return jsonResponse({ report, correlation_id: correlationId }, HTTP_STATUS.OK, correlationId)
  } catch (err) {
    console.error('POST /admin/memory/curate error:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }
}
