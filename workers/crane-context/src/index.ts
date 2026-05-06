/**
 * Crane Context Worker - Main Entry Point
 *
 * Cloudflare Worker for Crane session and handoff management.
 * Implements ADR 025 specification.
 */

import type { Env } from './types'
import {
  routePublic,
  routeSessions,
  routeQueries,
  routeNotifications,
  routeContent,
  routeDeployHeartbeats,
  routeInfra,
  routeAdmin,
} from './router'
import { runReconciliation } from './deploy-heartbeats-reconcile'
import { runStaleBranchSweep } from './notifications'
import { runActivityRetention } from './endpoints/session-activity'
import { errorResponse } from './utils'
import { HTTP_STATUS } from './constants'

// ============================================================================
// Main Worker Export
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname, searchParams } = url
    const method = request.method

    console.log(`[${method}] ${pathname}`, {
      searchParams: Object.fromEntries(searchParams),
    })

    try {
      const routers = [
        routePublic,
        routeSessions,
        routeQueries,
        routeNotifications,
        routeContent,
        routeDeployHeartbeats,
        routeInfra,
        routeAdmin,
      ]

      for (const router of routers) {
        const response = await router(pathname, method, request, env)
        if (response !== null) return response
      }

      return errorResponse(`Endpoint not found: ${method} ${pathname}`, HTTP_STATUS.NOT_FOUND)
    } catch (error) {
      console.error('Worker error:', {
        method,
        pathname,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR)
    }
  },

  // ============================================================================
  // Scheduled trigger — deploy-heartbeats reconciliation (#454)
  // ============================================================================
  //
  // Fires every 6 hours per wrangler.toml [[triggers]] cron. Walks every
  // active heartbeat row and catches up any missed webhook deliveries
  // from GitHub. No-op if GH_TOKEN secret is not configured. Uses
  // waitUntil to keep the reconciliation running past the initial
  // scheduled event.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`scheduled: ${event.cron} fired at ${new Date().toISOString()}`)
    ctx.waitUntil(runReconciliation(env))
    // Issue #563: sweep stale non-main notifications older than 7 days. This
    // is the cron backstop for the branch-deleted path — branches that were
    // force-pushed, rebased away, or abandoned without an explicit `delete`
    // webhook get aged out here.
    ctx.waitUntil(
      runStaleBranchSweep(env.DB).catch((err) => {
        console.error('stale-branch sweep error:', err)
      })
    )
    // 0043: bound D1 growth by deleting session_activity rows older than the
    // retention window. Cheap (indexed range delete); running it on every
    // scheduled fire keeps the working set small.
    ctx.waitUntil(
      runActivityRetention(env.DB).catch((err) => {
        console.error('session-activity retention sweep error:', err)
      })
    )

    // 0046 / PR 2: daily memory-curator pass. Discriminate on the cron
    // pattern - "17 4 * * *" is the curator cron; the 6-hourly / hourly
    // pattern is the deploy-heartbeats reconciliation already handled
    // above. Only fire the curator on the curator pattern so we don't
    // run it 6x/day.
    if (event.cron === '17 4 * * *') {
      ctx.waitUntil(
        (async () => {
          try {
            const { runMemoryCurator } = await import('./lib/memory-curator')
            const report = await runMemoryCurator(env)
            console.log(
              `memory-curator: ${report.total_memories} memories scored, ${report.all_pass_count} all-pass, ${report.needs_review_count} need review, ${report.parse_error_count} parse errors`
            )
          } catch (err) {
            console.error('memory-curator error:', err)
          }
        })()
      )
    }
  },
}
